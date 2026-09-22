"""
Dedicated Vercel serverless function for PayMongo webhooks.

URL: https://paperpilotph.vercel.app/api/webhooks/paymongo

Separate from the main FastAPI app so:
  - raw request body is available for HMAC verification
  - webhook traffic does not share the long-timeout compliance function cold-start path

Env (Vercel project settings — never commit):
  PAYMONGO_WEBHOOK_SECRET
  PAYMONGO_SECRET_KEY          (only if handlers need API follow-ups)
  FIREBASE_CREDENTIALS / FIREBASE_DATABASE_URL
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

_ROOT = Path(__file__).resolve().parents[2]
_INNER_API = _ROOT / "PaperPilot-main" / "api"
if str(_INNER_API) not in sys.path:
    sys.path.insert(0, str(_INNER_API))

from app.compliance_db import init_db as init_compliance_db  # noqa: E402
from app.paymongo import verify_webhook_signature  # noqa: E402
from app.paymongo_events import handle_paymongo_event  # noqa: E402

init_compliance_db()

app = FastAPI(title="PaperPilot PayMongo Webhook", docs_url=None, redoc_url=None)


async def _handle(request: Request, paymongo_signature: str | None) -> JSONResponse:
    # Read RAW bytes before any JSON parse — required for Paymongo-Signature HMAC.
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


@app.get("/")
def health():
    return {"ok": True, "service": "paperpilot-paymongo-webhook"}
