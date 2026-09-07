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

    # Prefer Resend when set (dev: onboarding@resend.dev). SMTP remains a fallback.
    resend_api_key: str = ""
    resend_from: str = "onboarding@resend.dev"

    otp_ttl_seconds: int = 300
    otp_resend_seconds: int = 60
    otp_rate_window_seconds: int = 3600  # window for otp_max_sends_per_hour
    otp_max_sends_per_hour: int = 5
    # Stricter limits for forgot / change password (purpose=reset_password).
    otp_reset_resend_seconds: int = 60
    otp_reset_window_seconds: int = 1800  # 30 minutes
    otp_reset_max_sends: int = 10
    otp_max_attempts: int = 5
    otp_echo_in_response: bool = False
    # Keys the HMAC used to hash codes at rest. Generated in server-only RTDB state when blank.
    otp_secret: str = ""

    firebase_credentials: str = ""
    firebase_database_url: str = ""
    free_scan_limit: int = 3
    premium_scan_limit: int = 50
    max_upload_bytes: int = 25_000_000


settings = Settings()
