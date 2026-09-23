from __future__ import annotations

from fastapi import Header, HTTPException, status

from app.config import settings


def require_service_key(
    ml_service_key: str | None = Header(default=None, alias="ML-Service-Key"),
) -> None:
    expected = (settings.ml_service_key or "").strip()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ML service key is not configured on this host.",
        )
    provided = (ml_service_key or "").strip()
    if not provided or provided != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid ML service key.")
