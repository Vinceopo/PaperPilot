"""Download document bytes from Cloudinary with SSRF protection.

Cloudinary often returns HTTP 401 for public delivery of PDF/ZIP/raw assets
(security setting: restricted file formats). When that happens, fall back to a
short-lived signed Admin API download using CLOUDINARY_API_KEY/SECRET.
"""
from __future__ import annotations

import hashlib
import ssl
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlparse
from urllib.request import Request, urlopen

from app.config import settings

_ALLOWED_HOST_SUFFIXES = (
    "res.cloudinary.com",
    "cloudinary.com",
)

# Delivery path: /<resource_type>/<type>/v<version>/<public_id>
# e.g. /raw/upload/v1790107983/folder/file.pdf
_RESOURCE_TYPES = frozenset({"raw", "image", "video", "auto"})
_DELIVERY_TYPES = frozenset(
    {"upload", "authenticated", "private", "fetch", "list", "facebook", "twitter"}
)


class CloudinaryFetchError(ValueError):
    pass


def _host_allowed(hostname: str | None) -> bool:
    if not hostname:
        return False
    host = hostname.lower().rstrip(".")
    if any(host == suffix or host.endswith("." + suffix) for suffix in _ALLOWED_HOST_SUFFIXES):
        return True
    return False


def _read_limited(response, limit: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = response.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise CloudinaryFetchError(f"File exceeds the {limit} byte download limit.")
        chunks.append(chunk)
    return b"".join(chunks)


def _parse_delivery_url(url: str) -> tuple[str, str, str, str]:
    """Return (cloud_name, resource_type, delivery_type, public_id)."""
    parsed = urlparse(url)
    parts = [p for p in (parsed.path or "").split("/") if p]
    # Expect: <cloud>/<resource_type>/<type>/vNNN/<public_id...>
    if len(parts) < 5:
        raise CloudinaryFetchError("Could not parse Cloudinary delivery URL.")
    cloud, resource_type, delivery_type, version, *id_parts = parts
    if resource_type not in _RESOURCE_TYPES or delivery_type not in _DELIVERY_TYPES:
        raise CloudinaryFetchError("Unsupported Cloudinary delivery URL shape.")
    if not version.startswith("v") or not version[1:].isdigit():
        raise CloudinaryFetchError("Cloudinary URL is missing a version segment.")
    public_id = "/".join(id_parts)
    if not public_id:
        raise CloudinaryFetchError("Cloudinary URL is missing a public_id.")
    return cloud, resource_type, delivery_type, public_id


def _signed_admin_download(
    cloud: str,
    resource_type: str,
    delivery_type: str,
    public_id: str,
    max_bytes: int,
) -> bytes:
    api_key = (settings.cloudinary_api_key or "").strip()
    api_secret = (settings.cloudinary_api_secret or "").strip()
    if not api_key or not api_secret:
        raise CloudinaryFetchError(
            "Cloudinary asset requires authenticated download, but "
            "CLOUDINARY_API_KEY/SECRET are not configured on the server."
        )
    expected_cloud = (settings.cloudinary_cloud_name or "").strip()
    if expected_cloud and cloud != expected_cloud:
        raise CloudinaryFetchError("Cloudinary URL cloud name does not match server config.")

    timestamp = str(int(time.time()))
    # Sign only the params Cloudinary includes in the string-to-sign (not resource_type).
    sign_params = {
        "public_id": public_id,
        "timestamp": timestamp,
        "type": delivery_type,
    }
    to_sign = (
        "&".join(f"{k}={sign_params[k]}" for k in sorted(sign_params)) + api_secret
    )
    signature = hashlib.sha1(to_sign.encode("utf-8")).hexdigest()
    query = urlencode(
        {
            **sign_params,
            "api_key": api_key,
            "signature": signature,
        }
    )
    # public_id may contain slashes; urlencode handles that. Path uses resource_type only.
    download_url = (
        f"https://api.cloudinary.com/v1_1/{quote(cloud, safe='')}/"
        f"{quote(resource_type, safe='')}/download?{query}"
    )
    request = Request(
        download_url,
        method="GET",
        headers={"User-Agent": "PaperPilot/1.0"},
    )
    try:
        with urlopen(request, timeout=60, context=ssl.create_default_context()) as response:
            return _read_limited(response, max_bytes)
    except HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", errors="replace")[:300]
        except Exception:
            detail = ""
        raise CloudinaryFetchError(
            f"Cloudinary authenticated download failed ({exc.code})."
            + (f" {detail}" if detail else "")
        ) from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise CloudinaryFetchError(f"Could not download file: {exc}") from exc


def fetch_cloudinary_bytes(url: str, max_bytes: int | None = None) -> tuple[bytes, str]:
    """Return (bytes, filename_hint). Raises CloudinaryFetchError on failure."""
    limit = max_bytes if max_bytes is not None else settings.max_upload_bytes
    raw = (url or "").strip()
    if not raw.startswith("https://"):
        raise CloudinaryFetchError("Cloudinary URL must use HTTPS.")
    parsed = urlparse(raw)
    if not _host_allowed(parsed.hostname):
        raise CloudinaryFetchError("URL host is not an allowed Cloudinary host.")

    filename = parsed.path.rsplit("/", 1)[-1] or "document"
    request = Request(raw, method="GET", headers={"User-Agent": "PaperPilot/1.0"})
    try:
        with urlopen(request, timeout=60, context=ssl.create_default_context()) as response:
            return _read_limited(response, limit), filename
    except CloudinaryFetchError:
        raise
    except HTTPError as exc:
        if exc.code != 401:
            raise CloudinaryFetchError(f"Cloudinary download failed ({exc.code}).") from exc
        # Restricted PDF/ZIP/raw delivery — use signed Admin download.
        cloud, resource_type, delivery_type, public_id = _parse_delivery_url(raw)
        data = _signed_admin_download(
            cloud, resource_type, delivery_type, public_id, limit
        )
        return data, filename
    except (URLError, TimeoutError, OSError) as exc:
        raise CloudinaryFetchError(f"Could not download file: {exc}") from exc
