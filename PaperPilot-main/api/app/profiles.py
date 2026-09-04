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
            if current is None:
                return reservation
            if isinstance(current, dict) and current.get("uid") == uid:
                return {"uid": uid, "username": username.strip(), "claim_id": current.get("claim_id") or reservation["claim_id"]}
            return current

        stored = ref.transaction(claim)
        return isinstance(stored, dict) and stored.get("uid") == uid
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


def _phone_key(phone: str) -> str:
    return "".join(ch for ch in (phone or "") if ch.isdigit())


def phone_in_use(phone: str, uid: str) -> bool | None:
    """True if another user already has this mobile number."""
    key = _phone_key(phone)
    if not key:
        return False
    index_ref = _reference(f"/phones/{key}")
    users_ref = _reference("/users")
    if index_ref is None or users_ref is None:
        return None
    try:
        entry = index_ref.get()
        if isinstance(entry, dict) and entry.get("uid") not in (None, "", uid):
            return True
        users = users_ref.get() or {}
        if not isinstance(users, dict):
            return False
        for other_uid, profile in users.items():
            if other_uid == uid or not isinstance(profile, dict):
                continue
            if _phone_key(profile.get("contactNumber")) == key:
                return True
        return False
    except Exception as exc:
        log.warning("Phone uniqueness lookup failed: %s", exc)
        return None


def claim_phone(phone: str, uid: str) -> bool | None:
    """Reserve a mobile number for uid. True ok, False taken, None if DB unavailable."""
    key = _phone_key(phone)
    if not key:
        return True
    ref = _reference(f"/phones/{key}")
    if ref is None:
        return None
    reservation = {"uid": uid, "phone": key}
    try:
        def claim(current):
            if not isinstance(current, dict) or current.get("uid") in (None, "", uid):
                return reservation
            return current

        stored = ref.transaction(claim)
        return isinstance(stored, dict) and stored.get("uid") == uid
    except Exception as exc:
        log.warning("Phone reservation failed: %s", exc)
        return None


def release_phone(phone: str, uid: str) -> None:
    key = _phone_key(phone)
    if not key:
        return
    ref = _reference(f"/phones/{key}")
    if ref is None:
        return
    try:
        current = ref.get()
        if isinstance(current, dict) and current.get("uid") == uid:
            ref.delete()
    except Exception as exc:
        log.warning("Phone release failed: %s", exc)


def get_profile(uid: str) -> dict | None:
    """Fetch full user profile from RTDB."""
    ref = _reference(f"/users/{uid}")
    if ref is None:
        return None
    try:
        data = ref.get()
        return data if isinstance(data, dict) else None
    except Exception as exc:
        log.warning("Profile fetch failed: %s", exc)
        return None


def update_profile(
    uid: str,
    *,
    first_name: str | None = None,
    middle_name: str | None = None,
    last_name: str | None = None,
    contact_number: str | None = None,
    username: str | None = None,
    email: str | None = None,
    photo_url: str | None = None,
    remove_photo: bool = False,
) -> bool:
    """Partial-update mutable profile fields in RTDB."""
    ref = _reference(f"/users/{uid}")
    if ref is None:
        return False
    updates: dict = {}
    if first_name is not None:
        updates["firstName"] = first_name.strip()
    if middle_name is not None:
        updates["middleName"] = middle_name.strip()
    if last_name is not None:
        updates["lastName"] = last_name.strip()
    if contact_number is not None:
        updates["contactNumber"] = contact_number.strip()
    if username is not None:
        updates["username"] = username.strip()
        updates["usernameLower"] = username.strip().lower()
    if email is not None and email.strip():
        updates["email"] = email.strip()
    if remove_photo:
        updates["photoURL"] = ""
    elif photo_url is not None:
        updates["photoURL"] = photo_url
    if not updates:
        return True
    try:
        ref.update(updates)
        return True
    except Exception as exc:
        log.warning("Profile update failed: %s", exc)
        return False


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
