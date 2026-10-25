"""Finalize in-flight scans by polling the Render ML service."""

from __future__ import annotations

import base64
import logging
from datetime import datetime, timedelta, timezone

from app.cloudinary_fetch import CloudinaryFetchError, fetch_cloudinary_bytes
from app.compliance_db import (
    finalize_scan_from_ml,
    get_mechanics,
    get_scan,
    get_version_document_url,
    get_version_full,
    is_paid_tier,
    mark_scan_ml_requeued,
    subscription_snapshot,
)
from app.ml_service_client import (
    MLServiceError,
    create_analyze_job,
    get_analyze_progress,
    get_analyze_result,
    ml_service_configured,
)

logger = logging.getLogger("paperpilot.scan_ml_sync")

FAILED_SCAN_MESSAGE = "The analysis could not finish. No scan was used. Run the scan again."
LOST_SCAN_MESSAGE = (
    "The analysis server lost this scan before it finished. No scan was used. Run the scan again."
)
STALE_SCAN_MESSAGE = "The analysis took too long and was stopped. No scan was used. Run the scan again."
STALE_AFTER = timedelta(minutes=30)
# Render cold-starts and concurrent load can briefly 404 a job that is still queued.
LOST_GRACE = timedelta(seconds=120)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_created(scan: dict) -> datetime | None:
    text = str(scan.get("created_at") or "").strip()
    if not text:
        return None
    try:
        created = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return created


def _is_stale(scan: dict) -> bool:
    created = _parse_created(scan)
    return bool(created and _now() - created > STALE_AFTER)


def _within_lost_grace(scan: dict) -> bool:
    created = _parse_created(scan)
    return bool(created and _now() - created <= LOST_GRACE)


def _feature_tier(tier: str) -> str:
    return "premium" if is_paid_tier(tier) else "free"


def _scan_rules(rules: dict, ignored_fields: list[str] | None = None) -> dict:
    from app.mechanics_validate import apply_ignored_fields_to_rules

    out = apply_ignored_fields_to_rules(rules or {}, ignored_fields)
    style = str(out.get("citation_style") or "").strip().upper()
    if style == "CHICAGO":
        out["citation_style"] = "APA"
    return out


def _fail(owner_uid: str, scan_id: str, message: str) -> dict:
    return finalize_scan_from_ml(owner_uid, scan_id, {}, failed=True, error=message)


def _try_requeue_ml_job(owner_uid: str, scan: dict) -> bool:
    """Re-submit a lost ML job once so concurrent users recover after an instance recycle."""
    if scan.get("ml_requeued"):
        return False
    if not ml_service_configured():
        return False

    scan_id = str(scan.get("id") or "")
    manuscript_id = str(scan.get("manuscript_id") or "")
    version_id = str(scan.get("manuscript_version_id") or "")
    mechanics_id = str(scan.get("mechanics_id") or "")
    job_id = str(scan.get("ml_job_id") or scan_id)
    if not all([scan_id, manuscript_id, version_id, mechanics_id, job_id]):
        return False

    version = get_version_full(owner_uid, manuscript_id, version_id)
    mechanics = get_mechanics(owner_uid, mechanics_id)
    if not version or not mechanics:
        return False

    document_url = (version.get("cloudinary_url") or "").strip() or get_version_document_url(
        owner_uid, manuscript_id, version_id
    )
    if not document_url:
        return False

    try:
        raw_bytes, _hint = fetch_cloudinary_bytes(document_url)
    except (CloudinaryFetchError, Exception) as exc:
        logger.warning("Requeue fetch failed for scan %s: %s", scan_id, exc)
        return False

    tier = _feature_tier(subscription_snapshot(owner_uid).get("tier") or "free")
    if not mark_scan_ml_requeued(owner_uid, scan_id):
        return False
    try:
        create_analyze_job(
            job_id=job_id,
            document_url=None,
            document_base64=base64.b64encode(raw_bytes).decode("ascii"),
            filename=version.get("source_filename") or "document.pdf",
            mechanics_rules=_scan_rules(
                mechanics.get("rules") or {}, mechanics.get("ignored_fields")
            ),
            tier=tier,
        )
        logger.info("Requeued ML job %s for scan %s", job_id, scan_id)
        return True
    except MLServiceError as exc:
        logger.warning("Requeue create failed for scan %s: %s", scan_id, exc)
        return False
    except Exception as exc:
        logger.warning("Requeue failed for scan %s: %s", scan_id, exc)
        return False


def _handle_missing_job(owner_uid: str, scan_id: str, scan: dict) -> dict | None:
    """404 from ML: wait during grace, requeue once, then fail."""
    if _within_lost_grace(scan) and not scan.get("ml_requeued"):
        # Brand-new job may not be visible yet under load; keep polling.
        return scan
    if _try_requeue_ml_job(owner_uid, scan):
        return get_scan(owner_uid, scan_id) or scan
    if _within_lost_grace(scan):
        return get_scan(owner_uid, scan_id) or scan
    return _fail(owner_uid, scan_id, LOST_SCAN_MESSAGE)


def hydrate_scan_from_ml(owner_uid: str, scan_id: str) -> dict | None:
    """If the scan is still running, poll ML and persist results when ready."""
    scan = get_scan(owner_uid, scan_id)
    if not scan or scan.get("status") != "running":
        return scan
    if not ml_service_configured():
        return scan

    job_id = str(scan.get("ml_job_id") or scan_id)
    try:
        progress = get_analyze_progress(job_id)
    except MLServiceError as exc:
        if exc.status_code == 404:
            return _handle_missing_job(owner_uid, scan_id, scan)
        if _is_stale(scan):
            return _fail(owner_uid, scan_id, STALE_SCAN_MESSAGE)
        raise
    stage = str(progress.get("stage") or "")
    status = str(progress.get("status") or "")

    if status == "failed" or stage == "failed":
        return _fail(owner_uid, scan_id, str(progress.get("message") or FAILED_SCAN_MESSAGE))

    if status != "done" and stage != "done":
        if _is_stale(scan):
            return _fail(owner_uid, scan_id, STALE_SCAN_MESSAGE)
        return scan

    result = get_analyze_result(job_id)
    if result.get("status") == "failed":
        return _fail(
            owner_uid,
            scan_id,
            str(result.get("error") or result.get("message") or FAILED_SCAN_MESSAGE),
        )

    return finalize_scan_from_ml(owner_uid, scan_id, result)


def scan_progress_payload(owner_uid: str, scan_id: str) -> dict | None:
    scan = get_scan(owner_uid, scan_id)
    if not scan:
        return None
    if scan.get("status") == "done":
        return {
            "scan_id": scan_id,
            "job_id": scan.get("ml_job_id") or scan_id,
            "stage": "done",
            "percent": 100,
            "message": "Analysis complete",
            "status": "done",
        }
    if scan.get("status") == "failed":
        return {
            "scan_id": scan_id,
            "job_id": scan.get("ml_job_id") or scan_id,
            "stage": "failed",
            "percent": 100,
            "message": scan.get("error") or FAILED_SCAN_MESSAGE,
            "status": "failed",
        }
    if not ml_service_configured():
        return {
            "scan_id": scan_id,
            "job_id": scan.get("ml_job_id") or scan_id,
            "stage": "checking",
            "percent": 50,
            "message": "Analysis in progress",
            "status": "running",
        }

    job_id = str(scan.get("ml_job_id") or scan_id)
    try:
        progress = get_analyze_progress(job_id)
    except MLServiceError as exc:
        if exc.status_code == 404:
            updated = _handle_missing_job(owner_uid, scan_id, scan)
            if updated and updated.get("status") == "failed":
                return {
                    "scan_id": scan_id,
                    "job_id": job_id,
                    "stage": "failed",
                    "percent": 100,
                    "message": updated.get("error") or LOST_SCAN_MESSAGE,
                    "status": "failed",
                }
            return {
                "scan_id": scan_id,
                "job_id": job_id,
                "stage": "parsing",
                "percent": 4,
                "message": "Downloading document",
                "status": "running",
            }
        if _is_stale(scan):
            failed = _fail(owner_uid, scan_id, STALE_SCAN_MESSAGE)
            return {
                "scan_id": scan_id,
                "job_id": job_id,
                "stage": "failed",
                "percent": 100,
                "message": failed.get("error") or FAILED_SCAN_MESSAGE,
                "status": "failed",
            }
        # Temporary outage: keep the scan running so the client keeps polling.
        return {
            "scan_id": scan_id,
            "job_id": job_id,
            "stage": "checking",
            "percent": None,
            "message": "Reconnecting to the analysis server…",
            "status": "running",
        }

    if progress.get("status") == "done" or progress.get("stage") == "done":
        hydrate_scan_from_ml(owner_uid, scan_id)
    elif (progress.get("status") == "failed" or progress.get("stage") == "failed") or _is_stale(scan):
        hydrate_scan_from_ml(owner_uid, scan_id)
        refreshed = get_scan(owner_uid, scan_id) or {}
        if refreshed.get("status") == "failed":
            return {
                "scan_id": scan_id,
                "job_id": job_id,
                "stage": "failed",
                "percent": 100,
                "message": refreshed.get("error") or FAILED_SCAN_MESSAGE,
                "status": "failed",
            }

    return {
        "scan_id": scan_id,
        "job_id": job_id,
        "stage": progress.get("stage"),
        "percent": progress.get("percent"),
        "message": progress.get("message"),
        "status": progress.get("status"),
    }
