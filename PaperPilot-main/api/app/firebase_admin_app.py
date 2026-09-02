from __future__ import annotations

import json
from pathlib import Path

from app.config import settings

_app = None
_init_attempted = False


def firebase_admin_app():
    global _app, _init_attempted
    if _init_attempted:
        return _app
    _init_attempted = True
    creds = (settings.firebase_credentials or "").strip()
    if not creds:
        return None
    try:
        import firebase_admin
        from firebase_admin import credentials

        if firebase_admin._apps:
            _app = firebase_admin.get_app()
            return _app
        if creds.startswith("{"):
            info = json.loads(creds)
            credential = credentials.Certificate(info)
        else:
            path = Path(creds)
            if not path.is_file():
                return None
            credential = credentials.Certificate(str(path))
        options = {}
        database_url = (settings.firebase_database_url or "").strip()
        if database_url:
            options["databaseURL"] = database_url
        _app = firebase_admin.initialize_app(credential, options)
        return _app
    except Exception:
        _app = None
        return None


def admin_auth():
    if not firebase_admin_app():
        return None
    from firebase_admin import auth

    return auth
