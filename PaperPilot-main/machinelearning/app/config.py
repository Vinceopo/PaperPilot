from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ml_service_key: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    # Match API Pro upload ceiling (120 MB) so plan-sized manuscripts can analyze.
    max_document_bytes: int = 120 * 1024 * 1024
    # PDF pages processed per analysis chunk (progress + memory-friendly batches).
    analysis_page_chunk: int = 20
    job_ttl_seconds: int = 3600
    job_store_dir: str = "/tmp/paperpilot-jobs"
    host: str = "0.0.0.0"
    port: int = 8000


settings = Settings()
