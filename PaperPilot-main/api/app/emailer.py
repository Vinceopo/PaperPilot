from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.config import settings

log = logging.getLogger("paperpilot.otp")


def _otp_copy(purpose: str, code: str) -> tuple[str, str, str]:
    action = "confirm your email" if purpose == "verify_email" else "reset your password"
    minutes = max(1, settings.otp_ttl_seconds // 60)
    subject = "Your PaperPilot verification code"
    text = (
        f"Your PaperPilot code is {code}.\n\n"
        f"Use this 6-digit code to {action}. It expires in {minutes} minute(s).\n"
        "If you did not request this, you can ignore this email."
    )
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;color:#0F1B2D">
      <h2 style="margin:0 0 12px">PaperPilot</h2>
      <p style="margin:0 0 16px">Use this code to {action}:</p>
      <p style="font-size:28px;letter-spacing:8px;font-weight:700;color:#1BC9A0;margin:0 0 16px">{code}</p>
      <p style="margin:0;color:#64748B;font-size:13px">This code expires in {minutes} minute(s).</p>
    </div>
    """
    return subject, text, html


def _send_via_resend(to_email: str, subject: str, text: str, html: str) -> None:
    import resend

    resend.api_key = settings.resend_api_key.strip()
    # Dev mode allows only onboarding@resend.dev as the from address.
    from_addr = (settings.resend_from or "").strip() or "onboarding@resend.dev"
    try:
        result = resend.Emails.send(
            {
                "from": from_addr,
                "to": [to_email],
                "subject": subject,
                "text": text,
                "html": html,
            }
        )
    except Exception as exc:
        raise RuntimeError(f"Resend failed: {exc}") from exc

    email_id = result.get("id") if isinstance(result, dict) else getattr(result, "id", None)
    log.info("Resend accepted OTP email to %s id=%s", to_email, email_id)


def _send_via_smtp(to_email: str, subject: str, text: str, html: str) -> None:
    from_addr = settings.smtp_from or settings.smtp_user or "noreply@localhost"
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
        if settings.smtp_starttls:
            smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)


def email_delivery_configured() -> bool:
    return bool(settings.resend_api_key.strip() or settings.smtp_host.strip())


def send_otp_email(to_email: str, code: str, purpose: str) -> None:
    subject, text, html = _otp_copy(purpose, code)

    if settings.resend_api_key.strip():
        _send_via_resend(to_email, subject, text, html)
        return

    if settings.smtp_host.strip():
        _send_via_smtp(to_email, subject, text, html)
        return

    log.warning("No Resend/SMTP configured. OTP for %s (%s): %s", to_email, purpose, code)
