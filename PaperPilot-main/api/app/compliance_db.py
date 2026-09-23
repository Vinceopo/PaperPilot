"""Compliance / manuscripts / scans persistence on Firebase Realtime Database."""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.config import settings
from app.firebase_admin_app import firebase_admin_app

ROOT = "/paperpilot"
_RESPONSE_PARSED_LIMIT = 2_500_000


class UpgradeRequired(Exception):
    def __init__(self, tier: str, limit: int, used: int):
        self.detail = {
            "code": "upgrade_required",
            "message": "Upgrade to Premium to access this feature or increase your monthly scan limit.",
            "tier": tier,
            "limit": limit,
            "used": used,
        }
        super().__init__(self.detail["message"])


class MechanicsNameConflict(ValueError):
    pass


class MechanicsInUse(ValueError):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def _month_bounds(now: datetime) -> tuple[str, str]:
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return _iso(start), _iso(end)


def _name_key(name: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "_", (name or "").strip().lower()).strip("_")
    return cleaned or "unnamed"


def _reference(path: str):
    if not firebase_admin_app():
        raise RuntimeError("Firebase Realtime Database is unavailable.")
    from firebase_admin import db

    return db.reference(path)


def init_db() -> None:
    """Warm Firebase Admin; RTDB needs no schema migration."""
    firebase_admin_app()


def _mechanics_public(item: dict) -> dict:
    return {
        "id": item["id"],
        "name": item["name"],
        "source_filename": item["source_filename"],
        "file_type": item["file_type"],
        "rules": item.get("rules") or {},
        "created_at": item["created_at"],
    }


def _slim_version_payload(value: dict) -> dict:
    """Keep API responses under Vercel's ~4.5MB body limit."""
    parsed = value.get("parsed_data")
    if not isinstance(parsed, dict):
        return value
    encoded = json.dumps(parsed, ensure_ascii=False)
    if len(encoded) <= _RESPONSE_PARSED_LIMIT:
        return value
    out = dict(value)
    out["parsed_data"] = {
        "_truncated": True,
        "metadata": parsed.get("metadata") or {},
    }
    text = out.get("text") or ""
    if len(text) > 50_000:
        out["text"] = text[:50_000]
    return out


def create_mechanics(
    owner_uid: str, name: str, filename: str, file_type: str, text: str, parsed: dict, rules: dict
) -> dict:
    item_id, created, clean_name = str(uuid.uuid4()), _iso(_now()), name.strip()
    key = _name_key(clean_name)
    name_ref = _reference(f"{ROOT}/mechanics_names/{owner_uid}/{key}")
    existing_id = name_ref.get()
    if existing_id and existing_id != item_id:
        existing = _reference(f"{ROOT}/mechanics/{owner_uid}/{existing_id}").get()
        if existing:
            raise MechanicsNameConflict("A mechanics document with this name already exists.")
    name_ref.set(item_id)

    item = {
        "id": item_id,
        "owner_uid": owner_uid,
        "name": clean_name,
        "source_filename": filename,
        "file_type": file_type,
        "extracted_text": text,
        "parsed_data": parsed,
        "rules": rules,
        "created_at": created,
    }
    _reference(f"{ROOT}/mechanics/{owner_uid}/{item_id}").set(item)
    return _mechanics_public(item)


def list_mechanics(owner_uid: str) -> list[dict]:
    rows = _reference(f"{ROOT}/mechanics/{owner_uid}").get() or {}
    items = [_mechanics_public(v) for v in rows.values() if isinstance(v, dict)]
    items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return items


def rename_mechanics(owner_uid: str, mechanics_id: str, name: str) -> dict | None:
    return update_mechanics(owner_uid, mechanics_id, name=name)


def update_mechanics(
    owner_uid: str,
    mechanics_id: str,
    name: str | None = None,
    rules: dict | None = None,
) -> dict | None:
    ref = _reference(f"{ROOT}/mechanics/{owner_uid}/{mechanics_id}")
    row = ref.get()
    if not isinstance(row, dict):
        return None

    clean_name = row.get("name") or ""
    renamed_filename = row.get("source_filename") or ""
    old_key = _name_key(clean_name)

    if name is not None:
        clean_name = name.strip()
        extension = Path(renamed_filename).suffix.lower()
        if extension and clean_name.lower().endswith(extension):
            clean_name = clean_name[: -len(extension)].strip()
        if not clean_name:
            raise ValueError("A mechanics name is required.")
        renamed_filename = f"{clean_name}{extension}"
        new_key = _name_key(clean_name)
        if new_key != old_key:
            name_ref = _reference(f"{ROOT}/mechanics_names/{owner_uid}/{new_key}")
            existing_id = name_ref.get()
            if existing_id and existing_id != mechanics_id:
                existing = _reference(f"{ROOT}/mechanics/{owner_uid}/{existing_id}").get()
                if existing:
                    raise MechanicsNameConflict(
                        "A mechanics document with this name already exists."
                    )
            name_ref.set(mechanics_id)
            _reference(f"{ROOT}/mechanics_names/{owner_uid}/{old_key}").delete()

    updates = {
        "name": clean_name,
        "source_filename": renamed_filename,
    }
    if rules is not None:
        updates["rules"] = rules
    ref.update(updates)
    updated = ref.get() or {**row, **updates}
    return _mechanics_public(updated)


def delete_mechanics(owner_uid: str, mechanics_id: str) -> bool:
    ref = _reference(f"{ROOT}/mechanics/{owner_uid}/{mechanics_id}")
    row = ref.get()
    if not isinstance(row, dict):
        return False

    scans = _reference(f"{ROOT}/compliance_scans/{owner_uid}").get() or {}
    for scan_id, scan in list(scans.items()):
        if not isinstance(scan, dict):
            continue
        if scan.get("mechanics_id") != mechanics_id:
            continue
        _reference(f"{ROOT}/section_formatting_checks/{owner_uid}/{scan_id}").delete()
        _reference(f"{ROOT}/compliance_scans/{owner_uid}/{scan_id}").delete()

    key = _name_key(row.get("name") or "")
    name_ref = _reference(f"{ROOT}/mechanics_names/{owner_uid}/{key}")
    if name_ref.get() == mechanics_id:
        name_ref.delete()
    ref.delete()
    return True


def get_mechanics(owner_uid: str, mechanics_id: str, conn=None) -> dict | None:
    del conn  # SQLite compat shim
    row = _reference(f"{ROOT}/mechanics/{owner_uid}/{mechanics_id}").get()
    if not isinstance(row, dict):
        return None
    return {
        **_mechanics_public(row),
        "text": row.get("extracted_text") or "",
        "parsed_data": row.get("parsed_data") or {},
    }


def create_version(
    owner_uid: str,
    title: str,
    mechanics_id: str,
    filename: str,
    file_type: str,
    text: str,
    parsed: dict,
    manuscript_id: str | None,
    cloudinary_url: str | None = None,
) -> tuple[dict, bool]:
    created, version_id = _iso(_now()), str(uuid.uuid4())
    if not get_mechanics(owner_uid, mechanics_id):
        raise LookupError("Mechanics not found.")

    created_parent = manuscript_id is None
    if created_parent:
        manuscript_id = str(uuid.uuid4())
        _reference(f"{ROOT}/manuscripts/{owner_uid}/{manuscript_id}").set(
            {
                "id": manuscript_id,
                "owner_uid": owner_uid,
                "title": title.strip(),
                "current_version_id": None,
                "version_counter": 0,
                "created_at": created,
                "updated_at": created,
            }
        )

    ms_ref = _reference(f"{ROOT}/manuscripts/{owner_uid}/{manuscript_id}")
    manuscript = ms_ref.get()
    if not isinstance(manuscript, dict):
        raise LookupError("Manuscript not found.")

    next_number = int(manuscript.get("version_counter") or 0) + 1
    version = {
        "id": version_id,
        "manuscript_id": manuscript_id,
        "mechanics_id": mechanics_id,
        "version_number": next_number,
        "source_filename": filename,
        "file_type": file_type,
        "extracted_text": text,
        "parsed_data": parsed,
        "created_at": created,
    }
    if cloudinary_url:
        version["cloudinary_url"] = cloudinary_url.strip()
    _reference(f"{ROOT}/manuscript_versions/{owner_uid}/{manuscript_id}/{version_id}").set(version)
    ms_ref.update(
        {
            "title": title.strip(),
            "current_version_id": version_id,
            "version_counter": next_number,
            "updated_at": created,
        }
    )
    return get_version(owner_uid, manuscript_id, version_id), created_parent


def list_manuscripts(owner_uid: str) -> list[dict]:
    rows = _reference(f"{ROOT}/manuscripts/{owner_uid}").get() or {}
    items = []
    for row in rows.values():
        if not isinstance(row, dict):
            continue
        mid = row.get("id")
        versions = _reference(f"{ROOT}/manuscript_versions/{owner_uid}/{mid}").get() or {}
        current_id = row.get("current_version_id")
        current = versions.get(current_id) if isinstance(versions, dict) else None
        version_number = (current or {}).get("version_number") if isinstance(current, dict) else None
        items.append(
            {
                "id": mid,
                "title": row.get("title"),
                "current_version_id": current_id,
                "current_version_number": version_number,
                "version_count": len(versions) if isinstance(versions, dict) else 0,
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
            }
        )
    items.sort(key=lambda x: x.get("updated_at") or "", reverse=True)
    return items


def _version_row(row: dict, include_content: bool = True) -> dict:
    value = {
        "id": row["id"],
        "manuscript_id": row["manuscript_id"],
        "mechanics_id": row["mechanics_id"],
        "version_number": row["version_number"],
        "source_filename": row["source_filename"],
        "file_type": row["file_type"],
        "created_at": row["created_at"],
    }
    if include_content:
        value["text"] = row.get("extracted_text") or ""
        value["parsed_data"] = row.get("parsed_data") or {}
        value = _slim_version_payload(value)
    return value


def get_version(owner_uid: str, manuscript_id: str, version_id: str) -> dict | None:
    manuscript = _reference(f"{ROOT}/manuscripts/{owner_uid}/{manuscript_id}").get()
    if not isinstance(manuscript, dict):
        return None
    row = _reference(f"{ROOT}/manuscript_versions/{owner_uid}/{manuscript_id}/{version_id}").get()
    if not isinstance(row, dict):
        return None
    return _version_row(row, include_content=True)


def get_version_full(owner_uid: str, manuscript_id: str, version_id: str) -> dict | None:
    """Full parsed_data for server-side scans (not slimmed for HTTP)."""
    manuscript = _reference(f"{ROOT}/manuscripts/{owner_uid}/{manuscript_id}").get()
    if not isinstance(manuscript, dict):
        return None
    row = _reference(f"{ROOT}/manuscript_versions/{owner_uid}/{manuscript_id}/{version_id}").get()
    if not isinstance(row, dict):
        return None
    return {
        "id": row["id"],
        "manuscript_id": row["manuscript_id"],
        "mechanics_id": row["mechanics_id"],
        "version_number": row["version_number"],
        "source_filename": row["source_filename"],
        "file_type": row["file_type"],
        "created_at": row["created_at"],
        "text": row.get("extracted_text") or "",
        "parsed_data": row.get("parsed_data") or {},
        "cloudinary_url": row.get("cloudinary_url") or "",
    }


def get_version_document_url(owner_uid: str, manuscript_id: str, version_id: str) -> str | None:
    row = _reference(f"{ROOT}/manuscript_versions/{owner_uid}/{manuscript_id}/{version_id}").get()
    if not isinstance(row, dict):
        return None
    url = (row.get("cloudinary_url") or "").strip()
    return url or None


def list_versions(owner_uid: str, manuscript_id: str, history: bool) -> tuple[list[dict] | None, str | None]:
    manuscript = _reference(f"{ROOT}/manuscripts/{owner_uid}/{manuscript_id}").get()
    if not isinstance(manuscript, dict):
        return None, None
    current_id = manuscript.get("current_version_id")
    all_versions = _reference(f"{ROOT}/manuscript_versions/{owner_uid}/{manuscript_id}").get() or {}
    if not isinstance(all_versions, dict):
        return [], current_id
    if history:
        rows = list(all_versions.values())
        rows.sort(key=lambda r: int(r.get("version_number") or 0), reverse=True)
    else:
        current = all_versions.get(current_id)
        rows = [current] if isinstance(current, dict) else []
    return [_version_row(r, include_content=False) for r in rows if isinstance(r, dict)], current_id


def is_current_version(owner_uid: str, manuscript_id: str, version_id: str) -> bool | None:
    manuscript = _reference(f"{ROOT}/manuscripts/{owner_uid}/{manuscript_id}").get()
    if not isinstance(manuscript, dict):
        return None
    return manuscript.get("current_version_id") == version_id


def _subscription_row(owner_uid: str) -> dict:
    now, now_text = _now(), _iso(_now())
    start, end = _month_bounds(now)
    ref = _reference(f"{ROOT}/subscriptions/{owner_uid}")
    row = ref.get()
    if not isinstance(row, dict):
        row = {
            "owner_uid": owner_uid,
            "tier": "free",
            "scans_used": 0,
            "period_start": start,
            "period_end": end,
            "created_at": now_text,
            "updated_at": now_text,
        }
        ref.set(row)
        return row
    if now_text >= str(row.get("period_end") or ""):
        row = {
            **row,
            "scans_used": 0,
            "period_start": start,
            "period_end": end,
            "updated_at": now_text,
        }
        ref.set(row)
    return row


def _history_list(row: dict) -> list[dict]:
    history = row.get("history")
    if isinstance(history, list):
        return [h for h in history if isinstance(h, dict)]
    if isinstance(history, dict):
        return [h for h in history.values() if isinstance(h, dict)]
    return []


def subscription_snapshot(owner_uid: str) -> dict:
    row = _subscription_row(owner_uid)
    tier = str(row.get("tier") or "free").lower()
    # Expire premium when renews_at is in the past (one-time PayMongo checkout model).
    renews_at = row.get("renews_at")
    if tier == "premium" and renews_at and str(renews_at) < _iso(_now()):
        tier = "free"
        row = {
            **row,
            "tier": "free",
            "status": "expired",
            "updated_at": _iso(_now()),
        }
        _reference(f"{ROOT}/subscriptions/{owner_uid}").update(
            {"tier": "free", "status": "expired", "updated_at": row["updated_at"]}
        )
    limit = settings.premium_scan_limit if tier == "premium" else settings.free_scan_limit
    used = int(row.get("scans_used") or 0)
    remaining = limit if settings.disable_scan_limit else max(limit - used, 0)
    history = sorted(
        _history_list(row),
        key=lambda h: str(h.get("at") or ""),
        reverse=True,
    )
    return {
        "tier": tier,
        "status": row.get("status") or ("active" if tier == "premium" else "free"),
        "billing_period": row.get("billing_period") or None,
        "payment_method": row.get("payment_method") or None,
        "renews_at": row.get("renews_at") or None,
        "limit": limit,
        "used": used,
        "remaining": remaining,
        "payment_issue": bool(row.get("payment_issue")),
        "payment_issue_reason": row.get("payment_issue_reason") or None,
        "provider": row.get("provider") or None,
        "paymongo_subscription_id": row.get("paymongo_subscription_id") or None,
        "reset_at": row.get("period_end"),
        "history": history[:50],
    }


def _append_history(owner_uid: str, entry: dict) -> None:
    ref = _reference(f"{ROOT}/subscriptions/{owner_uid}")
    row = ref.get() if ref else None
    if not isinstance(row, dict):
        row = _subscription_row(owner_uid)
    history = _history_list(row)
    history.insert(0, entry)
    ref.update({"history": history[:100], "updated_at": entry.get("at") or _iso(_now())})


def save_pending_checkout(
    owner_uid: str,
    *,
    checkout_session_id: str,
    billing_period: str,
    reference_number: str,
    amount_pesos: int,
) -> None:
    now = _iso(_now())
    _reference(f"{ROOT}/paymongo_checkouts/{checkout_session_id}").set(
        {
            "id": checkout_session_id,
            "owner_uid": owner_uid,
            "billing_period": billing_period,
            "reference_number": reference_number,
            "amount": amount_pesos,
            "status": "pending",
            "created_at": now,
            "updated_at": now,
        }
    )


def get_pending_checkout(checkout_session_id: str) -> dict | None:
    row = _reference(f"{ROOT}/paymongo_checkouts/{checkout_session_id}").get()
    return row if isinstance(row, dict) else None


def activate_premium_from_payment(
    owner_uid: str,
    *,
    billing_period: str,
    payment_method: str | None,
    amount_pesos: int | None,
    checkout_session_id: str | None = None,
    payment_id: str | None = None,
    reference_number: str | None = None,
) -> dict:
    now = _now()
    now_text = _iso(now)
    period = "annual" if billing_period == "annual" else "monthly"
    renews = now + (timedelta(days=365) if period == "annual" else timedelta(days=30))
    start, end = _month_bounds(now)
    patch = {
        "tier": "premium",
        "status": "active",
        "billing_period": period,
        "payment_method": payment_method or "paymongo",
        "provider": "paymongo",
        "renews_at": _iso(renews),
        "period_start": start,
        "period_end": end,
        "scans_used": 0,
        "last_checkout_session_id": checkout_session_id,
        "last_payment_id": payment_id,
        "last_reference_number": reference_number,
        "updated_at": now_text,
    }
    _reference(f"{ROOT}/subscriptions/{owner_uid}").update(patch)
    _append_history(
        owner_uid,
        {
            "id": payment_id or checkout_session_id or str(uuid.uuid4()),
            "action": "subscribed",
            "at": now_text,
            "billing_period": period,
            "payment_method": payment_method or "paymongo",
            "amount": amount_pesos,
            "checkout_session_id": checkout_session_id,
            "payment_id": payment_id,
            "reference_number": reference_number,
        },
    )
    if checkout_session_id:
        _reference(f"{ROOT}/paymongo_checkouts/{checkout_session_id}").update(
            {
                "status": "paid",
                "payment_id": payment_id,
                "updated_at": now_text,
            }
        )
    if payment_id:
        _reference(f"{ROOT}/paymongo_payments/{payment_id}").set(
            {
                "id": payment_id,
                "owner_uid": owner_uid,
                "checkout_session_id": checkout_session_id,
                "billing_period": period,
                "created_at": now_text,
            }
        )
    return subscription_snapshot(owner_uid)


def cancel_user_subscription(owner_uid: str, *, immediate: bool = True) -> dict:
    now_text = _iso(_now())
    row = _subscription_row(owner_uid)
    if immediate:
        patch = {
            "tier": "free",
            "status": "canceled",
            "updated_at": now_text,
        }
    else:
        patch = {
            "status": "canceled",
            "updated_at": now_text,
        }
    _reference(f"{ROOT}/subscriptions/{owner_uid}").update(patch)
    _append_history(
        owner_uid,
        {
            "id": str(uuid.uuid4()),
            "action": "canceled",
            "at": now_text,
            "billing_period": row.get("billing_period"),
            "payment_method": row.get("payment_method"),
            "amount": None,
        },
    )
    return subscription_snapshot(owner_uid)


def mark_checkout_failed(checkout_session_id: str, reason: str | None = None) -> None:
    ref = _reference(f"{ROOT}/paymongo_checkouts/{checkout_session_id}")
    row = ref.get()
    if not isinstance(row, dict):
        return
    ref.update(
        {
            "status": "failed",
            "failure_reason": (reason or "")[:500],
            "updated_at": _iso(_now()),
        }
    )


def claim_webhook_event(event_id: str, event_type: str) -> bool:
    """Return True if this event should be processed (first claim). False if already done."""
    if not event_id:
        return True
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in event_id)[:200]
    ref = _reference(f"{ROOT}/paymongo_events/{safe}")
    existing = ref.get()
    if isinstance(existing, dict) and existing.get("status") == "processed":
        return False
    now = _iso(_now())
    ref.set(
        {
            "id": event_id,
            "type": event_type,
            "status": "processing",
            "created_at": now,
            "updated_at": now,
        }
    )
    return True


def complete_webhook_event(event_id: str) -> None:
    if not event_id:
        return
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in event_id)[:200]
    _reference(f"{ROOT}/paymongo_events/{safe}").update(
        {"status": "processed", "updated_at": _iso(_now())}
    )


def link_paymongo_subscription(subscription_id: str, owner_uid: str) -> None:
    if not subscription_id or not owner_uid:
        return
    now = _iso(_now())
    _reference(f"{ROOT}/paymongo_subscriptions/{subscription_id}").set(
        {"id": subscription_id, "owner_uid": owner_uid, "updated_at": now, "created_at": now}
    )
    _reference(f"{ROOT}/subscriptions/{owner_uid}").update(
        {"paymongo_subscription_id": subscription_id, "updated_at": now}
    )


def get_uid_for_paymongo_subscription(subscription_id: str) -> str | None:
    if not subscription_id:
        return None
    row = _reference(f"{ROOT}/paymongo_subscriptions/{subscription_id}").get()
    if isinstance(row, dict) and row.get("owner_uid"):
        return str(row["owner_uid"])
    return None


def get_uid_for_payment(payment_id: str) -> str | None:
    if not payment_id:
        return None
    row = _reference(f"{ROOT}/paymongo_payments/{payment_id}").get()
    if isinstance(row, dict) and row.get("owner_uid"):
        return str(row["owner_uid"])
    return None


def flag_payment_issue(owner_uid: str, *, reason: str, event_type: str) -> None:
    now = _iso(_now())
    _reference(f"{ROOT}/subscriptions/{owner_uid}").update(
        {
            "payment_issue": True,
            "payment_issue_reason": (reason or event_type)[:500],
            "payment_issue_at": now,
            # Keep tier as-is (grace). Surface status for banners.
            "status": "past_due",
            "updated_at": now,
        }
    )
    _append_history(
        owner_uid,
        {
            "id": str(uuid.uuid4()),
            "action": "payment_issue",
            "at": now,
            "billing_period": None,
            "payment_method": None,
            "amount": None,
            "reason": (reason or event_type)[:200],
        },
    )


def renew_premium_period(
    owner_uid: str,
    *,
    billing_period: str,
    payment_id: str | None,
    amount_pesos: int | None,
) -> dict:
    now = _now()
    now_text = _iso(now)
    period = "annual" if billing_period == "annual" else "monthly"
    renews = now + (timedelta(days=365) if period == "annual" else timedelta(days=30))
    start, end = _month_bounds(now)
    patch = {
        "tier": "premium",
        "status": "active",
        "payment_issue": False,
        "payment_issue_reason": None,
        "billing_period": period,
        "renews_at": _iso(renews),
        "period_start": start,
        "period_end": end,
        "scans_used": 0,
        "last_payment_id": payment_id,
        "updated_at": now_text,
    }
    _reference(f"{ROOT}/subscriptions/{owner_uid}").update(patch)
    if payment_id:
        _reference(f"{ROOT}/paymongo_payments/{payment_id}").set(
            {
                "id": payment_id,
                "owner_uid": owner_uid,
                "billing_period": period,
                "created_at": now_text,
            }
        )
    _append_history(
        owner_uid,
        {
            "id": payment_id or str(uuid.uuid4()),
            "action": "renewed",
            "at": now_text,
            "billing_period": period,
            "payment_method": "paymongo",
            "amount": amount_pesos,
            "payment_id": payment_id,
        },
    )
    return subscription_snapshot(owner_uid)


def downgrade_to_free_from_payment(
    payment_id: str | None,
    *,
    owner_uid: str | None = None,
    reason: str = "refund",
) -> dict | None:
    uid = owner_uid or (get_uid_for_payment(payment_id) if payment_id else None)
    if not uid:
        return None
    now_text = _iso(_now())
    _reference(f"{ROOT}/subscriptions/{uid}").update(
        {
            "tier": "free",
            "status": "refunded" if "refund" in reason else "unpaid",
            "payment_issue": False,
            "payment_issue_reason": None,
            "updated_at": now_text,
        }
    )
    _append_history(
        uid,
        {
            "id": payment_id or str(uuid.uuid4()),
            "action": "downgraded",
            "at": now_text,
            "billing_period": None,
            "payment_method": None,
            "amount": None,
            "reason": reason[:200],
            "payment_id": payment_id,
        },
    )
    return subscription_snapshot(uid)


def sync_subscription_fields(owner_uid: str, resource: dict) -> None:
    attrs = resource.get("attributes") if isinstance(resource.get("attributes"), dict) else {}
    patch: dict = {"updated_at": _iso(_now())}
    status = attrs.get("status")
    if status:
        patch["provider_status"] = str(status)[:80]
    meta = attrs.get("metadata") if isinstance(attrs.get("metadata"), dict) else {}
    period = meta.get("billing_period")
    if period in ("monthly", "annual"):
        patch["billing_period"] = period
    sub_id = resource.get("id")
    if sub_id:
        patch["paymongo_subscription_id"] = str(sub_id)
        link_paymongo_subscription(str(sub_id), owner_uid)
    _reference(f"{ROOT}/subscriptions/{owner_uid}").update(patch)


def log_merchant_event(event_type: str, resource: dict) -> None:
    event_id = str(resource.get("id") or uuid.uuid4())
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in f"{event_type}_{event_id}")[:200]
    _reference(f"{ROOT}/paymongo_merchant_log/{safe}").set(
        {
            "type": event_type,
            "resource_id": resource.get("id"),
            "at": _iso(_now()),
            "snapshot": {
                "id": resource.get("id"),
                "type": resource.get("type"),
            },
        }
    )


def require_premium(owner_uid: str) -> None:
    sub = subscription_snapshot(owner_uid)
    if sub["tier"] != "premium":
        raise UpgradeRequired(sub["tier"], sub["limit"], sub["used"])


def check_scan_eligibility(owner_uid: str, manuscript_id: str, version_id: str) -> dict:
    sub = subscription_snapshot(owner_uid)
    current = is_current_version(owner_uid, manuscript_id, version_id)
    if current is None:
        raise LookupError("Manuscript not found.")
    if sub["tier"] != "premium" and not current:
        raise UpgradeRequired(sub["tier"], sub["limit"], sub["used"])
    if not settings.disable_scan_limit and sub["used"] >= sub["limit"]:
        raise UpgradeRequired(sub["tier"], sub["limit"], sub["used"])
    return sub


def _assert_scan_inputs(
    owner_uid: str,
    manuscript_id: str,
    version_id: str,
    mechanics_id: str,
) -> tuple[dict, dict, dict, dict]:
    sub = _subscription_row(owner_uid)
    limit = settings.premium_scan_limit if sub.get("tier") == "premium" else settings.free_scan_limit
    manuscript = _reference(f"{ROOT}/manuscripts/{owner_uid}/{manuscript_id}").get()
    version = _reference(f"{ROOT}/manuscript_versions/{owner_uid}/{manuscript_id}/{version_id}").get()
    mechanics = _reference(f"{ROOT}/mechanics/{owner_uid}/{mechanics_id}").get()
    if not isinstance(manuscript, dict) or not isinstance(version, dict) or not isinstance(mechanics, dict):
        raise LookupError("Requested scan input was not found.")

    old_version = sub.get("tier") != "premium" and manuscript.get("current_version_id") != version_id
    limit_hit = (not settings.disable_scan_limit) and int(sub.get("scans_used") or 0) >= limit
    if old_version or limit_hit:
        raise UpgradeRequired(sub.get("tier") or "free", limit, int(sub.get("scans_used") or 0))
    return sub, manuscript, version, mechanics


def _write_section_checks(owner_uid: str, scan_id: str, sections: list[dict]) -> None:
    for index, section in enumerate(sections or []):
        if not isinstance(section, dict):
            continue
        name = section.get("section") or section.get("section_name")
        if not name:
            continue
        check = {
            "id": str(index + 1),
            "section_name": name,
            "formatting_score": float(section.get("formatting_score") or 0),
            "issue_count": int(section.get("issue_count") or 0),
            "issues": section.get("issues") or [],
        }
        _reference(
            f"{ROOT}/section_formatting_checks/{owner_uid}/{scan_id}/{check['id']}"
        ).set(check)


def _increment_scan_usage(owner_uid: str, sub: dict, created: str) -> None:
    if not settings.disable_scan_limit:
        _reference(f"{ROOT}/subscriptions/{owner_uid}").update(
            {
                "scans_used": int(sub.get("scans_used") or 0) + 1,
                "updated_at": created,
            }
        )


def create_pending_scan(
    owner_uid: str,
    manuscript_id: str,
    version_id: str,
    mechanics_id: str,
    *,
    scan_id: str | None = None,
    ml_job_id: str | None = None,
) -> dict:
    """Reserve a scan row while the Render ML job runs."""
    scan_id = scan_id or str(uuid.uuid4())
    created = _iso(_now())
    _assert_scan_inputs(owner_uid, manuscript_id, version_id, mechanics_id)
    scan = {
        "id": scan_id,
        "owner_uid": owner_uid,
        "manuscript_id": manuscript_id,
        "manuscript_version_id": version_id,
        "mechanics_id": mechanics_id,
        "ml_job_id": ml_job_id or scan_id,
        "status": "running",
        "created_at": created,
        "updated_at": created,
    }
    _reference(f"{ROOT}/compliance_scans/{owner_uid}/{scan_id}").set(scan)
    return get_scan(owner_uid, scan_id) or scan


def finalize_scan_from_ml(
    owner_uid: str,
    scan_id: str,
    result: dict,
    *,
    failed: bool = False,
    error: str | None = None,
) -> dict:
    row = _reference(f"{ROOT}/compliance_scans/{owner_uid}/{scan_id}").get()
    if not isinstance(row, dict):
        raise LookupError("Compliance scan not found.")
    if row.get("status") == "done":
        return get_scan(owner_uid, scan_id) or row
    if row.get("status") == "failed":
        return get_scan(owner_uid, scan_id) or row

    created = row.get("created_at") or _iso(_now())
    updated = _iso(_now())
    manuscript_id = row.get("manuscript_id") or ""
    version_id = row.get("manuscript_version_id") or ""
    mechanics_id = row.get("mechanics_id") or ""

    if failed:
        row.update(
            {
                "status": "failed",
                "error": error or "Analysis failed.",
                "updated_at": updated,
            }
        )
        _reference(f"{ROOT}/compliance_scans/{owner_uid}/{scan_id}").update(row)
        return get_scan(owner_uid, scan_id) or row

    sub, _, _, _ = _assert_scan_inputs(owner_uid, manuscript_id, version_id, mechanics_id)
    issues = result.get("issues") or []
    sections = result.get("sections") or []
    overall_score = float(result.get("overall_score") or 0)

    row.update(
        {
            "status": "done",
            "overall_score": overall_score,
            "right_pct": result.get("right_pct"),
            "wrong_pct": result.get("wrong_pct"),
            "category_wrong_pct": result.get("category_wrong_pct") or [],
            "severity_pct": result.get("severity_pct") or {},
            "units_checked": result.get("units_checked"),
            "units_failed": result.get("units_failed"),
            "issues": issues,
            "sections": sections,
            "page_count": result.get("page_count") or 0,
            "pagination": result.get("pagination") or {},
            "updated_at": updated,
            "error": None,
        }
    )
    _reference(f"{ROOT}/compliance_scans/{owner_uid}/{scan_id}").set(row)
    _write_section_checks(owner_uid, scan_id, sections)
    _increment_scan_usage(owner_uid, sub, created)
    return get_scan(owner_uid, scan_id) or row


def persist_scan(
    owner_uid: str,
    manuscript_id: str,
    version_id: str,
    mechanics_id: str,
    overall_score: float,
    issues: list[dict],
    sections: list[dict],
    *,
    extra: dict | None = None,
) -> dict:
    scan_id, created = str(uuid.uuid4()), _iso(_now())
    sub, _, _, _ = _assert_scan_inputs(owner_uid, manuscript_id, version_id, mechanics_id)

    scan = {
        "id": scan_id,
        "owner_uid": owner_uid,
        "manuscript_id": manuscript_id,
        "manuscript_version_id": version_id,
        "mechanics_id": mechanics_id,
        "overall_score": float(overall_score),
        "issues": issues,
        "status": "done",
        "ml_job_id": scan_id,
        "created_at": created,
        "updated_at": created,
    }
    if extra:
        scan.update(extra)
    _reference(f"{ROOT}/compliance_scans/{owner_uid}/{scan_id}").set(scan)
    _write_section_checks(owner_uid, scan_id, sections)
    _increment_scan_usage(owner_uid, sub, created)
    return get_scan(owner_uid, scan_id)


def get_scan(owner_uid: str, scan_id: str) -> dict | None:
    row = _reference(f"{ROOT}/compliance_scans/{owner_uid}/{scan_id}").get()
    if not isinstance(row, dict):
        return None
    checks = _reference(f"{ROOT}/section_formatting_checks/{owner_uid}/{scan_id}").get() or {}
    section_items = []
    if isinstance(checks, dict):
        ordered = sorted(checks.values(), key=lambda c: int((c or {}).get("id") or 0))
        for item in ordered:
            if not isinstance(item, dict):
                continue
            section_items.append(
                {
                    "section": item.get("section_name"),
                    "formatting_score": round(float(item.get("formatting_score") or 0), 2),
                    "issue_count": int(item.get("issue_count") or 0),
                    "issues": item.get("issues") or [],
                }
            )
    status = row.get("status") or ("done" if row.get("overall_score") is not None else "running")
    if not section_items:
        embedded = row.get("sections") or []
        if isinstance(embedded, list):
            for item in embedded:
                if not isinstance(item, dict):
                    continue
                section_items.append(
                    {
                        "section": item.get("section") or item.get("section_name"),
                        "formatting_score": round(float(item.get("formatting_score") or 0), 2),
                        "issue_count": int(item.get("issue_count") or 0),
                        "issues": item.get("issues") or [],
                    }
                )
    payload = {
        "id": row["id"],
        "manuscript_id": row.get("manuscript_id"),
        "manuscript_version_id": row["manuscript_version_id"],
        "mechanics_id": row["mechanics_id"],
        "status": status,
        "ml_job_id": row.get("ml_job_id") or row["id"],
        "overall_score": round(float(row.get("overall_score") or 0), 2),
        "issues": row.get("issues") or [],
        "sections": section_items,
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "error": row.get("error"),
    }
    if row.get("right_pct") is not None:
        payload["right_pct"] = round(float(row["right_pct"]), 2)
    if row.get("wrong_pct") is not None:
        payload["wrong_pct"] = round(float(row["wrong_pct"]), 2)
    if row.get("category_wrong_pct") is not None:
        payload["category_wrong_pct"] = row.get("category_wrong_pct") or []
    if row.get("severity_pct") is not None:
        payload["severity_pct"] = row.get("severity_pct") or {}
    if row.get("units_checked") is not None:
        payload["units_checked"] = int(row.get("units_checked") or 0)
    if row.get("units_failed") is not None:
        payload["units_failed"] = int(row.get("units_failed") or 0)
    if row.get("page_count") is not None:
        payload["page_count"] = int(row.get("page_count") or 0)
    if row.get("pagination") is not None:
        payload["pagination"] = row.get("pagination") or {}
    return payload
