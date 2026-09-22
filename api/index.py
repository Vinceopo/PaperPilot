"""Outer Vercel entry — loads PaperPilot FastAPI from PaperPilot-main/api."""
from __future__ import annotations

import sys
from pathlib import Path

_INNER_API = Path(__file__).resolve().parent.parent / "PaperPilot-main" / "api"
if str(_INNER_API) not in sys.path:
    sys.path.insert(0, str(_INNER_API))

from app.main import app as _core_app  # noqa: E402


class _StripApiPrefix:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            path = scope.get("path") or ""
            if path == "/api" or path.startswith("/api/"):
                scope = dict(scope)
                new_path = path[4:] or "/"
                scope["path"] = new_path
                scope["raw_path"] = new_path.encode("utf-8")
        await self.app(scope, receive, send)


app = _StripApiPrefix(_core_app)
