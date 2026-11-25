"""Vercel Python entrypoint — FastAPI under /api with path prefix stripped."""
from __future__ import annotations

import sys
from pathlib import Path

_API_DIR = Path(__file__).resolve().parent
if str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))

from app.main import app as _core_app  # noqa: E402

# Serve the Vite SPA from /public when present (Vercel CDN promotion).
_public_dir = _API_DIR.parent / "public"
if _public_dir.is_dir() and hasattr(_core_app, "frontend"):
    _core_app.frontend("/", directory=str(_public_dir))


class _StripApiPrefix:
    """Map /api/... → /... so existing FastAPI routes keep working on Vercel."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            path = scope.get("path") or ""
            if path == "/api" or path.startswith("/api/"):
                # Keep webhook routes on their dedicated function path.
                if path == "/api/webhooks" or path.startswith("/api/webhooks/"):
                    await self.app(scope, receive, send)
                    return
                scope = dict(scope)
                new_path = path[4:] or "/"
                scope["path"] = new_path
                scope["raw_path"] = new_path.encode("utf-8")
        await self.app(scope, receive, send)


app = _StripApiPrefix(_core_app)
