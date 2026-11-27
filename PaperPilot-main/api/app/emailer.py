from __future__ import annotations

import logging
import re
import smtplib
from email.message import EmailMessage
from email.utils import parseaddr

import requests

from app.config import settings

log = logging.getLogger("paperpilot.otp")

# Public inboxes / placeholders cannot be used as a Resend "from" for arbitrary recipients.
_BLOCKED_RESEND_DOMAINS = frozenset(
    {
        "gmail.com",
        "googlemail.com",
        "yahoo.com",
        "outlook.com",
        "hotmail.com",
        "live.com",
        "icloud.com",
        "resend.dev",
        "yourdomain.com",
        "localhost",
        "example.com",
    }
)


def _otp_copy(purpose: str, code: str) -> tuple[str, str, str]:
    action = "confirm your email" if purpose == "verify_email" else "reset your password"
    label = "verification" if purpose == "verify_email" else "password reset"
    minutes = max(1, settings.otp_ttl_seconds // 60)
    # A unique subject per code keeps Gmail from threading old codes together.
    subject = f"{code} is your PaperPilot {label} code"
    text = (
        f"Your PaperPilot code is {code}.\n\n"
        f"Use this 6-digit code to {action}. It expires in {minutes} minute(s).\n"
        "Only your most recent code works; earlier codes are cancelled.\n"
        "If you did not request this, you can ignore this email."
    )
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;color:#0F1B2D">
      <h2 style="margin:0 0 12px">PaperPilot</h2>
      <p style="margin:0 0 16px">Use this code to {action}:</p>
      <p style="font-size:28px;letter-spacing:8px;font-weight:700;color:#1BC9A0;margin:0 0 16px">{code}</p>
      <p style="margin:0;color:#64748B;font-size:13px">This code expires in {minutes} minute(s). Only your most recent code works; earlier codes are cancelled.</p>
    </div>
    """
    return subject, text, html


def _extract_email_address(value: str) -> str:
    raw = (value or "").strip()
    match = re.search(r"<([^>]+)>", raw)
    return (match.group(1) if match else raw).strip().lower()


def _domain_of(address: str) -> str:
    email = _extract_email_address(address)
    if "@" not in email:
        return ""
    return email.rsplit("@", 1)[-1].strip().lower()


def _parse_from(value: str) -> tuple[str, str]:
    """Return (display_name, email) for provider APIs."""
    name, email = parseaddr((value or "").strip())
    email = (email or "").strip()
    if not email and "@" in (value or ""):
        email = _extract_email_address(value)
    name = (name or "PaperPilot").strip() or "PaperPilot"
    return name, email


def _default_from_header() -> str:
    return (
        (settings.brevo_from or "").strip()
        or (settings.smtp_from or "").strip()
        or (settings.smtp_user or "").strip()
        or (settings.resend_from or "").strip()
        or "PaperPilot <noreply@localhost>"
    )


def smtp_ready() -> bool:
    return bool(
        settings.smtp_host.strip()
        and settings.smtp_user.strip()
        and settings.smtp_password.strip()
    )


def brevo_ready() -> bool:
    if not settings.brevo_api_key.strip():
        return False
    _, email = _parse_from(_default_from_header())
    return bool(email and "@" in email)


def resend_ready() -> bool:
    """True only when Resend can deliver to arbitrary inboxes (verified custom domain)."""
    if not settings.resend_api_key.strip():
        return False
    from_addr = (settings.resend_from or "").strip()
    if not from_addr:
        return False
    domain = _domain_of(from_addr)
    if not domain or domain in _BLOCKED_RESEND_DOMAINS:
        return False
    if domain.endswith(".resend.dev"):
        return False
    return True


def mail_status() -> dict:
    """Safe diagnostics for /health — never includes secrets."""
    return {
        "brevo": brevo_ready(),
        "resend": resend_ready(),
        "smtp": smtp_ready(),
        "configured": email_delivery_configured(),
        "from": _extract_email_address(_default_from_header()) or None,
    }


def _send_via_brevo(to_email: str, subject: str, text: str, html: str) -> None:
    """HTTPS send — works on Vercel. Sender must be verified once in Brevo (can be Gmail)."""
    name, sender = _parse_from(_default_from_header())
    if not sender:
        raise RuntimeError("BREVO_FROM / SMTP_FROM is missing a sender email.")

    response = requests.post(
        "https://api.brevo.com/v3/smtp/email",
        headers={
            "accept": "application/json",
            "api-key": settings.brevo_api_key.strip(),
            "content-type": "application/json",
        },
        json={
            "sender": {"name": name, "email": sender},
            "to": [{"email": to_email}],
            "subject": subject,
            "htmlContent": html,
            "textContent": text,
        },
        timeout=30,
    )
    if response.status_code >= 400:
        detail = response.text[:400]
        raise RuntimeError(f"Brevo failed ({response.status_code}): {detail}")
    message_id = None
    try:
        message_id = (response.json() or {}).get("messageId")
    except Exception:
        message_id = None
    log.info("Brevo accepted OTP email to %s id=%s", to_email, message_id)


def _send_via_resend(to_email: str, subject: str, text: str, html: str) -> None:
    import resend

    resend.api_key = settings.resend_api_key.strip()
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
        hint = ""
        domain = _domain_of(from_addr)
        if domain in _BLOCKED_RESEND_DOMAINS or domain.endswith(".resend.dev"):
            hint = (
                " RESEND_FROM must be an address on a domain verified in Resend "
                "(not Gmail / resend.dev). Prefer BREVO_API_KEY with your Gmail sender."
            )
        raise RuntimeError(f"Resend failed: {exc}.{hint}") from exc

    email_id = result.get("id") if isinstance(result, dict) else getattr(result, "id", None)
    log.info("Resend accepted OTP email to %s id=%s", to_email, email_id)


def _smtp_send_message(msg: EmailMessage, host: str, port: int) -> None:
    user = settings.smtp_user.strip()
    password = settings.smtp_password
    # 465 = implicit SSL; 587 = STARTTLS. Try the configured port first.
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=30) as smtp:
            smtp.ehlo()
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)
        return

    with smtplib.SMTP(host, port, timeout=30) as smtp:
        smtp.ehlo()
        if settings.smtp_starttls:
            smtp.starttls()
            smtp.ehlo()
        if user:
            smtp.login(user, password)
        smtp.send_message(msg)


def _send_via_smtp(to_email: str, subject: str, text: str, html: str) -> None:
    from_addr = (settings.smtp_from or settings.smtp_user or "").strip() or "noreply@localhost"
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")

    host = settings.smtp_host.strip()
    port = int(settings.smtp_port or 587)
    # Gmail often works on 587; if the connection drops, retry implicit SSL on 465.
    attempts = [port]
    if host.lower() == "smtp.gmail.com" and port != 465:
        attempts.append(465)

    last_error: Exception | None = None
    for attempt_port in attempts:
        try:
            _smtp_send_message(msg, host, attempt_port)
            log.info("SMTP accepted OTP email to %s via %s:%s", to_email, host, attempt_port)
            return
        except smtplib.SMTPAuthenticationError as exc:
            raise RuntimeError(
                "SMTP login failed. Check SMTP_USER / SMTP_PASSWORD "
                "(use a Gmail App Password, not the normal account password)."
            ) from exc
        except Exception as exc:
            last_error = exc
            log.warning("SMTP attempt %s:%s failed: %s", host, attempt_port, exc)

    raise RuntimeError(f"SMTP failed ({host}:{port}): {last_error}") from last_error


def email_delivery_configured() -> bool:
    return brevo_ready() or resend_ready() or smtp_ready()


def send_otp_email(to_email: str, code: str, purpose: str) -> None:
    """Deliver OTP for signup / reset / change-password to any recipient inbox."""
    subject, text, html = _otp_copy(purpose, code)
    errors: list[str] = []

    # 1) Brevo HTTPS — reliable on Vercel; Gmail can be the verified sender.
    if brevo_ready():
        try:
            _send_via_brevo(to_email, subject, text, html)
            return
        except Exception as exc:
            errors.append(str(exc))
            log.warning("Brevo failed for %s: %s", to_email, exc)

    # 2) Resend with a verified custom domain.
    if resend_ready():
        try:
            _send_via_resend(to_email, subject, text, html)
            return
        except Exception as exc:
            errors.append(str(exc))
            log.warning("Resend failed for %s: %s", to_email, exc)

    # 3) SMTP last — often blocked on serverless (Vercel); still useful for some hosts.
    if smtp_ready():
        try:
            _send_via_smtp(to_email, subject, text, html)
            return
        except Exception as exc:
            errors.append(str(exc))
            log.warning("SMTP failed for %s: %s", to_email, exc)

    if errors:
        raise RuntimeError("; ".join(errors))

    if settings.resend_api_key.strip() and not resend_ready():
        raise RuntimeError(
            "RESEND_API_KEY is set but RESEND_FROM is not a verified custom domain. "
            "Set BREVO_API_KEY (verify your Gmail sender in Brevo) or clear RESEND_*."
        )

    log.warning("No Brevo/Resend/SMTP configured. OTP for %s (%s): %s", to_email, purpose, code)
