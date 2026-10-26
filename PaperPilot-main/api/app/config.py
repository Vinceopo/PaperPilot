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
    pro_scan_limit: int = 75
    # Each successful scan uses one credit. Free is always 3/month, Premium is always 50/month,
    # Pro is always 75/week.
    # Kept for older env files. The API enforces 3, 50 and 75 even if this is set higher.
    disable_scan_limit: bool = False
    # Absolute upload ceiling (Pro plan). Plan-specific limits are lower for Free/Premium.
    # A smaller MAX_UPLOAD_BYTES in the environment must not reject Pro files.
    max_upload_bytes: int = 120_000_000

    # Amazon S3 (server-only). Clients upload via API-issued presigned PUT URLs.
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "ap-southeast-2"
    aws_s3_bucket: str = "paperpilot-storage"

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

# Plan upload ceilings (binary MiB). Unknown tier → Free.
PLAN_UPLOAD_LIMITS_BYTES = {
    "free": 15 * 1024 * 1024,
    "premium": 45 * 1024 * 1024,
    "pro": 120 * 1024 * 1024,
}

# Absolute ceiling (Pro). A smaller MAX_UPLOAD_BYTES in the environment
# must not reject a file the client already accepted for Pro.
UPLOAD_LARGE_MAX_BYTES = PLAN_UPLOAD_LIMITS_BYTES["pro"]


def document_byte_limit() -> int:
    return max(int(settings.max_upload_bytes or 0), UPLOAD_LARGE_MAX_BYTES)


def plan_upload_byte_limit(tier: str | None) -> int:
    key = str(tier or "free").lower()
    if key not in PLAN_UPLOAD_LIMITS_BYTES:
        key = "free"
    return PLAN_UPLOAD_LIMITS_BYTES[key]


def plan_upload_limit_label(tier: str | None) -> str:
    key = str(tier or "free").lower()
    if key == "pro":
        name = "Pro"
    elif key == "premium":
        name = "Premium"
    else:
        name = "Free"
        key = "free"
    mb = PLAN_UPLOAD_LIMITS_BYTES[key] / (1024 * 1024)
    label = f"{int(mb)}" if float(mb).is_integer() else f"{mb:g}"
    return f"{name} plans can upload up to {label} MB"
