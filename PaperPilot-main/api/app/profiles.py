"""Firestore-backed user profiles and username reservations.

Optional: when FIREBASE_CREDENTIALS is unset these helpers report "unavailable"
and the client writes its own profile under the rules in firestore.rules.
"""

from __future__ import annotations

import logging

from app.firebase_admin_app import firebase_admin_app

log = logging.getLogger("paperpilot.profiles")

_client = None
_init_attempted = False


def firestore_client():
    global _client, _init_attempted
    if _init_attempted:
        return _client
    _init_attempted = True
    if not firebase_admin_app():
        return None
    try:
        from firebase_admin import firestore

        _client = firestore.client()
    except Exception as exc:
        log.warning("Firestore is unavailable: %s", exc)
        _client = None
    return _client


def username_taken(username: str) -> bool | None:
    """True taken, False free, None when Firestore is unavailable."""
    db = firestore_client()
    if not db:
        return None
    try:
        return db.collection("usernames").document(username.strip().lower()).get().exists
    except Exception as exc:
        log.warning("Username lookup failed: %s", exc)
        return None


def reserve_username(username: str, uid: str) -> bool | None:
    """Atomically claim a username. True reserved, False taken, None unavailable."""
    db = firestore_client()
    if not db:
        return None
    try:
        from google.api_core.exceptions import AlreadyExists
    except Exception:  # pragma: no cover - google-api-core ships with firebase-admin
        AlreadyExists = None

    try:
        db.collection("usernames").document(username.strip().lower()).create(
            {"uid": uid, "username": username.strip()}
        )
        return True
    except Exception as exc:
        if AlreadyExists is not None and isinstance(exc, AlreadyExists):
            return False
        log.warning("Username reservation failed: %s", exc)
        return None


def release_username(username: str) -> None:
    db = firestore_client()
    if not db:
        return
    try:
        db.collection("usernames").document(username.strip().lower()).delete()
    except Exception as exc:
        log.warning("Username release failed: %s", exc)


def save_profile(
    uid: str,
    *,
    email: str,
    username: str,
    first_name: str,
    middle_name: str,
    last_name: str,
) -> bool:
    db = firestore_client()
    if not db:
        return False
    try:
        from firebase_admin import firestore

        db.collection("users").document(uid).set(
            {
                "email": email,
                "username": username,
                "usernameLower": username.lower(),
                "firstName": first_name,
                "middleName": middle_name,
                "lastName": last_name,
                "emailVerified": True,
                "createdAt": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
        return True
    except Exception as exc:
        log.warning("Profile save failed: %s", exc)
        return False
