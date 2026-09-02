"""Server-side field rules for the registration and password-reset flows.

The web client mirrors these in web/src/components/auth/validation.js for inline
feedback, but every rule is re-checked here because the client cannot be trusted.
"""

from __future__ import annotations

import re

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.]{3,20}$")
NAME_RE = re.compile(r"^[A-Za-z\u00C0-\u024F' .\-]+$")

NAME_MAX = 40


def normalize_email(value: str) -> str:
    return (value or "").strip().lower()


def email_error(value: str) -> str | None:
    value = (value or "").strip()
    if not value:
        return "Email is required."
    if len(value) > 254 or not EMAIL_RE.match(value):
        return "Enter a valid email address."
    return None


def username_error(value: str) -> str | None:
    value = (value or "").strip()
    if not value:
        return "Username is required."
    if not USERNAME_RE.match(value):
        return "Username must be 3–20 characters using letters, numbers, underscore, or period."
    return None


def password_error(value: str) -> str | None:
    value = value or ""
    if len(value) < 8:
        return "Password must be at least 8 characters."
    if not re.search(r"[A-Za-z]", value):
        return "Password must include at least one letter."
    if not re.search(r"\d", value):
        return "Password must include at least one number."
    return None


def name_error(value: str, label: str, required: bool = True) -> str | None:
    value = (value or "").strip()
    if not value:
        return f"{label} is required." if required else None
    if len(value) > NAME_MAX:
        return f"{label} must be {NAME_MAX} characters or fewer."
    if not NAME_RE.match(value):
        return f"{label} may only contain letters, spaces, hyphens, periods, and apostrophes."
    return None
