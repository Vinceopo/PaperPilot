"""Upload/download JSON sidecars on Cloudinary so RTDB stays metadata-only.

Deterministic public_ids:
  paperpilot/{uid}/mechanics/{mechanics_id}
  paperpilot/{uid}/manuscripts/{mid}/versions/{vid}/parsed
  paperpilot/{uid}/manuscripts/{mid}/versions/{vid}/scans/{scan_id}
"""
from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Any
from urllib.parse import quote

import httpx

from app.cloudinary_fetch import CloudinaryFetchError, fetch_cloudinary_bytes
from app.config import settings

log = logging.getLogger("paperpilot.cloudinary_artifacts")

_JSON_BYTE_LIMIT = 25_000_000


def artifacts_enabled() -> bool:
    return bool(
        (settings.cloudinary_cloud_name or "").strip()
        and (settings.cloudinary_api_key or "").strip()
        and (settings.cloudinary_api_secret or "").strip()
    )


def mechanics_public_id(owner_uid: str, mechanics_id: str) -> str:
    return f"paperpilot/{owner_uid}/mechanics/{mechanics_id}"


def parsed_public_id(owner_uid: str, manuscript_id: str, version_id: str) -> str:
    return f"paperpilot/{owner_uid}/manuscripts/{manuscript_id}/versions/{version_id}/parsed"


def scan_public_id(owner_uid: str, manuscript_id: str, version_id: str, scan_id: str) -> str:
    return (
        f"paperpilot/{owner_uid}/manuscripts/{manuscript_id}/versions/{version_id}/scans/{scan_id}"
    )


def upload_json_artifact(public_id: str, payload: dict[str, Any]) -> str:
    """Signed raw upload. Returns secure_url. Raises CloudinaryFetchError on failure."""
    if not artifacts_enabled():
        raise CloudinaryFetchError("Cloudinary is not configured for JSON artifacts.")
    cloud = settings.cloudinary_cloud_name.strip()
    api_key = settings.cloudinary_api_key.strip()
    api_secret = settings.cloudinary_api_secret.strip()
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    if len(body) > _JSON_BYTE_LIMIT:
        raise CloudinaryFetchError(f"JSON artifact exceeds {_JSON_BYTE_LIMIT} bytes.")

    timestamp = str(int(time.time()))
    # Cloudinary signed upload: alphabetically sorted params + secret.
    sign_params = {
        "public_id": public_id,
        "timestamp": timestamp,
    }
    to_sign = "&".join(f"{k}={sign_params[k]}" for k in sorted(sign_params)) + api_secret
    signature = hashlib.sha1(to_sign.encode("utf-8")).hexdigest()

    endpoint = f"https://api.cloudinary.com/v1_1/{quote(cloud, safe='')}/raw/upload"
    files = {
        "file": (f"{public_id.rsplit('/', 1)[-1]}.json", body, "application/json"),
    }
    data = {
        "api_key": api_key,
        "timestamp": timestamp,
        "public_id": public_id,
        "signature": signature,
    }
    try:
        with httpx.Client(timeout=120.0) as client:
            res = client.post(endpoint, data=data, files=files)
    except httpx.HTTPError as exc:
        raise CloudinaryFetchError(f"Cloudinary JSON upload failed: {exc}") from exc
    if res.status_code >= 400:
        detail = (res.text or "")[:400]
        raise CloudinaryFetchError(
            f"Cloudinary JSON upload failed ({res.status_code}). {detail}".strip()
        )
    try:
        parsed = res.json()
    except ValueError as exc:
        raise CloudinaryFetchError("Cloudinary JSON upload returned non-JSON.") from exc
    url = (parsed.get("secure_url") or parsed.get("url") or "").strip()
    if not url:
        raise CloudinaryFetchError("Cloudinary JSON upload returned no URL.")
    return url


def download_json_artifact(url: str) -> dict[str, Any]:
    """Fetch a JSON sidecar. Empty/invalid → {}."""
    raw_url = (url or "").strip()
    if not raw_url:
        return {}
    try:
        data, _hint = fetch_cloudinary_bytes(raw_url, max_bytes=_JSON_BYTE_LIMIT)
    except CloudinaryFetchError:
        log.warning("Failed to download JSON artifact from Cloudinary")
        raise
    try:
        parsed = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CloudinaryFetchError("Cloudinary artifact is not valid JSON.") from exc
    return parsed if isinstance(parsed, dict) else {}


def try_upload_json_artifact(public_id: str, payload: dict[str, Any]) -> str | None:
    """Upload when Cloudinary is configured; otherwise return None (caller may RTDB-fallback)."""
    if not artifacts_enabled():
        return None
    try:
        return upload_json_artifact(public_id, payload)
    except CloudinaryFetchError as exc:
        log.error("JSON artifact upload failed for %s: %s", public_id, exc)
        raise
