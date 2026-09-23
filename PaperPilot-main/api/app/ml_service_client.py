"""HTTP client for the Render-hosted PaperPilot ML analyze service."""

from __future__ import annotations

from typing import Any

import httpx

from app.config import settings


class MLServiceError(Exception):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def ml_service_configured() -> bool:
    return bool((settings.ml_service_url or "").strip() and (settings.ml_service_key or "").strip())


def _base_url() -> str:
    return (settings.ml_service_url or "").strip().rstrip("/")


def _headers() -> dict[str, str]:
    return {
        "ML-Service-Key": (settings.ml_service_key or "").strip(),
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _request(method: str, path: str, *, json_body: dict | None = None) -> dict[str, Any]:
    if not ml_service_configured():
        raise MLServiceError("ML service is not configured (ML_SERVICE_URL / ML_SERVICE_KEY).")
    url = f"{_base_url()}{path}"
    try:
        with httpx.Client(timeout=120.0, follow_redirects=True) as client:
            response = client.request(method, url, headers=_headers(), json=json_body)
    except httpx.RequestError as exc:
        raise MLServiceError(f"Could not reach ML service: {exc}") from exc
    if response.status_code >= 400:
        detail = response.text[:500] if response.text else response.reason_phrase
        raise MLServiceError(detail or "ML service request failed.", response.status_code)
    if not response.content:
        return {}
    return response.json()


def create_analyze_job(
    *,
    job_id: str,
    document_url: str | None,
    document_base64: str | None,
    filename: str,
    mechanics_rules: dict,
    tier: str,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "job_id": job_id,
        "filename": filename,
        "mechanics": {"rules": mechanics_rules},
        "tier": tier,
    }
    if document_url:
        payload["document_url"] = document_url
    if document_base64:
        payload["document_base64"] = document_base64
    return _request("POST", "/v1/analyze", json_body=payload)


def get_analyze_progress(job_id: str) -> dict[str, Any]:
    return _request("GET", f"/v1/analyze/{job_id}/progress")


def get_analyze_result(job_id: str) -> dict[str, Any]:
    return _request("GET", f"/v1/analyze/{job_id}/result")
