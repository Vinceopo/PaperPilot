"""PayMongo Hosted Checkout helpers (urllib only — no extra dependencies)."""

from __future__ import annotations

import base64
import hmac
import json
import urllib.error
import urllib.request
from hashlib import sha256
from typing import Any

from app.config import settings

PAYMONGO_API_BASE = "https://api.paymongo.com/v2"
CHECKOUT_SESSIONS_URL = f"{PAYMONGO_API_BASE}/checkout_sessions"

# Amounts in centavos (₱949 / month, ₱9490 / year).
PREMIUM_AMOUNT_CENTAVOS = {
    "monthly": 94_900,
    "annual": 949_000,
}
PREMIUM_AMOUNT_PESOS = {
    "monthly": 949.0,
    "annual": 9490.0,
}


class PayMongoError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None, payload: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload


def _secret_key() -> str:
    key = (settings.paymongo_secret_key or "").strip()
    if not key:
        raise PayMongoError("PAYMONGO_SECRET_KEY is not configured.")
    return key


def _webhook_secret() -> str:
    secret = (settings.paymongo_webhook_secret or "").strip()
    if not secret:
        raise PayMongoError("PAYMONGO_WEBHOOK_SECRET is not configured.")
    return secret


def _public_url() -> str:
    url = (settings.app_public_url or "").strip().rstrip("/")
    if not url:
        raise PayMongoError("APP_PUBLIC_URL is not configured.")
    return url


def payment_method_types() -> list[str]:
    raw = (settings.paymongo_payment_methods or "card,gcash,paymaya").strip()
    methods = [part.strip().lower() for part in raw.split(",") if part.strip()]
    return methods or ["card", "gcash", "paymaya"]


def _basic_auth_header(secret_key: str) -> str:
    token = base64.b64encode(f"{secret_key}:".encode("utf-8")).decode("ascii")
    return f"Basic {token}"


def _request_json(method: str, url: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": _basic_auth_header(_secret_key()),
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(detail) if detail else None
        except json.JSONDecodeError:
            payload = detail
        message = "PayMongo request failed."
        if isinstance(payload, dict):
            errors = payload.get("errors")
            if isinstance(errors, list) and errors:
                first = errors[0] if isinstance(errors[0], dict) else {}
                message = str(first.get("detail") or first.get("title") or message)
        raise PayMongoError(message, status_code=exc.code, payload=payload) from exc
    except urllib.error.URLError as exc:
        raise PayMongoError(f"Could not reach PayMongo: {exc.reason}") from exc


def create_checkout_session(
    *,
    owner_uid: str,
    billing_period: str,
    description: str | None = None,
    metadata: dict[str, str] | None = None,
) -> dict:
    """Create a PayMongo Checkout Session and return id + checkout_url + amount."""
    period = (billing_period or "monthly").strip().lower()
    if period not in PREMIUM_AMOUNT_CENTAVOS:
        raise ValueError("Billing period must be monthly or annual.")

    amount = PREMIUM_AMOUNT_CENTAVOS[period]
    public_url = _public_url()
    attrs: dict[str, Any] = {
        "send_email_receipt": True,
        "show_description": True,
        "show_line_items": True,
        "description": description
        or f"PaperPilot Premium ({'Annual' if period == 'annual' else 'Monthly'})",
        "line_items": [
            {
                "currency": "PHP",
                "amount": amount,
                "name": "PaperPilot Premium",
                "quantity": 1,
                "description": "Premium subscription",
            }
        ],
        "payment_method_types": payment_method_types(),
        "success_url": f"{public_url}/?billing=success",
        "cancel_url": f"{public_url}/?billing=canceled",
        "metadata": {
            "owner_uid": owner_uid,
            "billing_period": period,
            "product": "paperpilot_premium",
            **(metadata or {}),
        },
    }

    payload = _request_json("POST", CHECKOUT_SESSIONS_URL, {"data": {"attributes": attrs}})
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        raise PayMongoError("PayMongo returned an unexpected checkout response.", payload=payload)

    attributes = data.get("attributes") if isinstance(data.get("attributes"), dict) else {}
    checkout_url = attributes.get("checkout_url")
    session_id = data.get("id")
    if not checkout_url or not session_id:
        raise PayMongoError("PayMongo checkout session is missing id or checkout_url.", payload=payload)

    return {
        "id": str(session_id),
        "checkout_url": str(checkout_url),
        "billing_period": period,
        "amount_centavos": amount,
        "amount": PREMIUM_AMOUNT_PESOS[period],
        "raw": data,
    }


def parse_signature_header(header: str | None) -> dict[str, str]:
    """Parse `t=...,te=...,li=...` into a dict."""
    parts: dict[str, str] = {}
    if not header:
        return parts
    for chunk in header.split(","):
        if "=" not in chunk:
            continue
        key, value = chunk.split("=", 1)
        parts[key.strip()] = value.strip()
    return parts


def verify_webhook_signature(raw_body: bytes, signature_header: str | None, *, livemode: bool | None = None) -> bool:
    """
    Verify Paymongo-Signature: HMAC-SHA256(secret, timestamp + '.' + rawBody).

    Compare against `te` (test) or `li` (live). When livemode is unknown, accept either match.
    """
    parsed = parse_signature_header(signature_header)
    timestamp = parsed.get("t")
    if not timestamp:
        return False

    secret = _webhook_secret()
    signed_payload = f"{timestamp}.".encode("utf-8") + raw_body
    digest = hmac.new(secret.encode("utf-8"), signed_payload, sha256).hexdigest()

    candidates: list[str] = []
    if livemode is True:
        candidates = [parsed.get("li") or ""]
    elif livemode is False:
        candidates = [parsed.get("te") or ""]
    else:
        candidates = [parsed.get("te") or "", parsed.get("li") or ""]

    return any(candidate and hmac.compare_digest(digest, candidate) for candidate in candidates)


def extract_event_type(payload: dict) -> str:
    """Normalize PayMongo webhook event type from common envelope shapes."""
    if not isinstance(payload, dict):
        return ""
    data = payload.get("data")
    if isinstance(data, dict):
        if isinstance(data.get("type"), str) and data["type"]:
            return data["type"]
        attrs = data.get("attributes")
        if isinstance(attrs, dict) and isinstance(attrs.get("type"), str) and attrs["type"]:
            return attrs["type"]
    direct = payload.get("type")
    return direct if isinstance(direct, str) else ""


def extract_checkout_session(payload: dict) -> dict | None:
    """Return the checkout_session resource from a webhook payload, if present."""
    if not isinstance(payload, dict):
        return None
    data = payload.get("data")
    if not isinstance(data, dict):
        return None

    # Shape A: { data: { type, data: { id, type, attributes } } }
    inner = data.get("data")
    if isinstance(inner, dict) and (inner.get("type") == "checkout_session" or str(inner.get("id") or "").startswith("cs_")):
        return inner

    # Shape B: resource itself at data
    if data.get("type") == "checkout_session" or str(data.get("id") or "").startswith("cs_"):
        return data

    return None


def payment_method_from_session(session: dict) -> str | None:
    """Best-effort payment method label from checkout session payments."""
    attrs = session.get("attributes") if isinstance(session, dict) else None
    if not isinstance(attrs, dict):
        return None
    payments = attrs.get("payments") or []
    if not isinstance(payments, list) or not payments:
        return None
    first = payments[0] if isinstance(payments[0], dict) else {}
    pay_attrs = first.get("attributes") if isinstance(first.get("attributes"), dict) else {}
    source = pay_attrs.get("source") if isinstance(pay_attrs.get("source"), dict) else {}
    method = str(source.get("type") or pay_attrs.get("source_type") or "").strip().lower()
    if method == "paymaya":
        return "maya"
    if method in {"card", "gcash", "maya", "grab_pay", "qrph"}:
        return method
    return method or None
