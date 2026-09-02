"""Realtime Database-backed user profiles and username reservations."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from app.firebase_admin_app import firebase_admin_app

log = logging.getLogger("paperpilot.profiles")

def _reference(path: str):
    if not firebase_admin_app():
        return None
    try:
        from firebase_admin import db
        return db.reference(path)
    except Exception as exc:
        log.warning("Realtime Database is unavailable: %s", exc)
        return None


def _username_key(username: str) -> str:
    # RTDB keys cannot contain '.', although periods are valid in usernames.
    return username.strip().lower().replace("%", "%25").replace(".", "%2E")


def firestore_client():
    """Backward-compatible accessor; persistence now uses an RTDB root reference."""
    return _reference("/")


def username_taken(username: str) -> bool | None:
    """True taken, False free, None when Realtime Database is unavailable."""
    ref = _reference(f"/usernames/{_username_key(username)}")
    if ref is None:
        return None
    try:
        return ref.get() is not None
    except Exception as exc:
        log.warning("Username lookup failed: %s", exc)
        return None


def reserve_username(username: str, uid: str) -> bool | None:
    """Atomically claim a username. True reserved, False taken, None unavailable."""
    ref = _reference(f"/usernames/{_username_key(username)}")
    if ref is None:
        return None
    reservation = {
        "uid": uid,
        "username": username.strip(),
        "claim_id": str(uuid.uuid4()),
    }
    try:
        def claim(current):
            return reservation if current is None else current

        return ref.transaction(claim) == reservation
    except Exception as exc:
        log.warning("Username reservation failed: %s", exc)
        return None


def release_username(username: str) -> None:
    ref = _reference(f"/usernames/{_username_key(username)}")
    if ref is None:
        return
    try:
        ref.delete()
    except Exception as exc:
        log.warning("Username release failed: %s", exc)


def get_email_by_username(username: str) -> str | None:
    """Return the email for a username, or None if not found / DB unavailable."""
    ref = _reference(f"/usernames/{_username_key(username)}")
    if ref is None:
        return None
    try:
        entry = ref.get()
        if not isinstance(entry, dict):
            return None
        uid = entry.get("uid")
        if not uid:
            return None
        user_ref = _reference(f"/users/{uid}")
        if user_ref is None:
            return None
        profile = user_ref.get()
        if not isinstance(profile, dict):
            return None
        return profile.get("email") or None
    except Exception as exc:
        log.warning("Username→email lookup failed: %s", exc)
        return None


def save_profile(
    uid: str,
    *,
    email: str,
    username: str,
    first_name: str,
    middle_name: str,
    last_name: str,
) -> bool:
    ref = _reference(f"/users/{uid}")
    if ref is None:
        return False
    try:
        ref.update(
            {
                "email": email,
                "username": username,
                "usernameLower": username.lower(),
                "firstName": first_name,
                "middleName": middle_name,
                "lastName": last_name,
                "emailVerified": True,
                "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            }
        )
        return True
    except Exception as exc:
        log.warning("Profile save failed: %s", exc)
        return False
