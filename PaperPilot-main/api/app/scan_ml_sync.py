"""Finalize in-flight scans by polling the Render ML service."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.compliance_db import finalize_scan_from_ml, get_scan
from app.ml_service_client import (
    MLServiceError,
    get_analyze_progress,
    get_analyze_result,
    ml_service_configured,
)

FAILED_SCAN_MESSAGE = "The analysis could not finish. No scan was used. Run the scan again."
LOST_SCAN_MESSAGE = (
    "The analysis server lost this scan before it finished. No scan was used. Run the scan again."
)
STALE_SCAN_MESSAGE = "The analysis took too long and was stopped. No scan was used. Run the scan again."
STALE_AFTER = timedelta(minutes=30)


def _is_stale(scan: dict) -> bool:
    text = str(scan.get("created_at") or "").strip()
    if not text:
        return False
    try:
        created = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return False
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - created > STALE_AFTER


def _fail(owner_uid: str, scan_id: str, message: str) -> dict:
    return finalize_scan_from_ml(owner_uid, scan_id, {}, failed=True, error=message)


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
            return _fail(owner_uid, scan_id, LOST_SCAN_MESSAGE)
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
        if exc.status_code == 404 or _is_stale(scan):
            failed = _fail(
                owner_uid, scan_id, LOST_SCAN_MESSAGE if exc.status_code == 404 else STALE_SCAN_MESSAGE
            )
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
