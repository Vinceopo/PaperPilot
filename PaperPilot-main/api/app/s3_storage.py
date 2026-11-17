"""Amazon S3 helpers: presigned uploads, PutObject, public URLs, SSRF-safe GET."""
from __future__ import annotations

import re
import ssl
import uuid
from functools import lru_cache
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.config import document_byte_limit, settings

_SAFE_FILENAME = re.compile(r"[^A-Za-z0-9._-]+")


class S3StorageError(ValueError):
    pass


def s3_configured() -> bool:
    return bool(
        (settings.aws_access_key_id or "").strip()
        and (settings.aws_secret_access_key or "").strip()
        and (settings.aws_s3_bucket or "").strip()
        and (settings.aws_region or "").strip()
    )


def _bucket() -> str:
    return (settings.aws_s3_bucket or "").strip()


def _region() -> str:
    return (settings.aws_region or "ap-southeast-2").strip()


@lru_cache(maxsize=1)
def _s3_client():
    if not s3_configured():
        raise S3StorageError("Amazon S3 is not configured on the server.")
    region = _region()
    # Force regional endpoint + virtual-hosted URLs so presigned PUTs do not
    # hit the legacy global host (s3.amazonaws.com → 307 → signature break).
    return boto3.client(
        "s3",
        region_name=region,
        endpoint_url=f"https://s3.{region}.amazonaws.com",
        aws_access_key_id=settings.aws_access_key_id.strip(),
        aws_secret_access_key=settings.aws_secret_access_key.strip(),
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "virtual"},
        ),
    )


def clear_s3_client_cache() -> None:
    """Test helper so settings patches take effect."""
    _s3_client.cache_clear()


def sanitize_filename(filename: str) -> str:
    name = Path((filename or "document").strip()).name or "document"
    cleaned = _SAFE_FILENAME.sub("_", name).strip("._") or "document"
    return cleaned[:180]


def upload_object_key(owner_uid: str, filename: str) -> str:
    safe = sanitize_filename(filename)
    return f"paperpilot/{owner_uid}/uploads/{uuid.uuid4().hex}_{safe}"


def public_object_url(key: str) -> str:
    bucket = _bucket()
    region = _region()
    cleaned = (key or "").lstrip("/")
    return f"https://{bucket}.s3.{region}.amazonaws.com/{cleaned}"


def _allowed_hosts() -> set[str]:
    bucket = _bucket().lower()
    region = _region().lower()
    return {
        f"{bucket}.s3.{region}.amazonaws.com",
        f"{bucket}.s3.dualstack.{region}.amazonaws.com",
        f"{bucket}.s3.amazonaws.com",
        f"s3.{region}.amazonaws.com",
        f"s3.dualstack.{region}.amazonaws.com",
        "s3.amazonaws.com",
    }


def _host_allowed(hostname: str | None) -> bool:
    if not hostname:
        return False
    host = hostname.lower().rstrip(".")
    return host in _allowed_hosts()


def _key_from_url(parsed) -> str | None:
    """Extract object key from virtual-hosted or path-style S3 URL for this bucket."""
    bucket = _bucket().lower()
    host = (parsed.hostname or "").lower().rstrip(".")
    path = unquote(parsed.path or "")
    parts = [p for p in path.split("/") if p]

    if host.startswith(f"{bucket}."):
        return "/".join(parts) if parts else None

    # Path-style: /{bucket}/{key...}
    if host in {
        f"s3.{_region().lower()}.amazonaws.com",
        f"s3.dualstack.{_region().lower()}.amazonaws.com",
        "s3.amazonaws.com",
    }:
        if len(parts) >= 2 and parts[0].lower() == bucket:
            return "/".join(parts[1:])
    return None


def assert_s3_public_url(url: str) -> str:
    """Validate HTTPS URL belongs to configured bucket; return stripped URL."""
    raw = (url or "").strip()
    if not raw.startswith("https://"):
        raise S3StorageError("Document URL must use HTTPS.")
    parsed = urlparse(raw)
    if not _host_allowed(parsed.hostname):
        raise S3StorageError("URL host is not the configured S3 bucket.")
    key = _key_from_url(parsed)
    if not key:
        raise S3StorageError("URL is not a valid object in the configured S3 bucket.")
    return raw


def presign_put(
    key: str,
    content_type: str | None = None,
    *,
    expires_in: int = 900,
) -> str:
    """Return a presigned PUT URL (HttpMethod=PUT).

    ContentType is intentionally omitted from the signature Params so
    SignedHeaders is only ``host``. Browsers and XHR clients often send a
    different or empty Content-Type than the value used at sign time; including
    it in the signature causes SignatureDoesNotMatch. Clients may still send
    Content-Type on the PUT to set object metadata — it is not signed.
    """
    if not s3_configured():
        raise S3StorageError("Amazon S3 is not configured on the server.")
    # content_type kept in the signature for API compatibility; unused for signing.
    _ = content_type
    try:
        return _s3_client().generate_presigned_url(
            "put_object",
            Params={
                "Bucket": _bucket(),
                "Key": key,
            },
            ExpiresIn=expires_in,
            HttpMethod="PUT",
        )
    except (BotoCoreError, ClientError) as exc:
        raise S3StorageError(f"Could not create upload URL: {exc}") from exc


def upload_bytes(
    key: str,
    data: bytes,
    *,
    content_type: str = "application/octet-stream",
) -> str:
    """PutObject and return the public HTTPS URL."""
    if not s3_configured():
        raise S3StorageError("Amazon S3 is not configured on the server.")
    try:
        # Public read comes from the bucket policy (Object Ownership: Bucket owner enforced).
        _s3_client().put_object(
            Bucket=_bucket(),
            Key=key,
            Body=data,
            ContentType=content_type,
        )
    except (BotoCoreError, ClientError) as exc:
        raise S3StorageError(f"S3 upload failed: {exc}") from exc
    return public_object_url(key)


def _read_limited(response, limit: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = response.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise S3StorageError(f"File exceeds the {limit} byte download limit.")
        chunks.append(chunk)
    return b"".join(chunks)


def fetch_s3_bytes(url: str, max_bytes: int | None = None) -> tuple[bytes, str]:
    """Return (bytes, filename_hint). Raises S3StorageError on failure.

    Prefer authenticated GetObject so analysis works even when the bucket is
    private (browser preview still needs a public GetObject bucket policy).
    Fall back to HTTPS GET for rare cases where the key cannot be parsed.
    """
    limit = max_bytes if max_bytes is not None else document_byte_limit()
    raw = assert_s3_public_url(url)
    parsed = urlparse(raw)
    filename = Path(unquote(parsed.path)).name or "document"
    key = _key_from_url(parsed)

    if key and s3_configured():
        try:
            obj = _s3_client().get_object(Bucket=_bucket(), Key=key)
            body = obj["Body"]
            try:
                return _read_limited(body, limit), filename
            finally:
                try:
                    body.close()
                except Exception:
                    pass
        except ClientError as exc:
            code = (exc.response or {}).get("Error", {}).get("Code", "")
            status = (exc.response or {}).get("ResponseMetadata", {}).get("HTTPStatusCode")
            raise S3StorageError(f"S3 download failed ({status or code or 'error'}).") from exc
        except (BotoCoreError, OSError) as exc:
            raise S3StorageError(f"Could not download file: {exc}") from exc

    request = Request(raw, method="GET", headers={"User-Agent": "PaperPilot/1.0"})
    try:
        with urlopen(request, timeout=180, context=ssl.create_default_context()) as response:
            return _read_limited(response, limit), filename
    except S3StorageError:
        raise
    except HTTPError as exc:
        raise S3StorageError(f"S3 download failed ({exc.code}).") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise S3StorageError(f"Could not download file: {exc}") from exc
