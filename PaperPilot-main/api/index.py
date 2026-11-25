"""Vercel Python entrypoint — FastAPI under /api, SPA from /public."""
from __future__ import annotations

import sys
from pathlib import Path

_API_DIR = Path(__file__).resolve().parent
if str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))

from starlette.responses import FileResponse  # noqa: E402

from app.main import app as _core_app  # noqa: E402

_PUBLIC_DIR = (_API_DIR.parent / "public").resolve()


class _VercelApp:
    """Route /api/* to FastAPI (strip prefix); serve Vite build for everything else."""

    def __init__(self, api_app, public_dir: Path):
        self.api_app = api_app
        self.public_dir = public_dir

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket"):
            await self.api_app(scope, receive, send)
            return

        path = scope.get("path") or ""

        # Dedicated webhook function path — leave untouched.
        if path == "/api/webhooks" or path.startswith("/api/webhooks/"):
            await self.api_app(scope, receive, send)
            return

        # Gateway API: /api and /api/... → FastAPI routes at /...
        if path == "/api" or path.startswith("/api/"):
            scope = dict(scope)
            new_path = path[4:] or "/"
            scope["path"] = new_path
            scope["raw_path"] = new_path.encode("utf-8")
            await self.api_app(scope, receive, send)
            return

        # Static SPA (and client-side router fallback to index.html)
        if scope["type"] == "http" and self.public_dir.is_dir():
            rel = path.lstrip("/") or "index.html"
            candidate = (self.public_dir / rel).resolve()
            try:
                candidate.relative_to(self.public_dir)
            except ValueError:
                candidate = self.public_dir / "index.html"
            if candidate.is_file():
                await FileResponse(candidate)(scope, receive, send)
                return
            index = self.public_dir / "index.html"
            if index.is_file():
                await FileResponse(index)(scope, receive, send)
                return

        await self.api_app(scope, receive, send)


app = _VercelApp(_core_app, _PUBLIC_DIR)
