from __future__ import annotations

import json
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
    """Resolve a service-account path from cwd, api/, project, or parent folder."""
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

    return _discover_credentials_file()


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

            if creds.startswith("{"):
                info = json.loads(creds)
                credential = credentials.Certificate(info)
            elif creds:
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
