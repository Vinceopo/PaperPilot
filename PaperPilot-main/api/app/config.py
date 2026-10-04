from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_API_DIR = Path(__file__).resolve().parent.parent
_ENV_FILE = _API_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), env_file_encoding="utf-8", extra="ignore")

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:5174,http://127.0.0.1:5174,"
        "https://paperpilotph.vercel.app"
    )

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_starttls: bool = True

    # Prefer Resend when set (dev: onboarding@resend.dev). SMTP remains a fallback.
    resend_api_key: str = ""
    resend_from: str = "onboarding@resend.dev"

    # When false, register / reset skip email codes (local/dev). Never disable in production.
    otp_enabled: bool = True
    otp_ttl_seconds: int = 300
    otp_resend_seconds: int = 30
    otp_rate_window_seconds: int = 3600  # window for otp_max_sends_per_hour
    otp_max_sends_per_hour: int = 5
    # Stricter limits for forgot / change password (purpose=reset_password).
    otp_reset_resend_seconds: int = 30
    otp_reset_window_seconds: int = 3600  # 1 hour
    otp_reset_max_sends: int = 10
    otp_max_attempts: int = 5
    otp_echo_in_response: bool = False
    # Keys the HMAC used to hash codes at rest. Generated in server-only RTDB state when blank.
    otp_secret: str = ""

    firebase_credentials: str = ""
    firebase_database_url: str = ""
    free_scan_limit: int = 3
    premium_scan_limit: int = 50
    # Each successful scan uses one credit. Free is always 3/month, Premium is always 50/month.
    # Kept for older env files. The API enforces 3 and 50 even if this is set higher.
    disable_scan_limit: bool = False
    # Documents are uploaded with Cloudinary upload_large (20MB chunks).
    # 100MB matches the client ceiling. A lower env value must not reject those files.
    max_upload_bytes: int = 100_000_000

    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""
    cloudinary_upload_preset: str = "uploaded_docs"

    # PayMongo (server-only). Secret key creates Checkout Sessions; webhook secret verifies events.
    paymongo_secret_key: str = ""
    paymongo_webhook_secret: str = ""
    paymongo_payment_methods: str = "card,gcash,paymaya,grab_pay,qrph"
    # Public web app URL used for Checkout success/cancel redirects.
    app_public_url: str = "https://paperpilotph.vercel.app"

    # Render ML analyze service (gateway-only; never expose key to clients).
    ml_service_url: str = ""
    ml_service_key: str = ""


settings = Settings()

# upload_large client ceiling. A smaller MAX_UPLOAD_BYTES in the environment
# must not reject a file Cloudinary already accepted in chunks.
UPLOAD_LARGE_MAX_BYTES = 100_000_000


def document_byte_limit() -> int:
    return max(int(settings.max_upload_bytes or 0), UPLOAD_LARGE_MAX_BYTES)
