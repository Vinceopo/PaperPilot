from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ml_service_key: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    max_document_bytes: int = 25 * 1024 * 1024
    job_ttl_seconds: int = 3600
    host: str = "0.0.0.0"
    port: int = 8000


settings = Settings()
