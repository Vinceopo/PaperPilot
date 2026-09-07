from __future__ import annotations

import base64
import copy
import hashlib
import hmac
import logging
import math
import secrets
import time

from app.config import settings
from app.firebase_admin_app import firebase_admin_app

log = logging.getLogger("paperpilot.otp")

ROOT = "/paperpilot_auth"
PURPOSES = frozenset({"verify_email", "reset_password"})
_secret_cache: bytes | None = None


def _reference(path: str):
    if not firebase_admin_app():
        raise RuntimeError("Firebase Realtime Database is unavailable.")
    from firebase_admin import db

    return db.reference(path)


def init_db() -> None:
    """Initialize Firebase Admin without deleting or rewriting authentication state."""
    firebase_admin_app()


def _email_key(email: str) -> str:
    digest = hashlib.sha256(email.strip().lower().encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def _token_key(token: str) -> str:
    digest = hashlib.sha256((token or "").encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def _secret() -> bytes:
    """Return the configured HMAC key, or a persistent server-only RTDB key."""
    global _secret_cache
    if _secret_cache is not None:
        return _secret_cache
    configured = (settings.otp_secret or "").strip()
    if configured:
        _secret_cache = configured.encode("utf-8")
        return _secret_cache
    generated = secrets.token_hex(32)
    value = _reference(f"{ROOT}/config/otp_secret").transaction(
        lambda current: current or generated
    )
    if not isinstance(value, str) or not value:
        raise RuntimeError("Could not initialize OTP hashing.")
    _secret_cache = value.encode("utf-8")
    return _secret_cache


def _hash_code(email: str, purpose: str, code: str) -> str:
    payload = f"{email.lower()}|{purpose}|{code}".encode("utf-8")
    return hmac.new(_secret(), payload, hashlib.sha256).hexdigest()


def generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _rate_limits(purpose: str) -> tuple[int, int, int]:
    """Return (cooldown_seconds, window_seconds, max_sends) for a purpose."""
    if purpose == "reset_password":
        return (
            settings.otp_reset_resend_seconds,
            settings.otp_reset_window_seconds,
            settings.otp_reset_max_sends,
        )
    return (
        settings.otp_resend_seconds,
        settings.otp_rate_window_seconds,
        settings.otp_max_sends_per_hour,
    )


def _active_sends(value: object, now: float, window_seconds: int) -> list[float]:
    if not isinstance(value, dict):
        return []
    sends = value.get("sends", [])
    if not isinstance(sends, list):
        return []
    return sorted(
        [float(item) for item in sends if now - float(item) < window_seconds],
        reverse=True,
    )


def _rate_result(
    sends: list[float],
    now: float,
    *,
    cooldown_seconds: int,
    window_seconds: int,
    max_sends: int,
    purpose: str = "verify_email",
) -> tuple[bool, int, str]:
    if not sends:
        return True, 0, ""
    cooldown = math.ceil(cooldown_seconds - (now - sends[0]))
    if cooldown > 0:
        return False, cooldown, f"Please wait {cooldown} second(s) before requesting a new code."
    cap = max(max_sends, 1)
    if len(sends) >= cap:
        blocking = sends[min(cap - 1, len(sends) - 1)]
        wait = max(math.ceil(window_seconds - (now - blocking)), 1)
        label = "password reset codes" if purpose == "reset_password" else "codes"
        if wait >= 60:
            minutes = max(math.ceil(wait / 60), 1)
            return False, wait, f"Too many {label} requested. Try again in about {minutes} minute(s)."
        return False, wait, f"Too many {label} requested. Try again in {wait} second(s)."
    return True, 0, ""


def can_send(email: str, purpose: str) -> tuple[bool, int, str]:
    """Rate limit code delivery. Returns (allowed, wait_seconds, reason)."""
    now = time.time()
    cooldown_seconds, window_seconds, max_sends = _rate_limits(purpose)
    ref = _reference(f"{ROOT}/send_rates/{_email_key(email)}/{purpose}")
    result = ref.transaction(
        lambda current: {"sends": _active_sends(current, now, window_seconds)}
    )
    return _rate_result(
        _active_sends(result, now, window_seconds),
        now,
        cooldown_seconds=cooldown_seconds,
        window_seconds=window_seconds,
        max_sends=max_sends,
        purpose=purpose,
    )


def store_otp(email: str, purpose: str, code: str) -> int:
    """Persist a new code, invalidating any previous code and challenge."""
    now = time.time()
    expires = now + settings.otp_ttl_seconds
    digest = _hash_code(email, purpose, code)
    email_key = _email_key(email)
    denied: list[tuple[int, str]] = []
    cooldown_seconds, window_seconds, max_sends = _rate_limits(purpose)

    def store(root):
        denied.clear()
        root = copy.deepcopy(root) if isinstance(root, dict) else {}
        rates = root.setdefault("send_rates", {}).setdefault(email_key, {})
        sends = _active_sends(rates.get(purpose), now, window_seconds)
        allowed, wait, reason = _rate_result(
            sends,
            now,
            cooldown_seconds=cooldown_seconds,
            window_seconds=window_seconds,
            max_sends=max_sends,
            purpose=purpose,
        )
        if not allowed:
            denied[:] = [(wait, reason)]
            return root
        rates[purpose] = {"sends": [now, *sends]}
        root.setdefault("otps", {}).setdefault(email_key, {})[purpose] = {
            "code_hash": digest,
            "expires_at": expires,
            "attempts": 0,
            "created_at": now,
        }
        challenge_index = (
            root.setdefault("challenge_index", {})
            .setdefault(email_key, {})
            .setdefault(purpose, {})
        )
        challenges = root.setdefault("challenges", {})
        for token_hash in list(challenge_index):
            challenges.pop(token_hash, None)
        challenge_index.clear()
        return root

    _reference(ROOT).transaction(store)
    if denied:
        raise ValueError(denied[-1][1])
    return settings.otp_ttl_seconds


def verify_otp(email: str, purpose: str, code: str) -> str:
    """Check a code and exchange it for a single-use challenge token."""
    now = time.time()
    code = (code or "").strip()
    if not code.isdigit() or len(code) != 6:
        raise ValueError("Enter the 6-digit code from your email.")
    digest = _hash_code(email, purpose, code)
    email_key = _email_key(email)
    token = secrets.token_urlsafe(32)
    token_hash = _token_key(token)
    outcome: dict[str, str] = {}

    def verify(root):
        outcome.clear()
        root = copy.deepcopy(root) if isinstance(root, dict) else {}
        purpose_otps = root.setdefault("otps", {}).setdefault(email_key, {})
        current = purpose_otps.get(purpose)
        if not isinstance(current, dict):
            outcome["error"] = "No active code for this email. Request a new one."
            return root
        if now > float(current.get("expires_at", 0)):
            outcome["error"] = "This code has expired. Request a new one."
            purpose_otps.pop(purpose, None)
            return root
        attempts = int(current.get("attempts", 0))
        if attempts >= settings.otp_max_attempts:
            outcome["error"] = "Too many incorrect attempts. Request a new code."
            purpose_otps.pop(purpose, None)
            return root
        if not hmac.compare_digest(str(current.get("code_hash", "")), digest):
            attempts += 1
            left = max(settings.otp_max_attempts - attempts, 0)
            if left == 0:
                outcome["error"] = "Too many incorrect attempts. Request a new code."
                purpose_otps.pop(purpose, None)
                return root
            updated = copy.deepcopy(current)
            updated["attempts"] = attempts
            purpose_otps[purpose] = updated
            outcome["error"] = f"Incorrect code. {left} attempt(s) left."
            return root
        purpose_otps.pop(purpose, None)
        root.setdefault("challenges", {})[token_hash] = {
            "email_key": email_key,
            "purpose": purpose,
            "expires_at": now + settings.otp_ttl_seconds,
            "created_at": now,
        }
        (
            root.setdefault("challenge_index", {})
            .setdefault(email_key, {})
            .setdefault(purpose, {})
        )[token_hash] = True
        outcome["success"] = "1"
        return root

    _reference(ROOT).transaction(verify)
    if "success" not in outcome:
        raise ValueError(outcome.get("error", "No active code for this email. Request a new one."))
    return token


def consume_challenge(token: str, email: str, purpose: str) -> None:
    """Exchange a single-use challenge token.

    Uses a read-then-delete pattern instead of a transaction to avoid the
    Firebase Admin SDK v6 limitation where a transaction callback that returns
    None raises ValueError('Value must not be none.').  Challenge tokens are
    cryptographically random (32 url-safe bytes) so the TOCTOU window is
    negligible in practice.
    """
    now = time.time()
    token_hash = _token_key(token)
    email_key = _email_key(email)
    ref = _reference(f"{ROOT}/challenges/{token_hash}")

    current = ref.get()

    if not isinstance(current, dict):
        raise ValueError("Verification code has expired or was already used. Please request a new code.")

    if now > float(current.get("expires_at", 0)):
        # Best-effort cleanup of expired node
        try:
            ref.delete()
        except Exception:
            pass
        raise ValueError("Verification code has expired. Please request a new code.")

    if current.get("consumed_at"):
        raise ValueError("Verification code has already been used. Please request a new code.")

    if current.get("email_key") != email_key or current.get("purpose") != purpose:
        raise ValueError("Verification does not match this email address.")

    # Valid — delete the challenge so it can't be reused
    try:
        ref.delete()
        _reference(f"{ROOT}/challenge_index/{email_key}/{purpose}/{token_hash}").delete()
    except Exception:
        pass  # Non-critical; token is single-use even if cleanup fails
