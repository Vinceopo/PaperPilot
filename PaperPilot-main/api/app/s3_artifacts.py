"""Upload/download JSON sidecars on S3 so RTDB stays metadata-only.

Deterministic object keys:
  paperpilot/{uid}/mechanics/{mechanics_id}.json
  paperpilot/{uid}/manuscripts/{mid}/versions/{vid}/parsed.json
  paperpilot/{uid}/manuscripts/{mid}/versions/{vid}/scans/{scan_id}.json
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.config import settings
from app.s3_storage import S3StorageError, fetch_s3_bytes, s3_configured, upload_bytes

log = logging.getLogger("paperpilot.s3_artifacts")

_JSON_BYTE_LIMIT = 25_000_000


def artifacts_enabled() -> bool:
    return s3_configured() and bool((settings.aws_s3_bucket or "").strip())


def mechanics_public_id(owner_uid: str, mechanics_id: str) -> str:
    return f"paperpilot/{owner_uid}/mechanics/{mechanics_id}.json"


def parsed_public_id(owner_uid: str, manuscript_id: str, version_id: str) -> str:
    return f"paperpilot/{owner_uid}/manuscripts/{manuscript_id}/versions/{version_id}/parsed.json"


def scan_public_id(owner_uid: str, manuscript_id: str, version_id: str, scan_id: str) -> str:
    return (
        f"paperpilot/{owner_uid}/manuscripts/{manuscript_id}/versions/{version_id}"
        f"/scans/{scan_id}.json"
    )


def upload_json_artifact(public_id: str, payload: dict[str, Any]) -> str:
    """PutObject JSON sidecar. Returns public HTTPS URL. Raises S3StorageError on failure."""
    if not artifacts_enabled():
        raise S3StorageError("Amazon S3 is not configured for JSON artifacts.")
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    if len(body) > _JSON_BYTE_LIMIT:
        raise S3StorageError(f"JSON artifact exceeds {_JSON_BYTE_LIMIT} bytes.")
    return upload_bytes(public_id, body, content_type="application/json")


def download_json_artifact(url: str) -> dict[str, Any]:
    """Fetch a JSON sidecar. Empty/invalid → raise; missing URL → {}."""
    raw_url = (url or "").strip()
    if not raw_url:
        return {}
    try:
        data, _hint = fetch_s3_bytes(raw_url, max_bytes=_JSON_BYTE_LIMIT)
    except S3StorageError:
        log.warning("Failed to download JSON artifact from S3")
        raise
    try:
        parsed = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise S3StorageError("S3 artifact is not valid JSON.") from exc
    return parsed if isinstance(parsed, dict) else {}


def try_upload_json_artifact(public_id: str, payload: dict[str, Any]) -> str | None:
    """Upload when S3 is configured; otherwise return None (caller may RTDB-fallback)."""
    if not artifacts_enabled():
        return None
    try:
        return upload_json_artifact(public_id, payload)
    except S3StorageError as exc:
        log.error("JSON artifact upload failed for %s: %s", public_id, exc)
        raise
