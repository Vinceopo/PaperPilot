from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_starttls: bool = True

    otp_ttl_seconds: int = 600
    otp_resend_seconds: int = 60
    otp_max_sends_per_hour: int = 5
    otp_max_attempts: int = 5
    otp_echo_in_response: bool = False
    # Keys the HMAC used to hash codes at rest. Generated into api/data/otp_secret when blank.
    otp_secret: str = ""

    firebase_credentials: str = ""
    free_scan_limit: int = 3
    premium_scan_limit: int = 50
    max_upload_bytes: int = 25_000_000


settings = Settings()
