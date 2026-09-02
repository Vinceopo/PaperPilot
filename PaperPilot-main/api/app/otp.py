from __future__ import annotations

import hashlib
import hmac
import logging
import math
import secrets
import sqlite3
import threading
import time
from pathlib import Path

from app.config import settings

log = logging.getLogger("paperpilot.otp")

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "otp.db"
SECRET_PATH = DATA_DIR / "otp_secret"
_lock = threading.Lock()
_secret_cache: bytes | None = None

PURPOSES = frozenset({"verify_email", "reset_password"})
RATE_WINDOW_SECONDS = 3600


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _lock:
        conn = _connect()
        try:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS otps (
                    email TEXT NOT NULL,
                    purpose TEXT NOT NULL,
                    code_hash TEXT NOT NULL,
                    expires_at REAL NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL,
                    PRIMARY KEY (email, purpose)
                );
                CREATE TABLE IF NOT EXISTS challenges (
                    token TEXT PRIMARY KEY,
                    email TEXT NOT NULL,
                    purpose TEXT NOT NULL,
                    expires_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS otp_sends (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT NOT NULL,
                    purpose TEXT NOT NULL,
                    created_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_otp_sends_lookup
                    ON otp_sends (email, purpose, created_at);
                """
            )
            conn.commit()
        finally:
            conn.close()


def _secret() -> bytes:
    """HMAC key for hashing codes at rest, so a leaked DB cannot be brute-forced."""
    global _secret_cache
    if _secret_cache is not None:
        return _secret_cache
    configured = (settings.otp_secret or "").strip()
    if configured:
        _secret_cache = configured.encode("utf-8")
        return _secret_cache
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        if SECRET_PATH.is_file():
            stored = SECRET_PATH.read_text(encoding="utf-8").strip()
            if stored:
                _secret_cache = stored.encode("utf-8")
                return _secret_cache
        generated = secrets.token_hex(32)
        SECRET_PATH.write_text(generated, encoding="utf-8")
        _secret_cache = generated.encode("utf-8")
    except OSError as exc:
        # Falling back to a per-process key only invalidates codes across restarts.
        log.warning("Could not persist OTP secret (%s). Using an in-memory key.", exc)
        _secret_cache = secrets.token_hex(32).encode("utf-8")
    return _secret_cache


def _hash_code(email: str, purpose: str, code: str) -> str:
    payload = f"{email.lower()}|{purpose}|{code}".encode("utf-8")
    return hmac.new(_secret(), payload, hashlib.sha256).hexdigest()


def generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _prune(conn: sqlite3.Connection, now: float) -> None:
    conn.execute("DELETE FROM otps WHERE expires_at < ?", (now,))
    conn.execute("DELETE FROM challenges WHERE expires_at < ?", (now,))
    conn.execute("DELETE FROM otp_sends WHERE created_at < ?", (now - RATE_WINDOW_SECONDS,))


def can_send(email: str, purpose: str) -> tuple[bool, int, str]:
    """Rate limit code delivery. Returns (allowed, wait_seconds, reason)."""
    now = time.time()
    with _lock:
        conn = _connect()
        try:
            _prune(conn, now)
            conn.commit()
            rows = conn.execute(
                """
                SELECT created_at FROM otp_sends
                WHERE email = ? AND purpose = ?
                ORDER BY created_at DESC
                """,
                (email.lower(), purpose),
            ).fetchall()
        finally:
            conn.close()

    if not rows:
        return True, 0, ""

    cooldown = math.ceil(settings.otp_resend_seconds - (now - rows[0]["created_at"]))
    if cooldown > 0:
        return False, cooldown, f"Please wait {cooldown} second(s) before requesting a new code."

    cap = max(settings.otp_max_sends_per_hour, 1)
    if len(rows) >= cap:
        # Wait until enough of the oldest sends age out of the rolling window.
        blocking = rows[min(cap - 1, len(rows) - 1)]["created_at"]
        wait = max(math.ceil(RATE_WINDOW_SECONDS - (now - blocking)), 1)
        minutes = max(math.ceil(wait / 60), 1)
        return False, wait, f"Too many codes requested. Try again in about {minutes} minute(s)."

    return True, 0, ""


def store_otp(email: str, purpose: str, code: str) -> int:
    """Persist a new code, invalidating any previous one for this email/purpose."""
    now = time.time()
    expires = now + settings.otp_ttl_seconds
    digest = _hash_code(email, purpose, code)
    with _lock:
        conn = _connect()
        try:
            _prune(conn, now)
            conn.execute(
                """
                INSERT INTO otps (email, purpose, code_hash, expires_at, attempts, created_at)
                VALUES (?, ?, ?, ?, 0, ?)
                ON CONFLICT(email, purpose) DO UPDATE SET
                    code_hash = excluded.code_hash,
                    expires_at = excluded.expires_at,
                    attempts = 0,
                    created_at = excluded.created_at
                """,
                (email.lower(), purpose, digest, expires, now),
            )
            # An outstanding verified challenge for the same purpose is stale now.
            conn.execute(
                "DELETE FROM challenges WHERE email = ? AND purpose = ?",
                (email.lower(), purpose),
            )
            conn.execute(
                "INSERT INTO otp_sends (email, purpose, created_at) VALUES (?, ?, ?)",
                (email.lower(), purpose, now),
            )
            conn.commit()
        finally:
            conn.close()
    return settings.otp_ttl_seconds


def verify_otp(email: str, purpose: str, code: str) -> str:
    """Check a code and exchange it for a single-use challenge token."""
    now = time.time()
    code = (code or "").strip()
    if not code.isdigit() or len(code) != 6:
        raise ValueError("Enter the 6-digit code from your email.")
    digest = _hash_code(email, purpose, code)
    with _lock:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT code_hash, expires_at, attempts FROM otps WHERE email = ? AND purpose = ?",
                (email.lower(), purpose),
            ).fetchone()
            if not row:
                raise ValueError("No active code for this email. Request a new one.")
            if now > row["expires_at"]:
                conn.execute("DELETE FROM otps WHERE email = ? AND purpose = ?", (email.lower(), purpose))
                conn.commit()
                raise ValueError("This code has expired. Request a new one.")
            if row["attempts"] >= settings.otp_max_attempts:
                conn.execute("DELETE FROM otps WHERE email = ? AND purpose = ?", (email.lower(), purpose))
                conn.commit()
                raise ValueError("Too many incorrect attempts. Request a new code.")
            if not hmac.compare_digest(row["code_hash"], digest):
                attempts = row["attempts"] + 1
                left = max(settings.otp_max_attempts - attempts, 0)
                if left == 0:
                    conn.execute("DELETE FROM otps WHERE email = ? AND purpose = ?", (email.lower(), purpose))
                    conn.commit()
                    raise ValueError("Too many incorrect attempts. Request a new code.")
                conn.execute(
                    "UPDATE otps SET attempts = ? WHERE email = ? AND purpose = ?",
                    (attempts, email.lower(), purpose),
                )
                conn.commit()
                raise ValueError(f"Incorrect code. {left} attempt(s) left.")
            token = secrets.token_urlsafe(32)
            conn.execute("DELETE FROM otps WHERE email = ? AND purpose = ?", (email.lower(), purpose))
            conn.execute(
                "INSERT INTO challenges (token, email, purpose, expires_at) VALUES (?, ?, ?, ?)",
                (token, email.lower(), purpose, now + settings.otp_ttl_seconds),
            )
            conn.commit()
            return token
        finally:
            conn.close()


def consume_challenge(token: str, email: str, purpose: str) -> None:
    now = time.time()
    with _lock:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT email, purpose, expires_at FROM challenges WHERE token = ?",
                (token,),
            ).fetchone()
            if not row or now > row["expires_at"]:
                if row:
                    conn.execute("DELETE FROM challenges WHERE token = ?", (token,))
                    conn.commit()
                raise ValueError("Verification expired. Request a new code.")
            if row["email"] != email.lower() or row["purpose"] != purpose:
                raise ValueError("Verification does not match this email.")
            conn.execute("DELETE FROM challenges WHERE token = ?", (token,))
            conn.commit()
        finally:
            conn.close()
