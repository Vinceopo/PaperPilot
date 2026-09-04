from __future__ import annotations

import copy
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.firebase_admin_app import firebase_admin_app

ROOT = "/paperpilot"


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


class ManuscriptTitleConflict(ValueError):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def _month_bounds(now: datetime) -> tuple[str, str]:
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = (
        start.replace(year=start.year + 1, month=1)
        if start.month == 12
        else start.replace(month=start.month + 1)
    )
    return _iso(start), _iso(end)


def _reference(path: str):
    if not firebase_admin_app():
        raise RuntimeError("Firebase Realtime Database is unavailable.")
    from firebase_admin import db

    return db.reference(path)


def _values(value: object) -> list[dict]:
    if not isinstance(value, dict):
        return []
    return [item for item in value.values() if isinstance(item, dict)]


def _name_key(name: str) -> str:
    from urllib.parse import quote

    # Percent-encode normalized names so '/', '.', '#', '$', '[' and ']' are safe RTDB keys.
    return quote(name.strip().casefold(), safe="").replace(".", "%2E")


def _live_mechanics_ids(owner_uid: str) -> set[str]:
    items = _reference(f"{ROOT}/mechanics/{owner_uid}").get()
    if not isinstance(items, dict):
        return set()
    return {key for key, value in items.items() if isinstance(value, dict)}


def reconcile_mechanics_names(owner_uid: str) -> int:
    """
    Remove name-index entries that no longer point at a live mechanics document.
    Returns how many orphaned name locks were cleared.
    """
    names = _reference(f"{ROOT}/mechanics_names/{owner_uid}").get()
    if not isinstance(names, dict) or not names:
        return 0
    live = _live_mechanics_ids(owner_uid)
    cleared = 0
    for key, mechanics_id in list(names.items()):
        if mechanics_id not in live:
            _reference(f"{ROOT}/mechanics_names/{owner_uid}/{key}").delete()
            cleared += 1
    return cleared


def _release_name_lock_if_orphaned(owner_uid: str, clean_name: str) -> None:
    """Clear a single name reservation when its mechanics row is already gone."""
    name_ref = _reference(f"{ROOT}/mechanics_names/{owner_uid}/{_name_key(clean_name)}")
    current = name_ref.get()
    if current is None:
        return
    if not isinstance(current, str) or current not in _live_mechanics_ids(owner_uid):
        name_ref.delete()


def init_db() -> None:
    """Initialize Firebase Admin without mutating persistent data."""
    firebase_admin_app()


def _public_mechanics(item: dict) -> dict:
    return {
        "id": item["id"],
        "name": item["name"],
        "source_filename": item["source_filename"],
        "file_type": item["file_type"],
        "rules": item.get("rules", {}),
        "created_at": item["created_at"],
    }


def create_mechanics(
    owner_uid: str, name: str, filename: str, file_type: str, text: str, parsed: dict, rules: dict
) -> dict:
    item_id, created, clean_name = str(uuid.uuid4()), _iso(_now()), name.strip()
    # Always sweep stale locks first so deleted mechanics names can be reused.
    reconcile_mechanics_names(owner_uid)
    _release_name_lock_if_orphaned(owner_uid, clean_name)

    name_ref = _reference(f"{ROOT}/mechanics_names/{owner_uid}/{_name_key(clean_name)}")

    def reserve(current):
        return item_id if current is None else current

    reserved = name_ref.transaction(reserve)
    if reserved != item_id:
        # Last chance: holder may have been deleted between reconcile and reserve.
        holder_id = reserved if isinstance(reserved, str) else None
        if holder_id and holder_id not in _live_mechanics_ids(owner_uid):
            name_ref.delete()
            if name_ref.transaction(reserve) == item_id:
                reserved = item_id
        if reserved != item_id:
            raise MechanicsNameConflict("A mechanics document with this name already exists.")

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
    try:
        _reference(f"{ROOT}/mechanics/{owner_uid}/{item_id}").set(item)
    except Exception:
        name_ref.transaction(lambda current: None if current == item_id else current)
        raise
    return _public_mechanics(item)


def list_mechanics(owner_uid: str) -> list[dict]:
    reconcile_mechanics_names(owner_uid)
    items = _values(_reference(f"{ROOT}/mechanics/{owner_uid}").get())
    items.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    return [_public_mechanics(item) for item in items]


def get_mechanics(owner_uid: str, mechanics_id: str, conn=None) -> dict | None:
    del conn
    item = _reference(f"{ROOT}/mechanics/{owner_uid}/{mechanics_id}").get()
    if not isinstance(item, dict):
        return None
    return {
        **_public_mechanics(item),
        "text": item.get("extracted_text", ""),
        "parsed_data": item.get("parsed_data", {}),
    }


def rename_mechanics(owner_uid: str, mechanics_id: str, name: str) -> dict | None:
    item_ref = _reference(f"{ROOT}/mechanics/{owner_uid}/{mechanics_id}")
    item = item_ref.get()
    if not isinstance(item, dict):
        return None
    clean_name = name.strip()
    extension = Path(item.get("source_filename", "")).suffix.lower()
    if extension and clean_name.lower().endswith(extension):
        clean_name = clean_name[: -len(extension)].strip()
    if not clean_name:
        raise ValueError("A mechanics name is required.")

    old_key, new_key = _name_key(item["name"]), _name_key(clean_name)
    if old_key != new_key:
        reconcile_mechanics_names(owner_uid)
        _release_name_lock_if_orphaned(owner_uid, clean_name)
        new_ref = _reference(f"{ROOT}/mechanics_names/{owner_uid}/{new_key}")
        if new_ref.transaction(lambda current: mechanics_id if current is None else current) != mechanics_id:
            raise MechanicsNameConflict("A mechanics document with this name already exists.")
    else:
        new_ref = None

    updated = {**item, "name": clean_name, "source_filename": f"{clean_name}{extension}"}
    updates = {
        f"mechanics/{owner_uid}/{mechanics_id}": updated,
        f"mechanics_names/{owner_uid}/{old_key}": None,
        f"mechanics_names/{owner_uid}/{new_key}": mechanics_id,
    }
    try:
        _reference(ROOT).update(updates)
    except Exception:
        if new_ref is not None:
            new_ref.transaction(lambda current: None if current == mechanics_id else current)
        raise
    return _public_mechanics(updated)


def delete_mechanics(owner_uid: str, mechanics_id: str) -> bool:
    ref = _reference(f"{ROOT}/mechanics/{owner_uid}/{mechanics_id}")
    item = ref.get()
    if not isinstance(item, dict):
        return False

    # Remove the mechanics document first.
    ref.delete()

    # Clear the primary name key derived from the stored display name.
    stored_name = str(item.get("name") or "").strip()
    if stored_name:
        _reference(f"{ROOT}/mechanics_names/{owner_uid}/{_name_key(stored_name)}").delete()

    # Also clear any leftover index entries that still point at this id
    # (orphans from older deletes / mismatched keys).
    names = _reference(f"{ROOT}/mechanics_names/{owner_uid}").get()
    if isinstance(names, dict):
        for key, value in names.items():
            if value == mechanics_id:
                _reference(f"{ROOT}/mechanics_names/{owner_uid}/{key}").delete()

    return True


def _public_version(item: dict, include_content: bool = True) -> dict:
    value = {
        "id": item["id"],
        "manuscript_id": item["manuscript_id"],
        "mechanics_id": item["mechanics_id"],
        "version_number": item["version_number"],
        "source_filename": item["source_filename"],
        "file_type": item["file_type"],
        "created_at": item["created_at"],
    }
    if include_content:
        value["text"] = item.get("extracted_text", "")
        value["parsed_data"] = item.get("parsed_data", {})
    return value


def find_manuscript_by_title(owner_uid: str, title: str, exclude_id: str | None = None) -> dict | None:
    """Return an existing manuscript whose title matches case-insensitively."""
    key = _name_key(title)
    if not key:
        return None
    for item in _values(_reference(f"{ROOT}/manuscripts/{owner_uid}").get()):
        if exclude_id and item.get("id") == exclude_id:
            continue
        if _name_key(str(item.get("title") or "")) == key:
            return item
    return None


def create_version(
    owner_uid: str,
    title: str,
    mechanics_id: str,
    filename: str,
    file_type: str,
    text: str,
    parsed: dict,
    manuscript_id: str | None,
) -> tuple[dict, bool]:
    if not get_mechanics(owner_uid, mechanics_id):
        raise LookupError("Mechanics not found.")
    created, version_id = _iso(_now()), str(uuid.uuid4())
    created_parent = manuscript_id is None
    manuscript_id = manuscript_id or str(uuid.uuid4())
    clean_title = title.strip()
    if not clean_title:
        raise ValueError("A manuscript title is required.")

    # Same title = new version of the existing manuscript (not a second manuscript).
    if created_parent:
        existing_by_title = find_manuscript_by_title(owner_uid, clean_title)
        if existing_by_title is not None:
            manuscript_id = existing_by_title["id"]
            created_parent = False
            clean_title = str(existing_by_title.get("title") or clean_title).strip()

    if not created_parent:
        existing_parent = _reference(f"{ROOT}/manuscripts/{owner_uid}/{manuscript_id}").get()
        if isinstance(existing_parent, dict) and existing_parent.get("title"):
            # Keep the original title for version uploads — do not rename via filename.
            clean_title = str(existing_parent["title"]).strip() or clean_title

    failure: list[str] = []

    def add_version(root):
        failure.clear()
        root = copy.deepcopy(root) if isinstance(root, dict) else {}
        mechanics = root.get("mechanics", {}).get(owner_uid, {}).get(mechanics_id)
        if not mechanics:
            failure.append("mechanics")
            return root
        manuscripts = root.setdefault("manuscripts", {}).setdefault(owner_uid, {})
        versions = root.setdefault("manuscript_versions", {}).setdefault(owner_uid, {})
        parent = manuscripts.get(manuscript_id)
        if parent is None:
            if not created_parent:
                failure.append("missing")
                return root
            parent = {
                "id": manuscript_id,
                "owner_uid": owner_uid,
                "title": clean_title,
                "current_version_id": None,
                "version_counter": 0,
                "created_at": created,
                "updated_at": created,
            }
        number = int(parent.get("version_counter", 0)) + 1
        version = {
            "id": version_id,
            "manuscript_id": manuscript_id,
            "mechanics_id": mechanics_id,
            "version_number": number,
            "source_filename": filename,
            "file_type": file_type,
            "extracted_text": text,
            "parsed_data": parsed,
            "created_at": created,
        }
        parent.update(
            {
                "title": clean_title if created_parent else parent.get("title") or clean_title,
                "current_version_id": version_id,
                "version_counter": number,
                "updated_at": created,
            }
        )
        manuscripts[manuscript_id] = parent
        versions.setdefault(manuscript_id, {})[version_id] = version
        return root

    result = _reference(ROOT).transaction(add_version)
    if failure:
        raise LookupError(
            "Mechanics not found." if failure[-1] == "mechanics" else "Manuscript not found."
        )
    version = (
        result.get("manuscript_versions", {})
        .get(owner_uid, {})
        .get(manuscript_id, {})
        .get(version_id)
    )
    if not isinstance(version, dict):
        raise RuntimeError("Could not persist manuscript version.")
    return _public_version(version), created_parent


def list_manuscripts(owner_uid: str) -> list[dict]:
    manuscripts = _values(_reference(f"{ROOT}/manuscripts/{owner_uid}").get())
    result = [
        {
            "id": item["id"],
            "title": item["title"],
            "current_version_id": item.get("current_version_id"),
            "current_version_number": item.get("version_counter"),
            "version_count": item.get("version_counter", 0),
            "created_at": item["created_at"],
            "updated_at": item["updated_at"],
        }
        for item in manuscripts
    ]
    result.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
    return result


def get_version(owner_uid: str, manuscript_id: str, version_id: str) -> dict | None:
    if not _reference(f"{ROOT}/manuscripts/{owner_uid}/{manuscript_id}").get():
        return None
    item = _reference(
        f"{ROOT}/manuscript_versions/{owner_uid}/{manuscript_id}/{version_id}"
    ).get()
    return _public_version(item) if isinstance(item, dict) else None


def list_versions(
    owner_uid: str, manuscript_id: str, history: bool
) -> tuple[list[dict] | None, str | None]:
    manuscript = _reference(f"{ROOT}/manuscripts/{owner_uid}/{manuscript_id}").get()
    if not isinstance(manuscript, dict):
        return None, None
    current_id = manuscript.get("current_version_id")
    raw = _reference(f"{ROOT}/manuscript_versions/{owner_uid}/{manuscript_id}").get()
    versions = _values(raw)
    if not history:
        versions = [item for item in versions if item.get("id") == current_id]
    versions.sort(key=lambda item: int(item.get("version_number", 0)), reverse=True)
    return [_public_version(item, include_content=False) for item in versions], current_id


def is_current_version(owner_uid: str, manuscript_id: str, version_id: str) -> bool | None:
    item = _reference(f"{ROOT}/manuscripts/{owner_uid}/{manuscript_id}").get()
    return None if not isinstance(item, dict) else item.get("current_version_id") == version_id


def _normalized_subscription(current: object, now: datetime) -> dict:
    now_text = _iso(now)
    start, end = _month_bounds(now)
    if not isinstance(current, dict):
        return {
            "owner_uid": "",
            "tier": "free",
            "scans_used": 0,
            "period_start": start,
            "period_end": end,
            "created_at": now_text,
            "updated_at": now_text,
        }
    value = copy.deepcopy(current)
    if now_text >= value.get("period_end", ""):
        value.update(
            {
                "scans_used": 0,
                "period_start": start,
                "period_end": end,
                "updated_at": now_text,
            }
        )
    return value


def subscription_snapshot(owner_uid: str) -> dict:
    now = _now()
    ref = _reference(f"{ROOT}/subscriptions/{owner_uid}")

    def normalize(current):
        value = _normalized_subscription(current, now)
        value["owner_uid"] = owner_uid
        return value

    row = ref.transaction(normalize)
    limit = settings.premium_scan_limit if row["tier"] == "premium" else settings.free_scan_limit
    used = int(row.get("scans_used", 0))
    return {
        "tier": row["tier"],
        "limit": limit,
        "used": used,
        "remaining": max(limit - used, 0),
        "reset_at": row["period_end"],
    }


def require_premium(owner_uid: str) -> None:
    sub = subscription_snapshot(owner_uid)
    if sub["tier"] != "premium":
        raise UpgradeRequired(sub["tier"], sub["limit"], sub["used"])


def check_scan_eligibility(owner_uid: str, manuscript_id: str, version_id: str) -> dict:
    sub = subscription_snapshot(owner_uid)
    current = is_current_version(owner_uid, manuscript_id, version_id)
    if current is None:
        raise LookupError("Manuscript not found.")
    if (sub["tier"] != "premium" and not current) or sub["used"] >= sub["limit"]:
        raise UpgradeRequired(sub["tier"], sub["limit"], sub["used"])
    return sub


def persist_scan(
    owner_uid: str,
    manuscript_id: str,
    version_id: str,
    mechanics_id: str,
    overall_score: float,
    issues: list[dict],
    sections: list[dict],
) -> dict:
    scan_id, created, failure = str(uuid.uuid4()), _iso(_now()), []

    def add_scan(root):
        failure.clear()
        root = copy.deepcopy(root) if isinstance(root, dict) else {}
        manuscript = root.get("manuscripts", {}).get(owner_uid, {}).get(manuscript_id)
        version = (
            root.get("manuscript_versions", {})
            .get(owner_uid, {})
            .get(manuscript_id, {})
            .get(version_id)
        )
        mechanics = root.get("mechanics", {}).get(owner_uid, {}).get(mechanics_id)
        if not manuscript or not version or not mechanics:
            failure.append(("missing", None))
            return root
        subscriptions = root.setdefault("subscriptions", {})
        sub = _normalized_subscription(subscriptions.get(owner_uid), _now())
        sub["owner_uid"] = owner_uid
        limit = settings.premium_scan_limit if sub["tier"] == "premium" else settings.free_scan_limit
        used = int(sub.get("scans_used", 0))
        if (sub["tier"] != "premium" and manuscript.get("current_version_id") != version_id) or used >= limit:
            failure.append(("upgrade", (sub["tier"], limit, used)))
            return root
        scan = {
            "id": scan_id,
            "owner_uid": owner_uid,
            "manuscript_id": manuscript_id,
            "manuscript_version_id": version_id,
            "mechanics_id": mechanics_id,
            "overall_score": float(overall_score),
            "issues": issues,
            "created_at": created,
        }
        root.setdefault("compliance_scans", {}).setdefault(owner_uid, {})[scan_id] = scan
        checks = root.setdefault("section_formatting_checks", {}).setdefault(owner_uid, {})
        checks[scan_id] = {
            str(index): {
                "id": str(index),
                "section_name": section["section"],
                "formatting_score": float(section["formatting_score"]),
                "issue_count": int(section["issue_count"]),
                "issues": section.get("issues", []),
            }
            for index, section in enumerate(sections)
        }
        sub["scans_used"] = used + 1
        sub["updated_at"] = created
        subscriptions[owner_uid] = sub
        return root

    _reference(ROOT).transaction(add_scan)
    if failure:
        kind, detail = failure[-1]
        if kind == "upgrade":
            raise UpgradeRequired(*detail)
        raise LookupError("Requested scan input was not found.")
    scan = get_scan(owner_uid, scan_id)
    if scan is None:
        raise RuntimeError("Could not persist compliance scan.")
    return scan


def get_scan(owner_uid: str, scan_id: str) -> dict | None:
    row = _reference(f"{ROOT}/compliance_scans/{owner_uid}/{scan_id}").get()
    if not isinstance(row, dict):
        return None
    checks = _values(
        _reference(f"{ROOT}/section_formatting_checks/{owner_uid}/{scan_id}").get()
    )
    checks.sort(key=lambda item: int(item.get("id", 0)))
    return {
        "id": row["id"],
        "manuscript_version_id": row["manuscript_version_id"],
        "mechanics_id": row["mechanics_id"],
        "overall_score": round(float(row["overall_score"]), 2),
        "issues": row.get("issues", []),
        "sections": [
            {
                "section": item["section_name"],
                "formatting_score": round(float(item["formatting_score"]), 2),
                "issue_count": item["issue_count"],
                "issues": item.get("issues", []),
            }
            for item in checks
        ],
        "created_at": row["created_at"],
    }
