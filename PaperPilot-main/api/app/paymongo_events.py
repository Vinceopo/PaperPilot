"""Dispatch PayMongo webhook events → subscription / payment state changes.

Tier upgrades/downgrades happen ONLY here (never from client redirects).
"""
from __future__ import annotations

import logging
from typing import Any

from app.compliance_db import (
    activate_premium_from_payment,
    claim_webhook_event,
    complete_webhook_event,
    downgrade_to_free_from_payment,
    flag_payment_issue,
    get_pending_checkout,
    get_uid_for_payment,
    get_uid_for_paymongo_subscription,
    link_paymongo_subscription,
    log_merchant_event,
    mark_checkout_failed,
    renew_premium_period,
    sync_subscription_fields,
)
from app.paymongo import extract_event

logger = logging.getLogger("paperpilot.paymongo")


def _attrs(resource: dict) -> dict:
    raw = resource.get("attributes") if isinstance(resource, dict) else None
    return raw if isinstance(raw, dict) else {}


def _metadata(resource: dict) -> dict:
    meta = _attrs(resource).get("metadata")
    return meta if isinstance(meta, dict) else {}


def _payment_source_type(resource: dict) -> str | None:
    attrs = _attrs(resource)
    payments = attrs.get("payments")
    if isinstance(payments, list) and payments:
        first = payments[0] if isinstance(payments[0], dict) else {}
        pay_attrs = first.get("attributes") if isinstance(first.get("attributes"), dict) else {}
        source = pay_attrs.get("source") if isinstance(pay_attrs.get("source"), dict) else {}
        return source.get("type") or first.get("type")
    source = attrs.get("source") if isinstance(attrs.get("source"), dict) else {}
    return source.get("type")


def _amount_pesos(resource: dict, pending: dict | None = None) -> int | None:
    attrs = _attrs(resource)
    payments = attrs.get("payments")
    if isinstance(payments, list) and payments and isinstance(payments[0], dict):
        pay_attrs = payments[0].get("attributes") if isinstance(payments[0].get("attributes"), dict) else {}
        amount = pay_attrs.get("amount")
        if isinstance(amount, int):
            return amount // 100
    amount = attrs.get("amount")
    if isinstance(amount, int):
        return amount // 100
    if pending and pending.get("amount") is not None:
        try:
            return int(pending["amount"])
        except (TypeError, ValueError):
            return None
    return None


def _first_payment_id(resource: dict) -> str | None:
    attrs = _attrs(resource)
    payments = attrs.get("payments")
    if isinstance(payments, list) and payments and isinstance(payments[0], dict):
        pid = payments[0].get("id")
        return str(pid) if pid else None
    rid = resource.get("id") if isinstance(resource, dict) else None
    if rid and str(rid).startswith("pay_"):
        return str(rid)
    return None


def _resolve_uid(resource: dict, *, checkout_session_id: str | None = None) -> tuple[str, str, dict | None]:
    """Return (uid, billing_period, pending_checkout)."""
    meta = _metadata(resource)
    uid = str(meta.get("uid") or "").strip()
    billing_period = str(meta.get("billing_period") or "monthly").lower()
    pending = None
    session_id = checkout_session_id or str(resource.get("id") or "")
    if session_id.startswith("cs_"):
        pending = get_pending_checkout(session_id)
        if pending:
            uid = uid or str(pending.get("owner_uid") or "")
            billing_period = str(pending.get("billing_period") or billing_period).lower()
    if billing_period not in ("monthly", "annual"):
        billing_period = "monthly"
    return uid, billing_period, pending


def fulfill_checkout_paid(resource: dict) -> bool:
    session_id = str(resource.get("id") or "")
    uid, billing_period, pending = _resolve_uid(resource, checkout_session_id=session_id)
    if pending and pending.get("status") == "paid":
        return False  # already fulfilled
    if not uid:
        logger.warning("checkout paid without uid session=%s", session_id)
        return False
    attrs = _attrs(resource)
    activate_premium_from_payment(
        uid,
        billing_period=billing_period,
        payment_method=_payment_source_type(resource) or "paymongo",
        amount_pesos=_amount_pesos(resource, pending),
        checkout_session_id=session_id or None,
        payment_id=_first_payment_id(resource),
        reference_number=str(attrs.get("reference_number") or "") or None,
    )
    return True


def fulfill_link_paid(resource: dict) -> bool:
    """Payment Link purchases — same Premium activation path when uid is in metadata."""
    meta = _metadata(resource)
    uid = str(meta.get("uid") or "").strip()
    if not uid:
        logger.info("link.payment.paid without uid — acknowledged only")
        return False
    billing_period = str(meta.get("billing_period") or "monthly").lower()
    if billing_period not in ("monthly", "annual"):
        billing_period = "monthly"
    attrs = _attrs(resource)
    activate_premium_from_payment(
        uid,
        billing_period=billing_period,
        payment_method=_payment_source_type(resource) or "link",
        amount_pesos=_amount_pesos(resource),
        checkout_session_id=None,
        payment_id=_first_payment_id(resource) or str(resource.get("id") or "") or None,
        reference_number=str(attrs.get("reference_number") or attrs.get("external_reference_number") or "")
        or None,
    )
    return True


def handle_paymongo_event(payload: dict) -> dict[str, Any]:
    """
    Process one verified webhook payload.
    Idempotent via event id claim. Always safe to call after signature verification.
    """
    event_type, resource, event_id = extract_event(payload)
    result: dict[str, Any] = {"ok": True, "type": event_type or None, "handled": False, "duplicate": False}

    if event_id and not claim_webhook_event(event_id, event_type):
        result["duplicate"] = True
        return result

    try:
        handled = _dispatch(event_type, resource)
        result["handled"] = bool(handled)
    except Exception:
        logger.exception("PayMongo event handler failed type=%s id=%s", event_type, event_id)
        result["handled"] = False
        # Still mark processed so a poison message does not loop forever;
        # operators can replay from PayMongo dashboard after a fix.
    finally:
        if event_id:
            complete_webhook_event(event_id)

    return result


def _dispatch(event_type: str, resource: dict) -> bool:
    if not event_type:
        return False

    if event_type == "checkout_session.payment.paid":
        return fulfill_checkout_paid(resource)

    if event_type == "link.payment.paid":
        return fulfill_link_paid(resource)

    if event_type == "source.chargeable":
        # Hosted Checkout does not use the Sources charge flow; acknowledge safely.
        logger.info("source.chargeable acknowledged id=%s", resource.get("id"))
        log_merchant_event("source.chargeable", resource)
        return True

    if event_type == "payment.paid":
        meta = _metadata(resource)
        uid = str(meta.get("uid") or "").strip()
        cs_id = meta.get("checkout_session_id")
        if not uid and cs_id:
            pending = get_pending_checkout(str(cs_id))
            uid = str((pending or {}).get("owner_uid") or "")
        if not uid:
            # May already have been fulfilled via checkout_session.payment.paid
            logger.info("payment.paid without uid — ack id=%s", resource.get("id"))
            return False
        attrs = _attrs(resource)
        amount = attrs.get("amount")
        activate_premium_from_payment(
            uid,
            billing_period=str(meta.get("billing_period") or "monthly"),
            payment_method=_payment_source_type(resource) or "paymongo",
            amount_pesos=(amount // 100) if isinstance(amount, int) else None,
            checkout_session_id=str(cs_id) if cs_id else None,
            payment_id=str(resource.get("id") or "") or None,
            reference_number=attrs.get("external_reference_number"),
        )
        return True

    if event_type == "payment.failed":
        attrs = _attrs(resource)
        meta = _metadata(resource)
        cs_id = meta.get("checkout_session_id")
        if cs_id:
            mark_checkout_failed(str(cs_id), reason=str(attrs.get("status") or "failed"))
        uid = str(meta.get("uid") or "").strip()
        if uid:
            # Record failure only — never auto-downgrade an active Premium on a failed attempt.
            flag_payment_issue(uid, reason="payment.failed", event_type=event_type)
        return True

    if event_type in ("payment.refunded", "payment.refund.updated"):
        attrs = _attrs(resource)
        payment_id = str(resource.get("id") or attrs.get("payment_id") or "")
        # Nested refund resource may point at the payment via attributes.payment_id
        status = str(attrs.get("status") or "").lower()
        # Only full reverse should drop Premium (succeeded refund / fully refunded payment).
        if event_type == "payment.refunded" or status in ("succeeded", "refunded"):
            if payment_id:
                downgrade_to_free_from_payment(
                    payment_id,
                    reason=event_type,
                )
                return True
        log_merchant_event(event_type, resource)
        return True

    if event_type == "subscription.activated":
        meta = _metadata(resource)
        uid = str(meta.get("uid") or "").strip()
        sub_id = str(resource.get("id") or "")
        if not uid:
            logger.warning("subscription.activated without uid sub=%s", sub_id)
            return False
        if sub_id:
            link_paymongo_subscription(sub_id, uid)
        activate_premium_from_payment(
            uid,
            billing_period=str(meta.get("billing_period") or "monthly"),
            payment_method="paymongo_subscription",
            amount_pesos=_amount_pesos(resource),
            checkout_session_id=None,
            payment_id=None,
            reference_number=sub_id or None,
        )
        return True

    if event_type == "subscription.invoice.paid":
        meta = _metadata(resource)
        uid = str(meta.get("uid") or "").strip()
        sub_id = str(meta.get("subscription_id") or resource.get("id") or "")
        if not uid and sub_id:
            uid = get_uid_for_paymongo_subscription(sub_id) or ""
        if not uid:
            return False
        renew_premium_period(
            uid,
            billing_period=str(meta.get("billing_period") or "monthly"),
            payment_id=_first_payment_id(resource),
            amount_pesos=_amount_pesos(resource),
        )
        return True

    if event_type in (
        "subscription.invoice.payment_failed",
        "subscription.past_due",
        "subscription.invoice.created",
        "subscription.invoice.finalized",
    ):
        # Grace policy: flag payment issues; do not immediate-downgrade on past_due / failed invoice.
        if event_type in ("subscription.invoice.payment_failed", "subscription.past_due"):
            meta = _metadata(resource)
            uid = str(meta.get("uid") or "").strip()
            sub_id = str(meta.get("subscription_id") or resource.get("id") or "")
            if not uid and sub_id:
                uid = get_uid_for_paymongo_subscription(sub_id) or ""
            if uid:
                flag_payment_issue(uid, reason=event_type, event_type=event_type)
                return True
        log_merchant_event(event_type, resource)
        return True

    if event_type == "subscription.unpaid":
        meta = _metadata(resource)
        uid = str(meta.get("uid") or "").strip()
        sub_id = str(resource.get("id") or meta.get("subscription_id") or "")
        if not uid and sub_id:
            uid = get_uid_for_paymongo_subscription(sub_id) or ""
        if uid:
            downgrade_to_free_from_payment(None, owner_uid=uid, reason="subscription.unpaid")
            return True
        return False

    if event_type == "subscription.updated":
        meta = _metadata(resource)
        uid = str(meta.get("uid") or "").strip()
        sub_id = str(resource.get("id") or "")
        if not uid and sub_id:
            uid = get_uid_for_paymongo_subscription(sub_id) or ""
        if uid:
            sync_subscription_fields(uid, resource)
            return True
        return False

    if event_type in ("payout.deposited", "payout.returned"):
        log_merchant_event(event_type, resource)
        return True

    if event_type in (
        "account.identity_verification.passed",
        "account.identity_verification.failed",
        "accounts.identity_verifications.passed",
        "accounts.identity_verifications.failed",
    ):
        # Merchant KYC for our PayMongo account — not user-facing.
        log_merchant_event(event_type, resource)
        return True

    logger.info("Unhandled PayMongo event type=%s id=%s", event_type, resource.get("id"))
    log_merchant_event(event_type or "unknown", resource)
    return False
