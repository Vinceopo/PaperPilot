from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ml_service_key: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    # Absolute ceiling (must be ≥ Pro). Plan limits below enforce Free/Premium/Pro.
    max_document_bytes: int = 120 * 1024 * 1024
    # PDF pages processed per analysis chunk (progress + memory-friendly batches).
    # Large Pro manuscripts (up to 120 MB) are parsed/checked in these page chunks.
    analysis_page_chunk: int = 20
    job_ttl_seconds: int = 3600
    job_store_dir: str = "/tmp/paperpilot-jobs"
    host: str = "0.0.0.0"
    port: int = 8000


settings = Settings()

# Plan analyze ceilings (binary MiB). Unknown tier → Free.
PLAN_UPLOAD_LIMITS_BYTES = {
    "free": 15 * 1024 * 1024,
    "premium": 45 * 1024 * 1024,
    "pro": 120 * 1024 * 1024,
}


def plan_upload_byte_limit(tier: str | None) -> int:
    """Bytes allowed for analysis for this subscription tier."""
    key = str(tier or "free").lower()
    if key not in PLAN_UPLOAD_LIMITS_BYTES:
        key = "free"
    # Never exceed the process absolute ceiling (env / default).
    ceiling = max(int(settings.max_document_bytes or 0), PLAN_UPLOAD_LIMITS_BYTES["pro"])
    return min(PLAN_UPLOAD_LIMITS_BYTES[key], ceiling)
