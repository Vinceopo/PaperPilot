from __future__ import annotations

import base64
import binascii
import json
import re
import threading
from pathlib import Path

from app.config import settings

_app = None
_init_lock = threading.Lock()

_API_ROOT = Path(__file__).resolve().parent.parent
_PROJECT_ROOT = _API_ROOT.parent
_OUTER_ROOT = _PROJECT_ROOT.parent


def _discover_credentials_file() -> Path | None:
    for folder in (_API_ROOT, _PROJECT_ROOT, _OUTER_ROOT, Path.cwd()):
        try:
            matches = sorted(folder.glob("*firebase-adminsdk*.json"))
        except OSError:
            continue
        if matches:
            return matches[0].resolve()
    return None


def _resolve_credentials_path(raw: str) -> Path | None:
    """Resolve an explicit service-account path. Do not substitute a different file."""
    path = Path(raw.strip().strip('"').strip("'")).expanduser()
    candidates = []
    if path.is_absolute():
        candidates.append(path)
    else:
        candidates.extend(
            [
                Path.cwd() / path,
                _API_ROOT / path,
                _PROJECT_ROOT / path,
                _OUTER_ROOT / path,
                _API_ROOT / path.name,
                _PROJECT_ROOT / path.name,
                _OUTER_ROOT / path.name,
            ]
        )
    for candidate in candidates:
        try:
            if candidate.is_file():
                return candidate.resolve()
        except OSError:
            continue
    return None


def _normalize_private_key(info: dict) -> dict:
    pk = info.get("private_key")
    if isinstance(pk, str):
        info["private_key"] = pk.replace("\\n", "\n")
    return info


def _parse_service_account(raw: str) -> dict | None:
    """Load a service account from raw JSON or base64(JSON).

    Base64 is the reliable form for Vercel: a PEM pasted into an env var often
    loses newlines, and Google then rejects the JWT as an invalid signature.

    Also accepts a common dotenv-mangled form where the whole pretty-printed JSON
    was escaped with literal ``\\n`` sequences (invalid as strict JSON until fixed).
    """
    text = raw.strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'":
        text = text[1:-1].strip()
    if not text.startswith("{"):
        try:
            decoded = base64.b64decode(text, validate=True).decode("utf-8").strip()
        except (binascii.Error, UnicodeDecodeError, ValueError):
            return None
        if not decoded.startswith("{"):
            return None
        text = decoded
    info: dict | None
    try:
        parsed = json.loads(text)
        info = parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        info = _parse_dotenv_mangled_service_account(text)
    if not info or not info.get("private_key") or not info.get("client_email"):
        return None
    return _normalize_private_key(info)


def _parse_dotenv_mangled_service_account(text: str) -> dict | None:
    """Recover JSON when pretty-printed SA JSON was stored with literal \\n escapes."""
    if "\\n" in text:
        pretty = text.replace("\\n", "\n").replace("\\r", "").replace("\r", "")
    else:
        pretty = text
    required = (
        "type",
        "project_id",
        "private_key_id",
        "private_key",
        "client_email",
        "client_id",
        "auth_uri",
        "token_uri",
        "auth_provider_x509_cert_url",
        "client_x509_cert_url",
    )
    info: dict[str, str] = {}
    for name in required:
        match = re.search(rf'"{re.escape(name)}"\s*:\s*"(.*?)"', pretty, flags=re.S)
        if not match:
            return None
        info[name] = match.group(1)
    universe = re.search(r'"universe_domain"\s*:\s*"(.*?)"', pretty, flags=re.S)
    if universe:
        info["universe_domain"] = universe.group(1)
    if "BEGIN PRIVATE KEY" not in info.get("private_key", ""):
        return None
    return info


def firebase_admin_app():
    global _app
    if _app is not None:
        return _app
    with _init_lock:
        if _app is not None:
            return _app
        creds = (settings.firebase_credentials or "").strip()
        try:
            import firebase_admin
            from firebase_admin import credentials

            if firebase_admin._apps:
                _app = firebase_admin.get_app()
                return _app

            if creds:
                info = _parse_service_account(creds)
                if info:
                    credential = credentials.Certificate(info)
                else:
                    path = _resolve_credentials_path(creds)
                    if not path:
                        return None
                    credential = credentials.Certificate(str(path))
            else:
                # Dev convenience: pick up a local service-account JSON if env is blank.
                path = _discover_credentials_file()
                if not path:
                    return None
                credential = credentials.Certificate(str(path))

            options = {}
            database_url = (getattr(settings, "firebase_database_url", None) or "").strip()
            if database_url:
                options["databaseURL"] = database_url
            _app = firebase_admin.initialize_app(credential, options or None)
            return _app
        except Exception:
            _app = None
            return None


def admin_auth():
    if not firebase_admin_app():
        return None
    from firebase_admin import auth

    return auth
