"""Compliance / manuscripts / scans persistence on Firebase Realtime Database."""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.cloudinary_artifacts import (
    artifacts_enabled,
    download_json_artifact,
    mechanics_public_id,
    parsed_public_id,
    scan_public_id,
    try_upload_json_artifact,
)
from app.cloudinary_fetch import CloudinaryFetchError
from app.config import settings
from app.firebase_admin_app import firebase_admin_app

ROOT = "/paperpilot"
_RESPONSE_PARSED_LIMIT = 2_500_000
# Thesis free-tier guard: keep only the newest committed versions per manuscript.
_MAX_COMMITTED_VERSIONS = 3


class UpgradeRequired(Exception):
    def __init__(
        self,
        tier: str,
        limit: int,
        used: int,
        *,
        reset_at: str | None = None,
        feature: bool = False,
        message: str | None = None,
    ):
        tier = str(tier or "free").lower()
        reset_period = "weekly" if tier == "pro" else "monthly"
        if not message and feature:
            message = (
                "Older versions and version history are available on Premium and Pro. "
                "Upgrade on the Subscription page to unlock them."
            )
        elif not message:
            window = "week" if reset_period == "weekly" else "month"
            reset_date = _parse_iso(reset_at)
            # Users are in the Philippines (UTC+8); a UTC date can show the previous day.
            local_reset = reset_date.astimezone(timezone(timedelta(hours=8))) if reset_date else None
            when = f" Your scans reset on {local_reset.strftime('%b %d, %Y')}." if local_reset else ""
            next_step = (
                " Wait for the reset to scan again."
                if tier == "pro"
                else " Upgrade on the Subscription page for more scans."
            )
            message = f"You have used all {limit} scans for this {window}.{when}{next_step}"
        self.detail = {
            "code": "upgrade_required",
            "message": message,
            "tier": tier,
            "limit": limit,
            "used": used,
            "reset_period": reset_period,
            "reset_at": reset_at,
        }
        super().__init__(self.detail["message"])


class MechanicsNameConflict(ValueError):
    pass


class MechanicsInUse(ValueError):
    pass


class VersionScanRunning(ValueError):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def _add_months(value: datetime, months: int) -> datetime:
    """Same day next month(s); clamps to the last day when it doesn't exist (Jan 31 -> Feb 28/29)."""
    total = value.month - 1 + months
    year = value.year + total // 12
    month = total % 12 + 1
    if month == 12:
        days_in_month = 31
    else:
        days_in_month = (datetime(year, month + 1, 1) - datetime(year, month, 1)).days
    return value.replace(year=year, month=month, day=min(value.day, days_in_month))


# Billing dates follow the Philippine calendar day (UTC+8, no DST).
BILLING_TZ = timezone(timedelta(hours=8))


def _billing_period_end(start: datetime, billing_period: str | None) -> datetime:
    local = start.astimezone(BILLING_TZ)
    end = _add_months(local, 12 if billing_period == "annual" else 1)
    return end.astimezone(timezone.utc)


def _month_bounds(now: datetime) -> tuple[str, str]:
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return _iso(start), _iso(end)


PAID_TIERS = ("premium", "pro")


def is_paid_tier(tier) -> bool:
    return str(tier or "").lower() in PAID_TIERS


def _reset_period(tier) -> str:
    """Pro allowance resets every Monday; Free and Premium reset monthly."""
    return "weekly" if str(tier or "").lower() == "pro" else "monthly"


def _monday_week_bounds(now: datetime) -> tuple[datetime, datetime]:
    """Philippine calendar week: Monday 00:00 through next Monday 00:00 (UTC+8)."""
    local = now.astimezone(BILLING_TZ)
    start_local = (local - timedelta(days=local.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    end_local = start_local + timedelta(days=7)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def _usage_bounds(
    tier,
    now: datetime,
    anchor: datetime | None = None,
    *,
    coverage_end: datetime | None = None,
) -> tuple[str, str]:
    """Pro resets every Monday while paid; Premium on billing date; Free on the 1st."""
    if _reset_period(tier) != "weekly":
        if str(tier or "").lower() == "premium" and anchor:
            start, end = _billing_cycle_bounds(anchor, now)
            return _iso(start), _iso(end)
        return _month_bounds(now)
    start_dt, end_dt = _monday_week_bounds(now)
    # Weekly Pro windows stop at the paid-through date (end of the subscribed month/year).
    if coverage_end:
        if coverage_end <= start_dt:
            end_dt = start_dt
        elif coverage_end < end_dt:
            end_dt = coverage_end
    return _iso(start_dt), _iso(end_dt)


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
    out = {
        "id": item["id"],
        "name": item["name"],
        "source_filename": item["source_filename"],
        "file_type": item["file_type"],
        "rules": item.get("rules") or {},
        "created_at": item["created_at"],
    }
    ignored = item.get("ignored_fields")
    if isinstance(ignored, list) and ignored:
        out["ignored_fields"] = [str(value) for value in ignored if str(value or "").strip()]
    return out


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
    owner_uid: str,
    name: str,
    filename: str,
    file_type: str,
    text: str,
    parsed: dict,
    rules: dict,
    ignored_fields: list[str] | None = None,
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
        "rules": rules,
        "created_at": created,
    }
    if ignored_fields:
        item["ignored_fields"] = [
            str(value).strip() for value in ignored_fields if str(value or "").strip()
        ]
    # Prefer Cloudinary sidecars so RTDB list/get of mechanics never pulls multi-MB parse trees.
    if artifacts_enabled():
        url = try_upload_json_artifact(
            mechanics_public_id(owner_uid, item_id),
            {"extracted_text": text, "parsed_data": parsed or {}},
        )
        if url:
            item["mechanics_json_url"] = url
    else:
        item["extracted_text"] = text
        item["parsed_data"] = parsed
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
    ignored_fields: list[str] | None = None,
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
    if ignored_fields is not None:
        updates["ignored_fields"] = [
            str(value).strip() for value in ignored_fields if str(value or "").strip()
        ]
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
        # Finished results stay in the user's history; only unfinished scans need the profile.
        if scan.get("status", "done") == "done":
            continue
        _reference(f"{ROOT}/section_formatting_checks/{owner_uid}/{scan_id}").delete()
        _reference(f"{ROOT}/compliance_scans/{owner_uid}/{scan_id}").delete()

    key = _name_key(row.get("name") or "")
    name_ref = _reference(f"{ROOT}/mechanics_names/{owner_uid}/{key}")
    if name_ref.get() == mechanics_id:
        name_ref.delete()
    ref.delete()
    return True


def _title_key(title: str) -> str:
    """Same matching rules as the web library, so a deleted title can be reused."""
    text = str(title or "").strip().lower()
    text = re.sub(r"\.(pdf|docx)$", "", text)
    text = re.sub(r"[\s_–—−-]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _delete_manuscript_tree(owner_uid: str, manuscript_id: str) -> bool:
    ref = _reference(f"{ROOT}/manuscripts/{owner_uid}/{manuscript_id}")
    row = ref.get()
    if not isinstance(row, dict):
        return False
    _reference(f"{ROOT}/manuscript_versions/{owner_uid}/{manuscript_id}").delete()
    scans = _reference(f"{ROOT}/compliance_scans/{owner_uid}").get() or {}
    removed = []
    if isinstance(scans, dict):
        for scan_id, scan in list(scans.items()):
            if not isinstance(scan, dict) or scan.get("manuscript_id") != manuscript_id:
                continue
            _delete_scan(owner_uid, scan_id)
            removed.append(scan_id)
    _mark_scans_deleted(owner_uid, removed)
    ref.delete()
    return True


def _delete_scan(owner_uid: str, scan_id: str) -> None:
    _reference(f"{ROOT}/section_formatting_checks/{owner_uid}/{scan_id}").delete()
    _reference(f"{ROOT}/compliance_scans/{owner_uid}/{scan_id}").delete()
    _reference(f"{ROOT}/scan_index/{owner_uid}/{scan_id}").delete()


def _mark_scans_deleted(owner_uid: str, scan_ids) -> None:
    """Other devices drop their stored copies of these scans on their next refresh."""
    now_text = _iso(_now())
    for scan_id in scan_ids:
        _reference(f"{ROOT}/deleted_scans/{owner_uid}/{scan_id}").set(now_text)


def deleted_scan_ids(owner_uid: str) -> list[str]:
    rows = _reference(f"{ROOT}/deleted_scans/{owner_uid}").get(shallow=True) or {}
    return sorted(str(key) for key in rows) if isinstance(rows, dict) else []


def delete_version(owner_uid: str, manuscript_id: str, version_id: str) -> bool:
    """Remove one version and its scans. Version numbers are never reused."""
    owner_versions = f"{ROOT}/manuscript_versions/{owner_uid}"
    if not isinstance(_reference(f"{owner_versions}/{manuscript_id}/{version_id}").get(), dict):
        # Clients group same-title manuscripts, so the id sent may be a sibling's.
        parents = _reference(owner_versions).get(shallow=True) or {}
        manuscript_id = next(
            (
                str(mid)
                for mid in (parents if isinstance(parents, dict) else {})
                if isinstance(_reference(f"{owner_versions}/{mid}/{version_id}").get(), dict)
            ),
            manuscript_id,
        )
    ms_ref = _reference(f"{ROOT}/manuscripts/{owner_uid}/{manuscript_id}")
    manuscript = ms_ref.get()
    versions = _reference(f"{ROOT}/manuscript_versions/{owner_uid}/{manuscript_id}").get() or {}
    if not isinstance(manuscript, dict) or not isinstance(versions, dict):
        return False
    if not isinstance(versions.get(version_id), dict):
        return False

    scan_ids = _reference(f"{ROOT}/compliance_scans/{owner_uid}").get(shallow=True) or {}
    matched = []
    for scan_id in scan_ids if isinstance(scan_ids, dict) else {}:
        base = f"{ROOT}/compliance_scans/{owner_uid}/{scan_id}"
        if _reference(f"{base}/manuscript_version_id").get() != version_id:
            continue
        if _reference(f"{base}/status").get() == "running":
            raise VersionScanRunning(
                "This version is still being analysed. Wait for the scan to finish, then delete it."
            )
        matched.append(str(scan_id))

    for scan_id in matched:
        _delete_scan(owner_uid, scan_id)
    _mark_scans_deleted(owner_uid, matched)

    removed = versions.get(version_id) if isinstance(versions.get(version_id), dict) else {}
    pending = bool(removed.get("pending"))
    removed_number = int(removed.get("version_number") or 0)
    remaining = {vid: row for vid, row in versions.items() if vid != version_id and isinstance(row, dict)}
    if not remaining:
        _delete_manuscript_tree(owner_uid, manuscript_id)
        return True
    _reference(f"{ROOT}/manuscript_versions/{owner_uid}/{manuscript_id}/{version_id}").delete()
    if pending:
        _sync_counter_after_release(owner_uid, manuscript_id, remaining, [removed_number])
    committed = [row for row in remaining.values() if not row.get("pending")]
    if manuscript.get("current_version_id") == version_id:
        if committed:
            latest = max(committed, key=lambda row: int(row.get("version_number") or 0))
            ms_ref.update({"current_version_id": latest.get("id"), "updated_at": _iso(_now())})
        else:
            ms_ref.update({"current_version_id": None, "updated_at": _iso(_now())})
    return True


def delete_manuscript(owner_uid: str, manuscript_id: str | None = None, title: str | None = None) -> int:
    """Remove a manuscript, every version, and its scans. Match id and the same title."""
    rows = _reference(f"{ROOT}/manuscripts/{owner_uid}").get() or {}
    if not isinstance(rows, dict):
        rows = {}
    title_key = _title_key(title or "")
    target_ids: set[str] = set()
    if manuscript_id and isinstance(rows.get(manuscript_id), dict):
        target_ids.add(manuscript_id)
        title_key = title_key or _title_key(rows[manuscript_id].get("title") or "")
    if title_key:
        for mid, row in rows.items():
            if isinstance(row, dict) and _title_key(row.get("title") or "") == title_key:
                target_ids.add(str(mid))
    deleted = 0
    for mid in target_ids:
        if _delete_manuscript_tree(owner_uid, mid):
            deleted += 1
    return deleted


def get_mechanics(owner_uid: str, mechanics_id: str, conn=None) -> dict | None:
    del conn  # SQLite compat shim
    row = _reference(f"{ROOT}/mechanics/{owner_uid}/{mechanics_id}").get()
    if not isinstance(row, dict):
        return None
    text = row.get("extracted_text") or ""
    parsed = row.get("parsed_data") or {}
    artifact_url = (row.get("mechanics_json_url") or "").strip()
    if artifact_url and (not text or not parsed):
        try:
            blob = download_json_artifact(artifact_url)
            text = text or (blob.get("extracted_text") or "")
            if not parsed:
                parsed = blob.get("parsed_data") or {}
        except CloudinaryFetchError:
            pass
    return {
        **_mechanics_public(row),
        "text": text,
        "parsed_data": parsed if isinstance(parsed, dict) else {},
        "mechanics_json_url": artifact_url,
    }


def _version_counter_ref(owner_uid: str, manuscript_id: str):
    return _reference(f"{ROOT}/manuscripts/{owner_uid}/{manuscript_id}/version_counter")


def _scan_states_for_manuscript(owner_uid: str, manuscript_id: str) -> dict[str, str]:
    """version_id -> 'running' or 'done'."""
    states: dict[str, str] = {}
    scan_ids = _reference(f"{ROOT}/compliance_scans/{owner_uid}").get(shallow=True) or {}
    if not isinstance(scan_ids, dict):
        return states
    for scan_id in scan_ids:
        base = f"{ROOT}/compliance_scans/{owner_uid}/{scan_id}"
        if _reference(f"{base}/manuscript_id").get() != manuscript_id:
            continue
        version_id = str(_reference(f"{base}/manuscript_version_id").get() or "")
        status = str(_reference(f"{base}/status").get() or "")
        if not version_id:
            continue
        if status == "running":
            states[version_id] = "running"
        elif status == "done" and states.get(version_id) != "running":
            states[version_id] = "done"
    return states


def _occupied_version_numbers(versions: dict) -> int:
    numbers = [
        int(row.get("version_number") or 0)
        for row in versions.values()
        if isinstance(row, dict)
    ]
    return max(numbers) if numbers else 0


def _sync_counter_after_release(owner_uid: str, manuscript_id: str, versions: dict, deleted_numbers: list[int]) -> None:
    """Give back numbers that belonged only to uploads the user never scanned."""
    if not deleted_numbers:
        return
    occupied = _occupied_version_numbers(versions)
    deleted = {int(number) for number in deleted_numbers if int(number) > 0}

    def _lower(current):
        if current is None:
            return occupied
        try:
            current_n = int(current)
        except (TypeError, ValueError):
            return current
        if current_n <= occupied:
            return current_n
        hole = set(range(occupied + 1, current_n + 1))
        if hole and hole <= deleted:
            return occupied
        return current_n

    _version_counter_ref(owner_uid, manuscript_id).transaction(_lower)


def _version_list_fields(owner_uid: str, manuscript_id: str, version_id: str) -> dict | None:
    """Small fields only — never pull parsed_data / extracted_text for listings."""
    base = f"{ROOT}/manuscript_versions/{owner_uid}/{manuscript_id}/{version_id}"
    # Existence check without downloading the fat subtree.
    if _reference(base).get(shallow=True) is None:
        return None
    return {
        "id": _reference(f"{base}/id").get() or version_id,
        "version_number": int(_reference(f"{base}/version_number").get() or 0),
        "pending": bool(_reference(f"{base}/pending").get()),
    }


def _list_version_metas(owner_uid: str, manuscript_id: str) -> dict[str, dict]:
    ids = _reference(f"{ROOT}/manuscript_versions/{owner_uid}/{manuscript_id}").get(shallow=True) or {}
    if not isinstance(ids, dict):
        return {}
    out: dict[str, dict] = {}
    for version_id in ids:
        meta = _version_list_fields(owner_uid, manuscript_id, version_id)
        if meta:
            out[str(version_id)] = meta
    return out


def _release_unscanned_versions(owner_uid: str, manuscript_id: str) -> dict:
    """Drop uploads that never finished a scan so they do not consume version numbers."""
    versions_ref = _reference(f"{ROOT}/manuscript_versions/{owner_uid}/{manuscript_id}")
    versions = _list_version_metas(owner_uid, manuscript_id)
    if not versions:
        return {}
    states = _scan_states_for_manuscript(owner_uid, manuscript_id)
    deleted_numbers: list[int] = []
    for version_id, row in list(versions.items()):
        state = states.get(str(version_id))
        if state == "running":
            continue
        if state == "done":
            if row.get("pending"):
                versions_ref.child(version_id).update({"pending": False})
                row["pending"] = False
            continue
        deleted_numbers.append(int(row.get("version_number") or 0))
        versions_ref.child(version_id).delete()
        versions.pop(version_id, None)
    _sync_counter_after_release(owner_uid, manuscript_id, versions, deleted_numbers)
    if deleted_numbers:
        remaining = [row for row in versions.values() if isinstance(row, dict) and not row.get("pending")]
        ms_ref = _reference(f"{ROOT}/manuscripts/{owner_uid}/{manuscript_id}")
        manuscript = ms_ref.get()
        if isinstance(manuscript, dict):
            if remaining:
                latest = max(remaining, key=lambda row: int(row.get("version_number") or 0))
                if manuscript.get("current_version_id") not in {row.get("id") for row in remaining}:
                    ms_ref.update({"current_version_id": latest.get("id"), "updated_at": _iso(_now())})
            else:
                ms_ref.update({"current_version_id": None, "updated_at": _iso(_now())})
    return versions


def _prune_old_committed_versions(owner_uid: str, manuscript_id: str) -> None:
    """Keep only the newest N committed versions (plus any pending uploads)."""
    metas = _list_version_metas(owner_uid, manuscript_id)
    committed = [
        (vid, row)
        for vid, row in metas.items()
        if isinstance(row, dict) and not row.get("pending") and int(row.get("version_number") or 0) > 0
    ]
    if len(committed) <= _MAX_COMMITTED_VERSIONS:
        return
    committed.sort(key=lambda item: int(item[1].get("version_number") or 0), reverse=True)
    keep = {vid for vid, _ in committed[:_MAX_COMMITTED_VERSIONS]}
    versions_ref = _reference(f"{ROOT}/manuscript_versions/{owner_uid}/{manuscript_id}")
    for vid, _row in committed[_MAX_COMMITTED_VERSIONS:]:
        if vid in keep:
            continue
        versions_ref.child(vid).delete()


def commit_version(owner_uid: str, manuscript_id: str, version_id: str) -> None:
    """A version becomes a saved manuscript version only after its scan finishes."""
    ref = _reference(f"{ROOT}/manuscript_versions/{owner_uid}/{manuscript_id}/{version_id}")
    row = ref.get()
    if not isinstance(row, dict):
        return
    if row.get("pending"):
        ref.update({"pending": False})
    number = int(row.get("version_number") or 0)
    if number > 0:
        _version_counter_ref(owner_uid, manuscript_id).transaction(
            lambda current: max(int(current or 0), number)
        )
    _reference(f"{ROOT}/manuscripts/{owner_uid}/{manuscript_id}").update(
        {"current_version_id": version_id, "updated_at": _iso(_now())}
    )
    _prune_old_committed_versions(owner_uid, manuscript_id)


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
    client_request_id: str | None = None,
) -> tuple[dict, bool]:
    created, version_id = _iso(_now()), str(uuid.uuid4())
    if not get_mechanics(owner_uid, mechanics_id):
        raise LookupError("Mechanics not found.")

    # A retried save (lost response, flaky network) returns the version it already created.
    request_ref = None
    request_key = re.sub(r"[^A-Za-z0-9_-]", "_", str(client_request_id or "").strip())[:120]
    if request_key:
        request_ref = _reference(f"{ROOT}/version_requests/{owner_uid}/{request_key}")
        previous = request_ref.get()
        if isinstance(previous, dict) and previous.get("manuscript_id") and previous.get("version_id"):
            existing = get_version(owner_uid, previous["manuscript_id"], previous["version_id"])
            if existing:
                return existing, bool(previous.get("created_parent"))

    if manuscript_id is None:
        # Another device may not know the server id yet; the same title is the same manuscript.
        title_key = _title_key(title)
        rows = _reference(f"{ROOT}/manuscripts/{owner_uid}").get() or {}
        if title_key and isinstance(rows, dict):
            for mid, row in rows.items():
                if isinstance(row, dict) and _title_key(row.get("title") or "") == title_key:
                    manuscript_id = str(row.get("id") or mid)
                    break

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

    try:
        ms_ref = _reference(f"{ROOT}/manuscripts/{owner_uid}/{manuscript_id}")
        manuscript = ms_ref.get()
        if not isinstance(manuscript, dict):
            raise LookupError("Manuscript not found.")

        # An earlier upload that was never scanned must not keep its number.
        _release_unscanned_versions(owner_uid, manuscript_id)
        stored_versions = _list_version_metas(owner_uid, manuscript_id)
        existing_numbers = [
            int(row.get("version_number") or 0)
            for row in stored_versions.values()
            if isinstance(row, dict)
        ]
        highest = max(existing_numbers) if existing_numbers else 0
        # Transaction so web and mobile saving at the same time never get the same number.
        next_number = int(
            _reference(f"{ROOT}/manuscripts/{owner_uid}/{manuscript_id}/version_counter").transaction(
                lambda current: max(int(current or 0), highest) + 1
            )
        )
        version = {
            "id": version_id,
            "manuscript_id": manuscript_id,
            "mechanics_id": mechanics_id,
            "version_number": next_number,
            "pending": True,
            "source_filename": filename,
            "file_type": file_type,
            "created_at": created,
        }
        if cloudinary_url:
            version["cloudinary_url"] = cloudinary_url.strip()
        # Heavy parse trees live on Cloudinary when configured; RTDB keeps metadata + URL only.
        if artifacts_enabled():
            parsed_url = try_upload_json_artifact(
                parsed_public_id(owner_uid, manuscript_id, version_id),
                {"extracted_text": text, "parsed_data": parsed or {}},
            )
            if parsed_url:
                version["parsed_json_url"] = parsed_url
        else:
            version["extracted_text"] = text
            version["parsed_data"] = parsed
        _reference(f"{ROOT}/manuscript_versions/{owner_uid}/{manuscript_id}/{version_id}").set(version)
        has_saved = any(
            isinstance(item, dict) and not item.get("pending") and int(item.get("version_number") or 0) > 0
            for item in stored_versions.values()
        )
        manuscript_update = {"title": title.strip(), "updated_at": created}
        if not has_saved:
            manuscript_update["current_version_id"] = version_id
        ms_ref.update(manuscript_update)
    except Exception:
        if created_parent:
            _delete_manuscript_tree(owner_uid, manuscript_id)
        raise
    if request_ref is not None:
        request_ref.set(
            {
                "manuscript_id": manuscript_id,
                "version_id": version_id,
                "created_parent": created_parent,
                "created_at": created,
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
        # Field-level version metas only — never download parsed_data trees for the dashboard list.
        versions = _list_version_metas(owner_uid, mid)
        committed = [
            item
            for item in versions.values()
            if isinstance(item, dict) and not item.get("pending") and int(item.get("version_number") or 0) > 0
        ]
        latest = max(committed, key=lambda item: int(item.get("version_number") or 0)) if committed else None
        version_number = latest.get("version_number") if isinstance(latest, dict) else None
        items.append(
            {
                "id": mid,
                "title": row.get("title"),
                "current_version_id": (latest or {}).get("id") if latest else None,
                "current_version_number": version_number,
                "version_count": len(committed),
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
            }
        )
    items.sort(key=lambda x: x.get("updated_at") or "", reverse=True)
    return items


def _hydrate_version_content(row: dict) -> tuple[str, dict]:
    """Resolve extracted_text + parsed_data from RTDB legacy fields or Cloudinary sidecar."""
    text = row.get("extracted_text") or ""
    parsed = row.get("parsed_data") or {}
    if not isinstance(parsed, dict):
        parsed = {}
    artifact_url = (row.get("parsed_json_url") or "").strip()
    if artifact_url and (not text or not parsed):
        try:
            blob = download_json_artifact(artifact_url)
            text = text or (blob.get("extracted_text") or "")
            if not parsed:
                candidate = blob.get("parsed_data") or {}
                parsed = candidate if isinstance(candidate, dict) else {}
        except CloudinaryFetchError:
            pass
    return text, parsed


def _version_row(row: dict, include_content: bool = True) -> dict:
    value = {
        "id": row["id"],
        "manuscript_id": row["manuscript_id"],
        "mechanics_id": row["mechanics_id"],
        "version_number": row["version_number"],
        "pending": bool(row.get("pending")),
        "source_filename": row["source_filename"],
        "file_type": row["file_type"],
        "created_at": row["created_at"],
        "cloudinary_url": row.get("cloudinary_url") or "",
        "parsed_json_url": row.get("parsed_json_url") or "",
    }
    if include_content:
        text, parsed = _hydrate_version_content(row)
        value["text"] = text
        value["parsed_data"] = parsed
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
    text, parsed = _hydrate_version_content(row)
    return {
        "id": row["id"],
        "manuscript_id": row["manuscript_id"],
        "mechanics_id": row["mechanics_id"],
        "version_number": row["version_number"],
        "source_filename": row["source_filename"],
        "file_type": row["file_type"],
        "created_at": row["created_at"],
        "text": text,
        "parsed_data": parsed,
        "cloudinary_url": row.get("cloudinary_url") or "",
        "parsed_json_url": row.get("parsed_json_url") or "",
    }


def get_version_document_url(owner_uid: str, manuscript_id: str, version_id: str) -> str | None:
    row = _reference(f"{ROOT}/manuscript_versions/{owner_uid}/{manuscript_id}/{version_id}").get()
    if not isinstance(row, dict):
        return None
    url = (row.get("cloudinary_url") or "").strip()
    return url or None


def _version_list_row(owner_uid: str, manuscript_id: str, version_id: str) -> dict | None:
    """Read only list-safe fields from a version node (never parsed_data / extracted_text)."""
    base = f"{ROOT}/manuscript_versions/{owner_uid}/{manuscript_id}/{version_id}"
    if _reference(base).get(shallow=True) is None:
        return None
    keys = (
        "id",
        "manuscript_id",
        "mechanics_id",
        "version_number",
        "pending",
        "source_filename",
        "file_type",
        "created_at",
        "cloudinary_url",
        "parsed_json_url",
    )
    row = {key: _reference(f"{base}/{key}").get() for key in keys}
    row["id"] = row.get("id") or version_id
    row["manuscript_id"] = row.get("manuscript_id") or manuscript_id
    row["pending"] = bool(row.get("pending"))
    row["cloudinary_url"] = row.get("cloudinary_url") or ""
    row["parsed_json_url"] = row.get("parsed_json_url") or ""
    return row


def list_versions(owner_uid: str, manuscript_id: str, history: bool) -> tuple[list[dict] | None, str | None]:
    manuscript = _reference(f"{ROOT}/manuscripts/{owner_uid}/{manuscript_id}").get()
    if not isinstance(manuscript, dict):
        return None, None
    current_id = manuscript.get("current_version_id")
    version_ids = _reference(f"{ROOT}/manuscript_versions/{owner_uid}/{manuscript_id}").get(shallow=True) or {}
    if not isinstance(version_ids, dict):
        return [], current_id

    if history:
        rows = []
        for vid in version_ids:
            row = _version_list_row(owner_uid, manuscript_id, vid)
            if isinstance(row, dict) and not row.get("pending"):
                rows.append(row)
        rows.sort(key=lambda r: int(r.get("version_number") or 0), reverse=True)
    else:
        current = _version_list_row(owner_uid, manuscript_id, str(current_id)) if current_id else None
        rows = [current] if isinstance(current, dict) else []
    return [_version_row(r, include_content=False) for r in rows if isinstance(r, dict)], current_id


_SCAN_SUMMARY_FIELDS = ("status", "manuscript_id", "manuscript_version_id", "overall_score", "created_at")


def _scan_summary(owner_uid: str, scan_id: str) -> dict | None:
    """Read only the small fields of a scan; the full row can hold thousands of issue locations."""
    base = f"{ROOT}/compliance_scans/{owner_uid}/{scan_id}"
    fields = {key: _reference(f"{base}/{key}").get() for key in _SCAN_SUMMARY_FIELDS}
    if fields.get("status") != "done" or not fields.get("manuscript_id"):
        return None
    manuscript_id = str(fields["manuscript_id"])
    version_id = str(fields.get("manuscript_version_id") or "")
    version_base = f"{ROOT}/manuscript_versions/{owner_uid}/{manuscript_id}/{version_id}"
    version_number = _reference(f"{version_base}/version_number").get() if version_id else None
    source_filename = _reference(f"{version_base}/source_filename").get() if version_id else None
    return {
        "id": scan_id,
        "manuscript_id": manuscript_id,
        "manuscript_version_id": version_id,
        "version_number": int(version_number or 0),
        "source_filename": source_filename or "",
        "overall_score": _optional_float(fields.get("overall_score")),
        "created_at": fields.get("created_at") or "",
    }


def list_scan_summaries(owner_uid: str) -> list[dict]:
    """Finished scans with manuscript titles, cached in scan_index so each scan is read once."""
    scan_ids = _reference(f"{ROOT}/compliance_scans/{owner_uid}").get(shallow=True) or {}
    if not isinstance(scan_ids, dict):
        scan_ids = {}
    index_ref = _reference(f"{ROOT}/scan_index/{owner_uid}")
    index = index_ref.get() or {}
    if not isinstance(index, dict):
        index = {}

    for stale_id in [key for key in index if key not in scan_ids]:
        index_ref.child(stale_id).delete()
        index.pop(stale_id, None)
    for scan_id in scan_ids:
        if scan_id in index:
            continue
        summary = _scan_summary(owner_uid, scan_id)
        if summary:
            index_ref.child(scan_id).set(summary)
            index[scan_id] = summary

    manuscripts = _reference(f"{ROOT}/manuscripts/{owner_uid}").get() or {}
    if not isinstance(manuscripts, dict):
        manuscripts = {}
    items = []
    for summary in index.values():
        if not isinstance(summary, dict):
            continue
        manuscript = manuscripts.get(summary.get("manuscript_id"))
        if not isinstance(manuscript, dict):
            continue
        items.append({**summary, "title": manuscript.get("title") or ""})
    items.sort(key=lambda item: item.get("created_at") or "")
    return items


def is_current_version(owner_uid: str, manuscript_id: str, version_id: str) -> bool | None:
    manuscript = _reference(f"{ROOT}/manuscripts/{owner_uid}/{manuscript_id}").get()
    if not isinstance(manuscript, dict):
        return None
    return manuscript.get("current_version_id") == version_id


def _subscription_row(owner_uid: str) -> dict:
    now, now_text = _now(), _iso(_now())
    ref = _reference(f"{ROOT}/subscriptions/{owner_uid}")
    row = ref.get()
    if not isinstance(row, dict):
        start, end = _month_bounds(now)
        row = {
            "owner_uid": owner_uid,
            "tier": "free",
            "scans_used": 0,
            "period_start": start,
            "period_end": end,
            "reset_period": "monthly",
            "created_at": now_text,
            "updated_at": now_text,
        }
        ref.set(row)
        return row

    tier = str(row.get("tier") or "free").lower()
    coverage = None if row.get("premium_ended") else _coverage_end(row)
    # Pro Monday resets only run while the paid subscription term is still open.
    # After the paid month/year ends, leave counters alone — snapshot drops the tier to free.
    if tier == "pro" and not (coverage and coverage >= now):
        return row

    anchor = _parse_iso(row.get("billing_period_start")) or _parse_iso(row.get("period_start"))
    start, end = _usage_bounds(
        tier,
        now,
        anchor,
        coverage_end=coverage if tier == "pro" else None,
    )
    if now_text >= str(row.get("period_end") or ""):
        row = {
            **row,
            "scans_used": 0,
            "period_start": start,
            "period_end": end,
            "reset_period": _reset_period(tier),
            "updated_at": now_text,
        }
        ref.set(row)
    elif (row.get("period_start"), row.get("period_end")) != (start, end):
        # Same allowance window, just re-aligned (e.g. calendar month -> billing cycle / Monday).
        fix = {"period_start": start, "period_end": end, "updated_at": now_text}
        ref.update(fix)
        row = {**row, **fix}
    return row


def _billing_cycle_bounds(anchor: datetime, now: datetime) -> tuple[datetime, datetime]:
    """Monthly window containing `now`, counted from the anchor's day of month."""
    local_anchor = anchor.astimezone(BILLING_TZ)
    local_now = now.astimezone(BILLING_TZ)
    months = max(
        (local_now.year - local_anchor.year) * 12 + local_now.month - local_anchor.month, 0
    )
    if months and _add_months(local_anchor, months) > local_now:
        months -= 1
    start = _add_months(local_anchor, months)
    end = _add_months(local_anchor, months + 1)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


def _history_list(row: dict) -> list[dict]:
    history = row.get("history")
    if isinstance(history, list):
        return [h for h in history if isinstance(h, dict)]
    if isinstance(history, dict):
        return [h for h in history.values() if isinstance(h, dict)]
    return []


FREE_SCAN_LIMIT = 3
PREMIUM_SCAN_LIMIT = 50
PRO_SCAN_LIMIT = 75


def _plan_limit(tier: str) -> int:
    """Free is 3 scans/month, Premium 50/month, Pro 75/week. Env overrides cannot raise those caps."""
    tier = str(tier or "").lower()
    if tier == "pro":
        configured = int(settings.pro_scan_limit or PRO_SCAN_LIMIT)
        if configured < 1 or configured > PRO_SCAN_LIMIT:
            return PRO_SCAN_LIMIT
        return configured
    if tier == "premium":
        configured = int(settings.premium_scan_limit or PREMIUM_SCAN_LIMIT)
        if configured < 1 or configured > PREMIUM_SCAN_LIMIT:
            return PREMIUM_SCAN_LIMIT
        return configured
    return FREE_SCAN_LIMIT


def _parse_iso(value) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _paid_window_open(renews_at) -> bool:
    end = _parse_iso(renews_at)
    return bool(end and end >= _now())


def _latest_payment(row: dict) -> dict | None:
    """Most recent subscribe/renew, ignoring repeat records of an already-applied payment."""
    latest = None
    seen: set[str] = set()
    payments = [
        (at, entry)
        for entry in _history_list(row)
        if str(entry.get("action") or "") in ("subscribed", "renewed")
        and (at := _parse_iso(entry.get("at")))
    ]
    for _, entry in sorted(payments, key=lambda pair: pair[0]):
        keys = _payment_keys(entry)
        if keys & seen:
            continue
        seen |= keys
        latest = entry
    return latest


def _corrected_renews_at(row: dict) -> datetime | None:
    """Renewal saved with the old flat 30/365-day math, recomputed as a calendar month/year."""
    stored = _parse_iso(row.get("renews_at"))
    payment = _latest_payment(row)
    if not stored or not payment:
        return None
    paid_at = _parse_iso(payment.get("at"))
    period = payment.get("billing_period")
    legacy = paid_at + timedelta(days=365 if period == "annual" else 30)
    if abs((stored - legacy).total_seconds()) > 1:
        return None
    corrected = _billing_period_end(paid_at, period)
    return corrected if corrected != stored else None


def _coverage_end(row: dict) -> datetime | None:
    """Paid-through date. A blank renews_at falls back to the last payment in history."""
    direct = _parse_iso(row.get("renews_at"))
    if direct:
        return direct
    best = None
    for entry in _history_list(row):
        if str(entry.get("action") or "") not in ("subscribed", "renewed"):
            continue
        start = _parse_iso(entry.get("at"))
        if not start:
            continue
        end = _billing_period_end(start, entry.get("billing_period"))
        if best is None or end > best:
            best = end
    return best


def _last_paid_tier(row: dict) -> str:
    """Paid tier to restore while the paid window is still open (older rows are Premium)."""
    stored = str(row.get("paid_tier") or "").lower()
    if stored in PAID_TIERS:
        return stored
    for entry in sorted(_history_list(row), key=lambda h: str(h.get("at") or ""), reverse=True):
        if str(entry.get("action") or "") not in ("subscribed", "renewed"):
            continue
        tier = str(entry.get("tier") or "").lower()
        return tier if tier in PAID_TIERS else "premium"
    return "premium"


def _drop_paid_access(owner_uid: str, *, status: str, end_premium: bool = False) -> dict:
    """Leave Premium/Pro and start a fresh Free allowance of 3 scans."""
    now = _now()
    now_text = _iso(now)
    start, end = _month_bounds(now)
    patch = {
        "tier": "free",
        "status": status,
        "scans_used": 0,
        "renews_at": "",
        "period_start": start,
        "period_end": end,
        "reset_period": "monthly",
        "billing_period_start": "",
        "billing_period_end": "",
        "pending_checkout_session_id": None,
        "premium_ended": True if end_premium else False,
        "updated_at": now_text,
    }
    _reference(f"{ROOT}/subscriptions/{owner_uid}").update(patch)
    return patch


def subscription_snapshot(owner_uid: str) -> dict:
    row = _subscription_row(owner_uid)
    corrected = None if row.get("premium_ended") else _corrected_renews_at(row)
    if corrected:
        fix = {"renews_at": _iso(corrected), "updated_at": _iso(_now())}
        _reference(f"{ROOT}/subscriptions/{owner_uid}").update(fix)
        row = {**row, **fix}
    stored = str(row.get("tier") or "free").lower()
    status = str(row.get("status") or "").lower()
    renews_at = row.get("renews_at")
    used = int(row.get("scans_used") or 0)
    coverage_end = None if row.get("premium_ended") else _coverage_end(row)
    window_open = bool(coverage_end and coverage_end >= _now())
    # Uploading mechanics or refreshing the dashboard must not change the plan.
    # Paid access stays on until the paid date, unless the user explicitly cancels.
    if window_open and stored not in PAID_TIERS:
        now_text = _iso(_now())
        restored = {
            "tier": _last_paid_tier(row),
            "status": "active",
            "renews_at": _iso(coverage_end),
            "premium_ended": False,
            "updated_at": now_text,
        }
        _reference(f"{ROOT}/subscriptions/{owner_uid}").update(restored)
        row = {**row, **restored}
        stored = restored["tier"]
        status = "active"
        renews_at = restored["renews_at"]
    if stored in PAID_TIERS and window_open:
        tier = stored
    elif stored in PAID_TIERS:
        dropped = _drop_paid_access(owner_uid, status="expired", end_premium=True)
        row = {**row, **dropped}
        tier = "free"
        used = 0
    elif used > FREE_SCAN_LIMIT:
        # Overshoot (e.g. parallel scans) must not hand out a fresh allowance.
        tier = "free"
        used = FREE_SCAN_LIMIT
    else:
        tier = "free"
    limit = _plan_limit(tier)
    remaining = max(limit - used, 0)
    paid = tier in PAID_TIERS
    history = []
    seen_payments: set[str] = set()
    for entry in sorted(_history_list(row), key=lambda h: str(h.get("at") or "")):
        keys = _payment_keys(entry) if entry.get("action") in ("subscribed", "renewed") else set()
        if keys & seen_payments:
            continue
        seen_payments |= keys
        history.append(entry)
    history.reverse()
    return {
        "tier": tier,
        "status": row.get("status") or ("active" if paid else "free"),
        "billing_period": row.get("billing_period") or None,
        "billing_period_start": (row.get("billing_period_start") or None) if paid else None,
        "billing_period_end": (row.get("billing_period_end") or row.get("renews_at") or None)
        if paid
        else None,
        "payment_method": row.get("payment_method") or None,
        "renews_at": row.get("renews_at") or None,
        "last_checkout_session_id": row.get("last_checkout_session_id") or None,
        "limit": limit,
        "used": used,
        "remaining": remaining,
        "reset_period": _reset_period(tier),
        "period_start": row.get("period_start"),
        "period_end": row.get("period_end"),
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
    tier: str = "premium",
) -> None:
    now = _iso(_now())
    _reference(f"{ROOT}/paymongo_checkouts/{checkout_session_id}").set(
        {
            "id": checkout_session_id,
            "owner_uid": owner_uid,
            "tier": "pro" if tier == "pro" else "premium",
            "billing_period": billing_period,
            "reference_number": reference_number,
            "amount": amount_pesos,
            "status": "pending",
            "created_at": now,
            "updated_at": now,
        }
    )
    # Pointer so return-from-PayMongo confirm can find the session without the cs id in the URL.
    _reference(f"{ROOT}/subscriptions/{owner_uid}").update(
        {
            "pending_checkout_session_id": checkout_session_id,
            "updated_at": now,
        }
    )


def get_pending_checkout(checkout_session_id: str) -> dict | None:
    row = _reference(f"{ROOT}/paymongo_checkouts/{checkout_session_id}").get()
    return row if isinstance(row, dict) else None


def latest_pending_checkout_id(owner_uid: str) -> str | None:
    row = _subscription_row(owner_uid)
    sid = str(row.get("pending_checkout_session_id") or "").strip()
    return sid or None


def _payment_already_applied(checkout_session_id: str | None, payment_id: str | None) -> bool:
    """Webhook, payment.paid and the confirm fallback can all report one payment."""
    if checkout_session_id:
        pending = get_pending_checkout(checkout_session_id)
        if isinstance(pending, dict) and pending.get("status") == "paid":
            return True
    if payment_id:
        if isinstance(_reference(f"{ROOT}/paymongo_payments/{payment_id}").get(), dict):
            return True
    return False


def _paid_term_patch(row: dict, tier: str, period: str, now: datetime) -> dict:
    """Billing dates and scan window for a purchase or renewal.

    Same plan while still paid: extend from the current paid-through date and keep the
    scan counter and reset window. New plan (or lapsed): start a fresh term and allowance.
    """
    current = str(row.get("tier") or "").lower()
    coverage = None if row.get("premium_ended") else _coverage_end(row)
    if current == tier and coverage and coverage > now:
        renews = _billing_period_end(coverage, period)
        return {
            "billing_period_start": row.get("billing_period_start") or _iso(now),
            "billing_period_end": _iso(renews),
            "renews_at": _iso(renews),
            "reset_period": _reset_period(tier),
        }
    renews = _billing_period_end(now, period)
    start, end = _usage_bounds(tier, now, now, coverage_end=renews)
    return {
        "billing_period_start": _iso(now),
        "billing_period_end": _iso(renews),
        "renews_at": _iso(renews),
        "period_start": start,
        "period_end": end,
        "reset_period": _reset_period(tier),
        "scans_used": 0,
    }


def _payment_keys(entry: dict) -> set[str]:
    return {str(entry[k]) for k in ("payment_id", "checkout_session_id") if entry.get(k)}


def activate_premium_from_payment(
    owner_uid: str,
    *,
    billing_period: str,
    payment_method: str | None,
    amount_pesos: int | None,
    checkout_session_id: str | None = None,
    payment_id: str | None = None,
    reference_number: str | None = None,
    tier: str = "premium",
) -> dict:
    if _payment_already_applied(checkout_session_id, payment_id):
        return subscription_snapshot(owner_uid)
    claims = _claim_payment_activation(checkout_session_id, payment_id)
    if claims is None:
        return subscription_snapshot(owner_uid)
    try:
        return _apply_paid_activation(
            owner_uid,
            billing_period=billing_period,
            payment_method=payment_method,
            amount_pesos=amount_pesos,
            checkout_session_id=checkout_session_id,
            payment_id=payment_id,
            reference_number=reference_number,
            tier=tier,
        )
    except Exception:
        _release_payment_activation(claims)
        raise


def _claim_payment_activation(
    checkout_session_id: str | None, payment_id: str | None
) -> list | None:
    """Atomically claim a payment so the webhook and confirm fallback cannot both apply it.

    Returns the claimed references, or None when another caller already claimed it.
    """
    keys = [f"cs_{checkout_session_id}" if checkout_session_id else "", f"pay_{payment_id}" if payment_id else ""]
    claimed = []
    for key in filter(None, keys):
        safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in key)[:200]
        ref = _reference(f"{ROOT}/paymongo_activation_claims/{safe}")
        count = int(ref.transaction(lambda current: int(current or 0) + 1) or 0)
        claimed.append(ref)
        if count != 1:
            _release_payment_activation(claimed)
            return None
    return claimed


def _release_payment_activation(claims: list) -> None:
    for ref in claims:
        try:
            ref.transaction(lambda current: max(int(current or 0) - 1, 0))
        except Exception:
            continue


def _apply_paid_activation(
    owner_uid: str,
    *,
    billing_period: str,
    payment_method: str | None,
    amount_pesos: int | None,
    checkout_session_id: str | None,
    payment_id: str | None,
    reference_number: str | None,
    tier: str,
) -> dict:
    keys = {k for k in (payment_id, checkout_session_id) if k}
    if keys and any(keys & _payment_keys(h) for h in _history_list(_subscription_row(owner_uid))):
        return subscription_snapshot(owner_uid)
    now = _now()
    now_text = _iso(now)
    plan = "pro" if str(tier or "").lower() == "pro" else "premium"
    period = "annual" if billing_period == "annual" else "monthly"
    row = _subscription_row(owner_uid)
    previous_tier = str(row.get("tier") or "free").lower()
    term = _paid_term_patch(row, plan, period, now)
    patch = {
        "tier": plan,
        "paid_tier": plan,
        "status": "active",
        "billing_period": period,
        "payment_method": payment_method or "paymongo",
        "provider": "paymongo",
        "premium_ended": False,
        "payment_issue": False,
        "payment_issue_reason": None,
        "last_checkout_session_id": checkout_session_id,
        "last_payment_id": payment_id,
        "last_reference_number": reference_number,
        "updated_at": now_text,
        **term,
    }
    _reference(f"{ROOT}/subscriptions/{owner_uid}").update(patch)
    _append_history(
        owner_uid,
        {
            "id": payment_id or checkout_session_id or str(uuid.uuid4()),
            "action": "subscribed",
            "at": now_text,
            "tier": plan,
            "previous_tier": previous_tier,
            "billing_period": period,
            "billing_period_start": term["billing_period_start"],
            "billing_period_end": term["billing_period_end"],
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
                "tier": plan,
                "billing_period": period,
                "billing_period_start": term["billing_period_start"],
                "billing_period_end": term["billing_period_end"],
                "created_at": now_text,
            }
        )
    return subscription_snapshot(owner_uid)


def cancel_user_subscription(owner_uid: str, *, immediate: bool = True) -> dict:
    """End Premium now and start a fresh Free allowance of 3 scans."""
    _ = immediate
    snapshot = subscription_snapshot(owner_uid)
    if not is_paid_tier(snapshot.get("tier")):
        # Free accounts have nothing to cancel; resetting here would refill their scans.
        return snapshot
    row = _subscription_row(owner_uid)
    now_text = _iso(_now())
    _drop_paid_access(owner_uid, status="canceled", end_premium=True)
    _append_history(
        owner_uid,
        {
            "id": str(uuid.uuid4()),
            "action": "canceled",
            "at": now_text,
            "tier": row.get("tier"),
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
    tier: str | None = None,
) -> dict:
    if _payment_already_applied(None, payment_id):
        return subscription_snapshot(owner_uid)
    now = _now()
    now_text = _iso(now)
    period = "annual" if billing_period == "annual" else "monthly"
    row = _subscription_row(owner_uid)
    requested = str(tier or "").lower()
    plan = requested if requested in PAID_TIERS else _last_paid_tier(row)
    term = _paid_term_patch(row, plan, period, now)
    patch = {
        "tier": plan,
        "paid_tier": plan,
        "status": "active",
        "premium_ended": False,
        "payment_issue": False,
        "payment_issue_reason": None,
        "billing_period": period,
        "last_payment_id": payment_id,
        "updated_at": now_text,
        **term,
    }
    _reference(f"{ROOT}/subscriptions/{owner_uid}").update(patch)
    if payment_id:
        _reference(f"{ROOT}/paymongo_payments/{payment_id}").set(
            {
                "id": payment_id,
                "owner_uid": owner_uid,
                "tier": plan,
                "billing_period": period,
                "billing_period_start": term["billing_period_start"],
                "billing_period_end": term["billing_period_end"],
                "created_at": now_text,
            }
        )
    _append_history(
        owner_uid,
        {
            "id": payment_id or str(uuid.uuid4()),
            "action": "renewed",
            "at": now_text,
            "tier": plan,
            "billing_period": period,
            "billing_period_start": term["billing_period_start"],
            "billing_period_end": term["billing_period_end"],
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
    # Mark the paid window as ended, otherwise the snapshot restores the paid tier.
    _drop_paid_access(uid, status="refunded" if "refund" in reason else "unpaid", end_premium=True)
    _reference(f"{ROOT}/subscriptions/{uid}").update(
        {
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
    if not is_paid_tier(sub["tier"]):
        raise UpgradeRequired(sub["tier"], sub["limit"], sub["used"], feature=True)


def check_scan_eligibility(
    owner_uid: str, manuscript_id: str, version_id: str, citation_style: str | None = None
) -> dict:
    citation_style = str(citation_style or "").strip().upper() or None
    sub = subscription_snapshot(owner_uid)
    current = is_current_version(owner_uid, manuscript_id, version_id)
    if current is None:
        raise LookupError("Manuscript not found.")
    if not is_paid_tier(sub["tier"]) and not current:
        raise UpgradeRequired(sub["tier"], sub["limit"], sub["used"], feature=True)
    if not is_paid_tier(sub["tier"]) and citation_style and citation_style != "APA":
        raise UpgradeRequired(
            sub["tier"],
            sub["limit"],
            sub["used"],
            feature=True,
            message=(
                f"{citation_style} citation checks are available on Premium and Pro. "
                "The Free plan checks APA only — change this format's citation style to APA, "
                "or upgrade on the Subscription page."
            ),
        )
    # Running scans are charged when they finish, so count them now or parallel scans overshoot.
    if sub["used"] + _in_flight_scan_count(owner_uid) >= sub["limit"]:
        raise UpgradeRequired(sub["tier"], sub["limit"], sub["used"], reset_at=sub.get("reset_at"))
    return sub


def _in_flight_scan_count(owner_uid: str) -> int:
    cutoff = _now() - timedelta(minutes=30)
    count = 0
    for created_at, _ in _running_scans(owner_uid):
        started = _parse_iso(created_at)
        if started and started >= cutoff:
            count += 1
    return count


def _assert_scan_inputs(
    owner_uid: str,
    manuscript_id: str,
    version_id: str,
    mechanics_id: str,
    *,
    enforce_limit: bool = True,
) -> tuple[dict, dict, dict, dict]:
    snap = subscription_snapshot(owner_uid)
    sub = _subscription_row(owner_uid)
    limit = snap["limit"]
    manuscript = _reference(f"{ROOT}/manuscripts/{owner_uid}/{manuscript_id}").get()
    version = _reference(f"{ROOT}/manuscript_versions/{owner_uid}/{manuscript_id}/{version_id}").get()
    mechanics = _reference(f"{ROOT}/mechanics/{owner_uid}/{mechanics_id}").get()
    if not isinstance(manuscript, dict) or not isinstance(version, dict) or not isinstance(mechanics, dict):
        raise LookupError("Requested scan input was not found.")

    if not enforce_limit:
        return sub, manuscript, version, mechanics
    # A pending upload is the version being scanned, not an older saved version.
    scanning_current = manuscript.get("current_version_id") == version_id or bool(version.get("pending"))
    old_version = not is_paid_tier(snap["tier"]) and not scanning_current
    if old_version:
        raise UpgradeRequired(snap["tier"] or "free", limit, int(snap["used"] or 0), feature=True)
    if int(snap["used"] or 0) >= limit:
        raise UpgradeRequired(
            snap["tier"] or "free", limit, int(snap["used"] or 0), reset_at=snap.get("reset_at")
        )
    return sub, manuscript, version, mechanics


def sanitize_pagination_issues(issues: list | None) -> list:
    """Pass through pagination issues from the analyzer (position, title, chapter, style, …)."""
    return [issue for issue in (issues or []) if isinstance(issue, dict)]


def _sanitize_pagination_sections(sections: list | None, issues: list) -> list:
    pag_issues = [
        issue
        for issue in issues
        if str(issue.get("issue_type") or "").startswith("pagination")
        or str(issue.get("category") or "") == "Pagination"
    ]
    cleaned: list = []
    for section in sections or []:
        if not isinstance(section, dict):
            continue
        if str(section.get("section") or "") != "Pagination":
            cleaned.append(section)
            continue
        row = dict(section)
        count = len(pag_issues)
        row["issue_count"] = count
        if count == 0 and int(row.get("units_failed") or 0) == 0:
            # Keep analyzer unit counts; only clarify a clean pass when nothing failed.
            row["formatting_score"] = 100.0 if row.get("units_checked") else row.get("formatting_score")
            if row.get("units_checked"):
                row["status"] = "pass"
        cleaned.append(row)
    return cleaned


def sanitize_scan_pagination_payload(payload: dict) -> dict:
    """Strip legacy pagination issues from a scan result or get_scan payload."""
    if not isinstance(payload, dict):
        return payload
    issues = sanitize_pagination_issues(payload.get("issues"))
    out = dict(payload)
    out["issues"] = issues
    if "sections" in out:
        out["sections"] = _sanitize_pagination_sections(out.get("sections"), issues)
    return out


SCAN_RESULT_FIELDS = (
    "right_pct",
    "wrong_pct",
    "category_wrong_pct",
    "severity_pct",
    "units_checked",
    "units_passed",
    "units_failed",
    "scoring",
)
_SECTION_COUNT_FIELDS = ("units_checked", "units_passed", "units_failed")


def _optional_float(value) -> float | None:
    return None if value is None else float(value)


def _section_row(item: dict) -> dict:
    row = {
        "section": item.get("section") or item.get("section_name"),
        "formatting_score": _optional_float(item.get("formatting_score")),
        "issue_count": int(item.get("issue_count") or 0),
        "issues": item.get("issues") or [],
    }
    if item.get("status"):
        row["status"] = item["status"]
    for key in _SECTION_COUNT_FIELDS:
        if item.get(key) is not None:
            row[key] = int(item[key])
    return row


def _write_section_checks(owner_uid: str, scan_id: str, sections: list[dict]) -> None:
    """Store section score summaries only — full issue arrays live in scan.json on Cloudinary."""
    for index, section in enumerate(sections or []):
        if not isinstance(section, dict):
            continue
        name = section.get("section") or section.get("section_name")
        if not name:
            continue
        row = _section_row(section)
        check = {
            "id": str(index + 1),
            "section_name": name,
            "formatting_score": row["formatting_score"],
            "issue_count": row["issue_count"],
            # Intentionally omit issues[] from RTDB to avoid download amplification.
        }
        for key in ("status", *_SECTION_COUNT_FIELDS):
            if key in row:
                check[key] = row[key]
        _reference(
            f"{ROOT}/section_formatting_checks/{owner_uid}/{scan_id}/{check['id']}"
        ).set(check)


def _increment_scan_usage(owner_uid: str, created: str) -> None:
    # Transaction so scans finishing at the same time on web and mobile both count.
    _reference(f"{ROOT}/subscriptions/{owner_uid}/scans_used").transaction(
        lambda current: int(current or 0) + 1
    )
    _reference(f"{ROOT}/subscriptions/{owner_uid}").update({"updated_at": created})


def _claim_scan_usage(owner_uid: str, scan_id: str) -> bool:
    """True only for the first finalize of a scan, so repeated polls never charge twice."""
    claims = _reference(f"{ROOT}/compliance_scans/{owner_uid}/{scan_id}/usage_claims").transaction(
        lambda current: int(current or 0) + 1
    )
    return int(claims or 0) == 1


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


def mark_scan_ml_requeued(owner_uid: str, scan_id: str) -> bool:
    """Claim a one-time ML requeue so parallel progress polls do not submit twice."""
    row = get_scan(owner_uid, scan_id)
    if not isinstance(row, dict) or row.get("status") != "running":
        return False
    if row.get("ml_requeued"):
        return False
    claims = _reference(f"{ROOT}/compliance_scans/{owner_uid}/{scan_id}/ml_requeue_claims").transaction(
        lambda current: int(current or 0) + 1
    )
    if int(claims or 0) != 1:
        return False
    _reference(f"{ROOT}/compliance_scans/{owner_uid}/{scan_id}").update(
        {"ml_requeued": True, "updated_at": _iso(_now())}
    )
    return True


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
                "error": error or "The analysis could not finish. No scan was used. Run the scan again.",
                "updated_at": updated,
            }
        )
        _reference(f"{ROOT}/compliance_scans/{owner_uid}/{scan_id}").update(row)
        return get_scan(owner_uid, scan_id) or row

    # The limit was checked when the scan started; re-checking here would leave an admitted
    # scan stuck in "running" forever.
    _assert_scan_inputs(owner_uid, manuscript_id, version_id, mechanics_id, enforce_limit=False)
    cleaned = sanitize_scan_pagination_payload(result)
    issues = cleaned.get("issues") or []
    sections = cleaned.get("sections") or []
    overall_score = _optional_float(cleaned.get("overall_score"))

    row.update({key: cleaned.get(key) for key in SCAN_RESULT_FIELDS})
    row.update(
        {
            "status": "done",
            "overall_score": overall_score,
            "issue_count": len(issues) if isinstance(issues, list) else 0,
            "page_count": result.get("page_count") or 0,
            "pagination": result.get("pagination") or {},
            "updated_at": updated,
            "error": None,
        }
    )
    # Drop any previously embedded fat arrays from the RTDB row.
    row["issues"] = None
    row["sections"] = None
    if artifacts_enabled():
        result_url = try_upload_json_artifact(
            scan_public_id(owner_uid, manuscript_id, version_id, scan_id),
            {
                "issues": issues,
                "sections": sections,
                "overall_score": overall_score,
                **{key: cleaned.get(key) for key in SCAN_RESULT_FIELDS},
                "page_count": result.get("page_count") or 0,
                "pagination": result.get("pagination") or {},
            },
        )
        if result_url:
            row["result_json_url"] = result_url
    else:
        row["issues"] = issues
        row["sections"] = sections
    _reference(f"{ROOT}/compliance_scans/{owner_uid}/{scan_id}").update(row)
    _write_section_checks(owner_uid, scan_id, sections)
    commit_version(owner_uid, manuscript_id, version_id)
    if _claim_scan_usage(owner_uid, scan_id):
        _increment_scan_usage(owner_uid, created)
    return get_scan(owner_uid, scan_id) or row


def persist_scan(
    owner_uid: str,
    manuscript_id: str,
    version_id: str,
    mechanics_id: str,
    overall_score: float | None,
    issues: list[dict],
    sections: list[dict],
    *,
    extra: dict | None = None,
) -> dict:
    scan_id, created = str(uuid.uuid4()), _iso(_now())
    _assert_scan_inputs(owner_uid, manuscript_id, version_id, mechanics_id)
    issues = sanitize_pagination_issues(issues)
    sections = _sanitize_pagination_sections(sections, issues)

    scan = {
        "id": scan_id,
        "owner_uid": owner_uid,
        "manuscript_id": manuscript_id,
        "manuscript_version_id": version_id,
        "mechanics_id": mechanics_id,
        "overall_score": _optional_float(overall_score),
        "issue_count": len(issues) if isinstance(issues, list) else 0,
        "status": "done",
        "ml_job_id": scan_id,
        "created_at": created,
        "updated_at": created,
    }
    if extra:
        scan.update(extra)
    if artifacts_enabled():
        result_url = try_upload_json_artifact(
            scan_public_id(owner_uid, manuscript_id, version_id, scan_id),
            {
                "issues": issues,
                "sections": sections,
                "overall_score": scan["overall_score"],
                **{key: (extra or {}).get(key) for key in SCAN_RESULT_FIELDS if extra and key in extra},
            },
        )
        if result_url:
            scan["result_json_url"] = result_url
    else:
        scan["issues"] = issues
    _reference(f"{ROOT}/compliance_scans/{owner_uid}/{scan_id}").set(scan)
    _write_section_checks(owner_uid, scan_id, sections)
    commit_version(owner_uid, manuscript_id, version_id)
    _increment_scan_usage(owner_uid, created)
    return get_scan(owner_uid, scan_id)


def _running_scans(owner_uid: str) -> list[tuple[str, str]]:
    """(created_at, scan_id) of scans still waiting on the ML service, oldest first.

    Finished scans are in scan_index, so only the few unindexed ones are read (status only).
    """
    scan_ids = _reference(f"{ROOT}/compliance_scans/{owner_uid}").get(shallow=True) or {}
    if not isinstance(scan_ids, dict):
        return []
    index = _reference(f"{ROOT}/scan_index/{owner_uid}").get(shallow=True) or {}
    if not isinstance(index, dict):
        index = {}
    running = []
    for scan_id in scan_ids:
        if scan_id in index:
            continue
        base = f"{ROOT}/compliance_scans/{owner_uid}/{scan_id}"
        if _reference(f"{base}/status").get() == "running":
            running.append((str(_reference(f"{base}/created_at").get() or ""), str(scan_id)))
    running.sort()
    return running


def running_scan_ids(owner_uid: str) -> list[str]:
    return [scan_id for _, scan_id in _running_scans(owner_uid)]


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
            section_items.append(_section_row(item))
    status = row.get("status") or ("done" if row.get("overall_score") is not None else "running")
    issues = row.get("issues") or []
    if not isinstance(issues, list):
        issues = []
    artifact_url = (row.get("result_json_url") or "").strip()
    if artifact_url:
        try:
            blob = download_json_artifact(artifact_url)
            if isinstance(blob.get("issues"), list):
                issues = blob["issues"]
            if isinstance(blob.get("sections"), list) and blob["sections"]:
                section_items = [_section_row(item) for item in blob["sections"] if isinstance(item, dict)]
            for key in SCAN_RESULT_FIELDS:
                if blob.get(key) is not None and row.get(key) is None:
                    row[key] = blob[key]
            if blob.get("page_count") is not None and row.get("page_count") is None:
                row["page_count"] = blob.get("page_count")
            if blob.get("pagination") is not None and row.get("pagination") is None:
                row["pagination"] = blob.get("pagination")
            if blob.get("overall_score") is not None and row.get("overall_score") is None:
                row["overall_score"] = blob.get("overall_score")
        except CloudinaryFetchError:
            pass
    if not section_items:
        embedded = row.get("sections") or []
        if isinstance(embedded, list):
            for item in embedded:
                if not isinstance(item, dict):
                    continue
                section_items.append(_section_row(item))
    payload = {
        "id": row["id"],
        "manuscript_id": row.get("manuscript_id"),
        "manuscript_version_id": row["manuscript_version_id"],
        "mechanics_id": row["mechanics_id"],
        "status": status,
        "ml_job_id": row.get("ml_job_id") or row["id"],
        "overall_score": _optional_float(row.get("overall_score")),
        "issues": issues,
        "sections": section_items,
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "error": row.get("error"),
        "result_json_url": artifact_url,
    }
    for key in SCAN_RESULT_FIELDS:
        if row.get(key) is not None:
            payload[key] = row[key]
    if row.get("page_count") is not None:
        payload["page_count"] = int(row.get("page_count") or 0)
    if row.get("pagination") is not None:
        payload["pagination"] = row.get("pagination") or {}
    return sanitize_scan_pagination_payload(payload)
