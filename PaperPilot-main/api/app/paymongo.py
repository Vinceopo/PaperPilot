"""PayMongo Checkout Sessions + webhook signature verification."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import settings

PAYMONGO_API = "https://api.paymongo.com"
CHECKOUT_SESSIONS_URL = f"{PAYMONGO_API}/v1/checkout_sessions"

# Amounts are in centavos (₱1.00 = 100).
PREMIUM_MONTHLY_CENTAVOS = 94_900
PREMIUM_ANNUAL_CENTAVOS = 949_000

DEFAULT_PAYMENT_METHODS = ["card", "gcash", "paymaya", "grab_pay", "qrph"]


class PayMongoError(Exception):
    def __init__(self, message: str, status: int = 502, detail: Any = None):
        self.status = status
        self.detail = detail
        super().__init__(message)


def _auth_header(secret_key: str) -> str:
    token = base64.b64encode(f"{secret_key}:".encode("utf-8")).decode("ascii")
    return f"Basic {token}"


def _request_json(method: str, url: str, payload: dict | None = None) -> dict:
    secret = (settings.paymongo_secret_key or "").strip()
    if not secret:
        raise PayMongoError(
            "PayMongo is not configured. Set PAYMONGO_SECRET_KEY on the API.",
            status=503,
        )
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    req = Request(
        url,
        data=body,
        method=method,
        headers={
            "Authorization": _auth_header(secret),
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(req, timeout=30) as res:
            raw = res.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(err_body) if err_body else {}
        except json.JSONDecodeError:
            parsed = {"raw": err_body}
        errors = parsed.get("errors") if isinstance(parsed, dict) else None
        message = "PayMongo request failed."
        if isinstance(errors, list) and errors:
            first = errors[0] if isinstance(errors[0], dict) else {}
            message = str(first.get("detail") or first.get("title") or message)
        raise PayMongoError(message, status=502, detail=parsed) from exc
    except URLError as exc:
        raise PayMongoError(f"Could not reach PayMongo: {exc.reason}", status=502) from exc


def plan_amount_centavos(billing_period: str) -> int:
    return PREMIUM_ANNUAL_CENTAVOS if billing_period == "annual" else PREMIUM_MONTHLY_CENTAVOS


def plan_amount_pesos(billing_period: str) -> int:
    return plan_amount_centavos(billing_period) // 100


def retrieve_checkout_session(checkout_session_id: str) -> dict:
    """GET Checkout Session (secret key) — includes payments when paid."""
    sid = (checkout_session_id or "").strip()
    if not sid:
        raise PayMongoError("Checkout session id is required.", status=400)
    try:
        return _request_json("GET", f"{PAYMONGO_API}/v1/checkout_sessions/{sid}")
    except PayMongoError:
        return _request_json("GET", f"{PAYMONGO_API}/v2/checkout_sessions/{sid}")


def checkout_session_is_paid(session_payload: dict) -> bool:
    data = session_payload.get("data") if isinstance(session_payload, dict) else None
    if not isinstance(data, dict):
        return False
    attrs = data.get("attributes") if isinstance(data.get("attributes"), dict) else {}
    payments = attrs.get("payments")
    if isinstance(payments, list):
        for payment in payments:
            if not isinstance(payment, dict):
                continue
            pay_attrs = payment.get("attributes") if isinstance(payment.get("attributes"), dict) else {}
            if str(pay_attrs.get("status") or "").lower() == "paid":
                return True
    intent = attrs.get("payment_intent") if isinstance(attrs.get("payment_intent"), dict) else {}
    intent_attrs = intent.get("attributes") if isinstance(intent.get("attributes"), dict) else {}
    if str(intent_attrs.get("status") or "").lower() in ("succeeded", "paid"):
        return True
    return False


def create_checkout_session(
    *,
    uid: str,
    billing_period: str,
    success_url: str,
    cancel_url: str,
    customer_email: str | None = None,
    customer_name: str | None = None,
    reference_number: str,
) -> dict:
    period = "annual" if billing_period == "annual" else "monthly"
    amount = plan_amount_centavos(period)
    label = "PaperPilot Premium (Annual)" if period == "annual" else "PaperPilot Premium (Monthly)"
    description = (
        "50 scans/month · APA, MLA & IEEE · version history"
        if period == "monthly"
        else "Annual Premium — 50 scans/month · APA, MLA & IEEE · version history"
    )
    methods = [
        m.strip()
        for m in (settings.paymongo_payment_methods or "").split(",")
        if m.strip()
    ] or DEFAULT_PAYMENT_METHODS

    attributes: dict[str, Any] = {
        "send_email_receipt": True,
        "show_description": True,
        "show_line_items": True,
        "description": description,
        "line_items": [
            {
                "currency": "PHP",
                "amount": amount,
                "name": label,
                "quantity": 1,
                "description": description,
            }
        ],
        "payment_method_types": methods,
        "success_url": success_url,
        "cancel_url": cancel_url,
        "reference_number": reference_number[:100],
        "metadata": {
            "uid": uid,
            "billing_period": period,
            "tier": "premium",
            "product": "paperpilot_premium",
        },
    }
    billing: dict[str, str] = {}
    if customer_email:
        billing["email"] = customer_email
    if customer_name:
        billing["name"] = customer_name
    if billing:
        attributes["billing"] = billing

    # Prefer v2 when available; fall back to v1 for older accounts.
    payload = {"data": {"attributes": attributes}}
    try:
        return _request_json("POST", f"{PAYMONGO_API}/v2/checkout_sessions", payload)
    except PayMongoError as exc:
        # Some accounts still use v1 create endpoint.
        if exc.status == 502:
            return _request_json("POST", CHECKOUT_SESSIONS_URL, payload)
        raise


def parse_signature_header(header: str) -> dict[str, str]:
    parts: dict[str, str] = {}
    for chunk in (header or "").split(","):
        if "=" not in chunk:
            continue
        key, value = chunk.split("=", 1)
        parts[key.strip()] = value.strip()
    return parts


def verify_webhook_signature(
    raw_body: bytes,
    signature_header: str | None,
    *,
    tolerance_seconds: int = 300,
) -> bool:
    secret = (settings.paymongo_webhook_secret or "").strip()
    if not secret:
        return False
    if not signature_header:
        return False
    parts = parse_signature_header(signature_header)
    timestamp = parts.get("t")
    if not timestamp:
        return False
    try:
        ts = int(timestamp)
    except ValueError:
        return False
    if tolerance_seconds > 0 and abs(int(time.time()) - ts) > tolerance_seconds:
        return False

    signed = f"{timestamp}.".encode("utf-8") + raw_body
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    candidates = [parts.get("te") or "", parts.get("li") or ""]
    return any(
        candidate and hmac.compare_digest(expected, candidate) for candidate in candidates
    )


def extract_event(payload: dict) -> tuple[str, dict, str]:
    """Normalize PayMongo webhook envelope → (event_type, resource, event_id).

    Supports both shapes PayMongo documents:
      A) { data: { type: "<event>", data: { id, attributes } } }
      B) { data: { id: "evt_…", type: "event", attributes: { type: "<event>", data: {…} } } }
    """
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        return "", {}, ""

    event_id = str(data.get("id") or "")
    attrs = data.get("attributes") if isinstance(data.get("attributes"), dict) else {}

    # Shape B — Event resource wrapper
    if data.get("type") == "event" or (
        isinstance(attrs.get("type"), str) and "." in str(attrs.get("type") or "")
    ):
        event_type = str(attrs.get("type") or "")
        resource = attrs.get("data") if isinstance(attrs.get("data"), dict) else {}
        if not event_id:
            event_id = str(attrs.get("id") or "")
        return event_type, resource if isinstance(resource, dict) else {}, event_id

    # Shape A — flat event type on data.type
    event_type = str(data.get("type") or payload.get("type") or "")
    resource = data.get("data") if isinstance(data.get("data"), dict) else data
    if event_type == "event" and isinstance(attrs.get("data"), dict):
        event_type = str(attrs.get("type") or "")
        resource = attrs["data"]
    return event_type, resource if isinstance(resource, dict) else {}, event_id
