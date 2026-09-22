"""Inner-project Vercel entry for PayMongo webhook (when deploying from PaperPilot-main/)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

_API_DIR = Path(__file__).resolve().parents[1]
if str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))

from app.compliance_db import init_db as init_compliance_db  # noqa: E402
from app.paymongo import verify_webhook_signature  # noqa: E402
from app.paymongo_events import handle_paymongo_event  # noqa: E402

init_compliance_db()

app = FastAPI(title="PaperPilot PayMongo Webhook", docs_url=None, redoc_url=None)


async def _handle(request: Request, paymongo_signature: str | None) -> JSONResponse:
    raw = await request.body()
    if not verify_webhook_signature(raw, paymongo_signature):
        raise HTTPException(status_code=403, detail="Invalid PayMongo webhook signature.")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook JSON.") from exc
    result = handle_paymongo_event(payload if isinstance(payload, dict) else {})
    return JSONResponse(result, status_code=200)


@app.post("/")
@app.post("")
async def paymongo_webhook_root(
    request: Request,
    paymongo_signature: str | None = Header(default=None, alias="Paymongo-Signature"),
):
    return await _handle(request, paymongo_signature)


@app.api_route("/{full_path:path}", methods=["POST"])
async def paymongo_webhook_any(
    full_path: str,
    request: Request,
    paymongo_signature: str | None = Header(default=None, alias="Paymongo-Signature"),
):
    del full_path
    return await _handle(request, paymongo_signature)
