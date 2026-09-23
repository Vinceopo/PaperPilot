"""Finalize in-flight scans by polling the Render ML service."""

from __future__ import annotations

from app.compliance_db import finalize_scan_from_ml, get_scan
from app.ml_service_client import (
    MLServiceError,
    get_analyze_progress,
    get_analyze_result,
    ml_service_configured,
)


def hydrate_scan_from_ml(owner_uid: str, scan_id: str) -> dict | None:
    """If the scan is still running, poll ML and persist results when ready."""
    scan = get_scan(owner_uid, scan_id)
    if not scan or scan.get("status") != "running":
        return scan
    if not ml_service_configured():
        return scan

    job_id = str(scan.get("ml_job_id") or scan_id)
    progress = get_analyze_progress(job_id)
    stage = str(progress.get("stage") or "")
    status = str(progress.get("status") or "")

    if status == "failed" or stage == "failed":
        return finalize_scan_from_ml(
            owner_uid,
            scan_id,
            {},
            failed=True,
            error=str(progress.get("message") or "Analysis failed."),
        )

    if status != "done" and stage != "done":
        return scan

    result = get_analyze_result(job_id)
    if result.get("status") == "failed":
        return finalize_scan_from_ml(
            owner_uid,
            scan_id,
            {},
            failed=True,
            error=str(result.get("error") or result.get("message") or "Analysis failed."),
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
            "message": scan.get("error") or "Analysis failed.",
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
        return {
            "scan_id": scan_id,
            "job_id": job_id,
            "stage": "failed",
            "percent": 100,
            "message": str(exc),
            "status": "failed",
        }

    if progress.get("status") == "done" or progress.get("stage") == "done":
        hydrate_scan_from_ml(owner_uid, scan_id)

    return {
        "scan_id": scan_id,
        "job_id": job_id,
        "stage": progress.get("stage"),
        "percent": progress.get("percent"),
        "message": progress.get("message"),
        "status": progress.get("status"),
    }
