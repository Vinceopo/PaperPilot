from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.config import settings

log = logging.getLogger("paperpilot.otp")


def send_otp_email(to_email: str, code: str, purpose: str) -> None:
    action = "confirm your email" if purpose == "verify_email" else "reset your password"
    subject = "Your PaperPilot verification code"
    text = (
        f"Your PaperPilot code is {code}.\n\n"
        f"Use this 6-digit code to {action}. It expires in 10 minutes.\n"
        "If you did not request this, you can ignore this email."
    )
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;color:#0F1B2D">
      <h2 style="margin:0 0 12px">PaperPilot</h2>
      <p style="margin:0 0 16px">Use this code to {action}:</p>
      <p style="font-size:28px;letter-spacing:8px;font-weight:700;color:#1BC9A0;margin:0 0 16px">{code}</p>
      <p style="margin:0;color:#64748B;font-size:13px">This code expires in 10 minutes.</p>
    </div>
    """

    if not settings.smtp_host:
        log.warning("SMTP not configured. OTP for %s (%s): %s", to_email, purpose, code)
        return

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
