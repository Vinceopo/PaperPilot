from __future__ import annotations

import copy
import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from app.config import settings
from app.firebase_admin_app import firebase_admin_app

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "paperpilot.db"
_write_lock = threading.RLock()

# Firebase Realtime Database root for compliance + billing state.
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


def _reference(path: str):
    if not firebase_admin_app():
        raise RuntimeError("Firebase Realtime Database is unavailable.")
    from firebase_admin import db

    return db.reference(path)


def _name_key(name: str) -> str:
    from urllib.parse import quote

    return quote(name.strip().casefold(), safe="").replace(".", "%2E")


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 15000")
    return conn


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()


def init_db() -> None:
    with _write_lock, connection() as conn:
        conn.executescript(
            """
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS mechanics (
                id TEXT PRIMARY KEY,
                owner_uid TEXT NOT NULL,
                name TEXT NOT NULL,
                source_filename TEXT NOT NULL,
                file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'docx')),
                extracted_text TEXT NOT NULL,
                parsed_data_json TEXT NOT NULL,
                rules_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_mechanics_owner_created
                ON mechanics(owner_uid, created_at DESC);

            CREATE TABLE IF NOT EXISTS manuscripts (
                id TEXT PRIMARY KEY,
                owner_uid TEXT NOT NULL,
                title TEXT NOT NULL,
                current_version_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (current_version_id) REFERENCES manuscript_versions(id)
            );
            CREATE INDEX IF NOT EXISTS idx_manuscripts_owner_updated
                ON manuscripts(owner_uid, updated_at DESC);

            CREATE TABLE IF NOT EXISTS manuscript_versions (
                id TEXT PRIMARY KEY,
                manuscript_id TEXT NOT NULL,
                mechanics_id TEXT NOT NULL,
                version_number INTEGER NOT NULL CHECK (version_number > 0),
                source_filename TEXT NOT NULL,
                file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'docx')),
                extracted_text TEXT NOT NULL,
                parsed_data_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE (manuscript_id, version_number),
                FOREIGN KEY (manuscript_id) REFERENCES manuscripts(id) ON DELETE CASCADE,
                FOREIGN KEY (mechanics_id) REFERENCES mechanics(id)
            );
            CREATE INDEX IF NOT EXISTS idx_versions_manuscript_number
                ON manuscript_versions(manuscript_id, version_number DESC);

            CREATE TABLE IF NOT EXISTS compliance_scans (
                id TEXT PRIMARY KEY,
                owner_uid TEXT NOT NULL,
                manuscript_version_id TEXT NOT NULL,
                mechanics_id TEXT NOT NULL,
                overall_score DECIMAL(5,2) NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
                issues_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (manuscript_version_id) REFERENCES manuscript_versions(id),
                FOREIGN KEY (mechanics_id) REFERENCES mechanics(id)
            );
            CREATE INDEX IF NOT EXISTS idx_scans_owner_created
                ON compliance_scans(owner_uid, created_at DESC);

            CREATE TABLE IF NOT EXISTS section_formatting_checks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scan_id TEXT NOT NULL,
                section_name TEXT NOT NULL,
                formatting_score DECIMAL(5,2) NOT NULL CHECK (formatting_score BETWEEN 0 AND 100),
                issue_count INTEGER NOT NULL DEFAULT 0,
                issues_json TEXT NOT NULL,
                FOREIGN KEY (scan_id) REFERENCES compliance_scans(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_section_checks_scan
                ON section_formatting_checks(scan_id);

            CREATE TABLE IF NOT EXISTS subscriptions (
                owner_uid TEXT PRIMARY KEY,
                tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'premium')),
                scans_used INTEGER NOT NULL DEFAULT 0 CHECK (scans_used >= 0),
                period_start TEXT NOT NULL,
                period_end TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        try:
            conn.execute(
                """CREATE UNIQUE INDEX IF NOT EXISTS idx_mechanics_owner_name_nocase
                   ON mechanics(owner_uid, name COLLATE NOCASE)"""
            )
        except sqlite3.IntegrityError:
            # Older local databases may already contain duplicate names. New
            # writes are still guarded transactionally below until renamed.
            pass
        # Keep filenames from earlier app versions in sync with their saved
        # display names while preserving the original document extension.
        rows = conn.execute("SELECT id, name, source_filename FROM mechanics").fetchall()
        for row in rows:
            extension = Path(row["source_filename"]).suffix.lower()
            expected = f"{row['name']}{extension}"
            if row["source_filename"] != expected:
                conn.execute(
                    "UPDATE mechanics SET source_filename = ? WHERE id = ?",
                    (expected, row["id"]),
                )
        conn.commit()


def _loads(value: str) -> object:
    return json.loads(value)


def _mechanics_row(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "source_filename": row["source_filename"],
        "file_type": row["file_type"],
        "rules": _loads(row["rules_json"]),
        "created_at": row["created_at"],
    }


def create_mechanics(
    owner_uid: str, name: str, filename: str, file_type: str, text: str, parsed: dict, rules: dict
) -> dict:
    item_id, created, clean_name = str(uuid.uuid4()), _iso(_now()), name.strip()
    with _write_lock, connection() as conn:
        duplicate = conn.execute(
            "SELECT 1 FROM mechanics WHERE owner_uid = ? AND name = ? COLLATE NOCASE",
            (owner_uid, clean_name),
        ).fetchone()
        if duplicate:
            raise MechanicsNameConflict("A mechanics document with this name already exists.")
        try:
            conn.execute(
                """INSERT INTO mechanics
                   (id, owner_uid, name, source_filename, file_type, extracted_text,
                    parsed_data_json, rules_json, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    item_id, owner_uid, clean_name, filename, file_type, text,
                    json.dumps(parsed, ensure_ascii=False), json.dumps(rules), created,
                ),
            )
        except sqlite3.IntegrityError as exc:
            raise MechanicsNameConflict(
                "A mechanics document with this name already exists."
            ) from exc
        conn.commit()
        row = conn.execute("SELECT * FROM mechanics WHERE id = ?", (item_id,)).fetchone()
    return _mechanics_row(row)


def list_mechanics(owner_uid: str) -> list[dict]:
    with connection() as conn:
        rows = conn.execute(
            "SELECT * FROM mechanics WHERE owner_uid = ? ORDER BY created_at DESC, rowid DESC",
            (owner_uid,),
        ).fetchall()
    return [_mechanics_row(row) for row in rows]


def rename_mechanics(owner_uid: str, mechanics_id: str, name: str) -> dict | None:
    return update_mechanics(owner_uid, mechanics_id, name=name)


def update_mechanics(
    owner_uid: str,
    mechanics_id: str,
    name: str | None = None,
    rules: dict | None = None,
) -> dict | None:
    """Rename and/or replace the stored format rules for a mechanics profile."""
    with _write_lock, connection() as conn:
        row = conn.execute(
            "SELECT * FROM mechanics WHERE id = ? AND owner_uid = ?",
            (mechanics_id, owner_uid),
        ).fetchone()
        if not row:
            return None

        clean_name = row["name"]
        renamed_filename = row["source_filename"]
        if name is not None:
            clean_name = name.strip()
            extension = Path(row["source_filename"]).suffix.lower()
            if extension and clean_name.lower().endswith(extension):
                clean_name = clean_name[: -len(extension)].strip()
            if not clean_name:
                raise ValueError("A mechanics name is required.")
            renamed_filename = f"{clean_name}{extension}"
            duplicate = conn.execute(
                """SELECT 1 FROM mechanics
                   WHERE owner_uid = ? AND name = ? COLLATE NOCASE AND id <> ?""",
                (owner_uid, clean_name, mechanics_id),
            ).fetchone()
            if duplicate:
                raise MechanicsNameConflict("A mechanics document with this name already exists.")

        rules_json = row["rules_json"]
        if rules is not None:
            rules_json = json.dumps(rules, ensure_ascii=False)

        try:
            conn.execute(
                """UPDATE mechanics
                   SET name = ?, source_filename = ?, rules_json = ?
                   WHERE id = ? AND owner_uid = ?""",
                (clean_name, renamed_filename, rules_json, mechanics_id, owner_uid),
            )
        except sqlite3.IntegrityError as exc:
            raise MechanicsNameConflict(
                "A mechanics document with this name already exists."
            ) from exc
        conn.commit()
        updated = conn.execute("SELECT * FROM mechanics WHERE id = ?", (mechanics_id,)).fetchone()
    return _mechanics_row(updated)


def delete_mechanics(owner_uid: str, mechanics_id: str) -> bool:
    """Remove a mechanics profile.

    Linked compliance scans for this format are removed. Manuscript versions that
    pointed at it keep their files; the format link becomes inactive so deletion
    is never blocked by prior uploads.
    """
    with _write_lock:
        conn = _connect()
        try:
            # SQLite refuses to change this pragma mid-transaction, so disable
            # FKs before any other statements on this connection.
            conn.execute("PRAGMA foreign_keys = OFF")
            row = conn.execute(
                "SELECT 1 FROM mechanics WHERE id = ? AND owner_uid = ?",
                (mechanics_id, owner_uid),
            ).fetchone()
            if not row:
                return False

            scan_ids = [
                r["id"]
                for r in conn.execute(
                    """SELECT s.id FROM compliance_scans s
                       WHERE s.mechanics_id = ? AND s.owner_uid = ?""",
                    (mechanics_id, owner_uid),
                ).fetchall()
            ]
            for scan_id in scan_ids:
                conn.execute(
                    "DELETE FROM section_formatting_checks WHERE scan_id = ?",
                    (scan_id,),
                )
            if scan_ids:
                conn.execute(
                    "DELETE FROM compliance_scans WHERE mechanics_id = ? AND owner_uid = ?",
                    (mechanics_id, owner_uid),
                )
            conn.execute(
                "DELETE FROM mechanics WHERE id = ? AND owner_uid = ?",
                (mechanics_id, owner_uid),
            )
            conn.commit()
            return True
        finally:
            conn.close()


def get_mechanics(owner_uid: str, mechanics_id: str, conn: sqlite3.Connection | None = None) -> dict | None:
    owns_conn = conn is None
    conn = conn or _connect()
    try:
        row = conn.execute(
            "SELECT * FROM mechanics WHERE id = ? AND owner_uid = ?", (mechanics_id, owner_uid)
        ).fetchone()
        if not row:
            return None
        return {
            **_mechanics_row(row),
            "text": row["extracted_text"],
            "parsed_data": _loads(row["parsed_data_json"]),
        }
    finally:
        if owns_conn:
            conn.close()


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
    created, version_id = _iso(_now()), str(uuid.uuid4())
    with _write_lock, connection() as conn:
        conn.execute("BEGIN IMMEDIATE")
        mechanics = conn.execute(
            "SELECT 1 FROM mechanics WHERE id = ? AND owner_uid = ?", (mechanics_id, owner_uid)
        ).fetchone()
        if not mechanics:
            conn.rollback()
            raise LookupError("Mechanics not found.")
        created_parent = manuscript_id is None
        if created_parent:
            manuscript_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO manuscripts
                   (id, owner_uid, title, current_version_id, created_at, updated_at)
                   VALUES (?, ?, ?, NULL, ?, ?)""",
                (manuscript_id, owner_uid, title.strip(), created, created),
            )
            version_number = 1
        else:
            parent = conn.execute(
                "SELECT id FROM manuscripts WHERE id = ? AND owner_uid = ?",
                (manuscript_id, owner_uid),
            ).fetchone()
            if not parent:
                conn.rollback()
                raise LookupError("Manuscript not found.")
            version_number = conn.execute(
                "SELECT COALESCE(MAX(version_number), 0) + 1 FROM manuscript_versions WHERE manuscript_id = ?",
                (manuscript_id,),
            ).fetchone()[0]
        conn.execute(
            """INSERT INTO manuscript_versions
               (id, manuscript_id, mechanics_id, version_number, source_filename, file_type,
                extracted_text, parsed_data_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                version_id, manuscript_id, mechanics_id, version_number, filename, file_type,
                text, json.dumps(parsed, ensure_ascii=False), created,
            ),
        )
        conn.execute(
            """UPDATE manuscripts SET title = ?, current_version_id = ?, updated_at = ?
               WHERE id = ?""",
            (title.strip(), version_id, created, manuscript_id),
        )
        conn.commit()
    return get_version(owner_uid, manuscript_id, version_id), created_parent


def list_manuscripts(owner_uid: str) -> list[dict]:
    with connection() as conn:
        rows = conn.execute(
            """SELECT m.*, v.version_number,
                      (SELECT COUNT(*) FROM manuscript_versions mv WHERE mv.manuscript_id = m.id) AS version_count
               FROM manuscripts m
               LEFT JOIN manuscript_versions v ON v.id = m.current_version_id
               WHERE m.owner_uid = ?
               ORDER BY m.updated_at DESC""",
            (owner_uid,),
        ).fetchall()
    return [
        {
            "id": row["id"], "title": row["title"], "current_version_id": row["current_version_id"],
            "current_version_number": row["version_number"], "version_count": row["version_count"],
            "created_at": row["created_at"], "updated_at": row["updated_at"],
        }
        for row in rows
    ]


def _version_row(row: sqlite3.Row, include_content: bool = True) -> dict:
    value = {
        "id": row["id"], "manuscript_id": row["manuscript_id"],
        "mechanics_id": row["mechanics_id"],
        "version_number": row["version_number"], "source_filename": row["source_filename"],
        "file_type": row["file_type"], "created_at": row["created_at"],
    }
    if include_content:
        value["text"] = row["extracted_text"]
        value["parsed_data"] = _loads(row["parsed_data_json"])
    return value


def get_version(owner_uid: str, manuscript_id: str, version_id: str) -> dict | None:
    with connection() as conn:
        row = conn.execute(
            """SELECT v.* FROM manuscript_versions v
               JOIN manuscripts m ON m.id = v.manuscript_id
               WHERE v.id = ? AND v.manuscript_id = ? AND m.owner_uid = ?""",
            (version_id, manuscript_id, owner_uid),
        ).fetchone()
    return _version_row(row) if row else None


def list_versions(owner_uid: str, manuscript_id: str, history: bool) -> tuple[list[dict] | None, str | None]:
    with connection() as conn:
        manuscript = conn.execute(
            "SELECT current_version_id FROM manuscripts WHERE id = ? AND owner_uid = ?",
            (manuscript_id, owner_uid),
        ).fetchone()
        if not manuscript:
            return None, None
        if history:
            rows = conn.execute(
                "SELECT * FROM manuscript_versions WHERE manuscript_id = ? ORDER BY version_number DESC",
                (manuscript_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM manuscript_versions WHERE id = ?", (manuscript["current_version_id"],)
            ).fetchall()
    return [_version_row(row, include_content=False) for row in rows], manuscript["current_version_id"]


def is_current_version(owner_uid: str, manuscript_id: str, version_id: str) -> bool | None:
    with connection() as conn:
        row = conn.execute(
            "SELECT current_version_id FROM manuscripts WHERE id = ? AND owner_uid = ?",
            (manuscript_id, owner_uid),
        ).fetchone()
    return None if not row else row["current_version_id"] == version_id


def _normalized_subscription(current: object, now: datetime) -> dict:
    now_text = _iso(now)
    start, end = _month_bounds(now)
    if not isinstance(current, dict):
        return {
            "owner_uid": "",
            "tier": "free",
            "status": "none",
            "billing_period": None,
            "payment_method": None,
            "scans_used": 0,
            "period_start": start,
            "period_end": end,
            "renews_at": None,
            "canceled_at": None,
            "pending_checkout": None,
            "history": [],
            "created_at": now_text,
            "updated_at": now_text,
        }
    value = copy.deepcopy(current)
    value.setdefault("status", "active" if value.get("tier") == "premium" else "none")
    value.setdefault("billing_period", None)
    value.setdefault("payment_method", None)
    value.setdefault("renews_at", None)
    value.setdefault("canceled_at", None)
    value.setdefault("pending_checkout", None)
    value.setdefault("history", [])
    value.setdefault("scans_used", 0)
    # Canceled premium lapses at renews_at / period_end.
    renews = value.get("renews_at") or value.get("period_end") or ""
    if (
        value.get("tier") == "premium"
        and value.get("status") == "canceled"
        and renews
        and now_text >= renews
    ):
        value.update(
            {
                "tier": "free",
                "status": "none",
                "billing_period": None,
                "payment_method": None,
                "renews_at": None,
                "scans_used": 0,
                "period_start": start,
                "period_end": end,
                "updated_at": now_text,
            }
        )
    elif now_text >= str(value.get("period_end") or ""):
        value.update(
            {
                "scans_used": 0,
                "period_start": start,
                "period_end": end,
                "updated_at": now_text,
            }
        )
        if value.get("tier") == "premium" and value.get("status") == "active":
            value["renews_at"] = _renewal_date(now, value.get("billing_period") or "monthly")
    return value


def _renewal_date(now: datetime, billing_period: str) -> str:
    if billing_period == "annual":
        return _iso(now.replace(year=now.year + 1))
    year, month = now.year, now.month + 1
    if month > 12:
        year, month = year + 1, 1
    day = min(now.day, 28)
    try:
        return _iso(
            now.replace(year=year, month=month, day=day, hour=0, minute=0, second=0, microsecond=0)
        )
    except ValueError:
        return _iso(
            now.replace(year=year, month=month, day=1, hour=0, minute=0, second=0, microsecond=0)
        )


def _append_history(row: dict, entry: dict, limit: int = 50) -> None:
    history = list(row.get("history") or [])
    history.insert(0, entry)
    row["history"] = history[:limit]


def subscription_snapshot(owner_uid: str) -> dict:
    now = _now()
    ref = _reference(f"{ROOT}/subscriptions/{owner_uid}")

    def normalize(current):
        value = _normalized_subscription(current, now)
        value["owner_uid"] = owner_uid
        return value

    row = ref.transaction(normalize)
    limit = settings.premium_scan_limit if row["tier"] == "premium" else settings.free_scan_limit
    used = int(row.get("scans_used", 0) or 0)
    status = row.get("status") or ("active" if row["tier"] == "premium" else "none")
    return {
        "tier": row["tier"],
        "status": status,
        "billing_period": row.get("billing_period"),
        "payment_method": row.get("payment_method"),
        "limit": limit,
        "used": used,
        "remaining": max(limit - used, 0),
        "reset_at": row.get("period_end"),
        "renews_at": row.get("renews_at"),
        "canceled_at": row.get("canceled_at"),
        "pending_checkout": row.get("pending_checkout"),
        "history": list(row.get("history") or [])[:20],
    }


def set_subscription_plan(
    owner_uid: str,
    *,
    tier: str,
    billing_period: str | None = None,
    payment_method: str | None = None,
    amount: float | None = None,
) -> dict:
    """Subscribe, change plan, or switch back to free (immediate). Prefer webhook for premium."""
    tier = (tier or "free").strip().lower()
    if tier not in {"free", "premium"}:
        raise ValueError("Plan must be free or premium.")
    if tier == "premium":
        billing_period = (billing_period or "monthly").strip().lower()
        if billing_period not in {"monthly", "annual"}:
            raise ValueError("Billing period must be monthly or annual.")
        payment_method = (payment_method or "paymongo").strip().lower()
    else:
        billing_period = None
        payment_method = None

    now = _now()
    now_text = _iso(now)
    start, end = _month_bounds(now)
    ref = _reference(f"{ROOT}/subscriptions/{owner_uid}")

    def apply(current):
        row = _normalized_subscription(current, now)
        row["owner_uid"] = owner_uid
        previous_tier = row.get("tier") or "free"
        if tier == "premium":
            action = "changed" if previous_tier == "premium" else "subscribed"
            row.update(
                {
                    "tier": "premium",
                    "status": "active",
                    "billing_period": billing_period,
                    "payment_method": payment_method,
                    "renews_at": _renewal_date(now, billing_period),
                    "canceled_at": None,
                    "pending_checkout": None,
                    "period_start": row.get("period_start") or start,
                    "period_end": row.get("period_end") or end,
                    "updated_at": now_text,
                }
            )
            if not row.get("created_at"):
                row["created_at"] = now_text
            _append_history(
                row,
                {
                    "id": str(uuid.uuid4()),
                    "action": action,
                    "plan": "premium",
                    "billing_period": billing_period,
                    "payment_method": payment_method,
                    "amount": amount,
                    "at": now_text,
                },
            )
        else:
            row.update(
                {
                    "tier": "free",
                    "status": "none",
                    "billing_period": None,
                    "payment_method": None,
                    "renews_at": None,
                    "pending_checkout": None,
                    "canceled_at": now_text if previous_tier == "premium" else row.get("canceled_at"),
                    "updated_at": now_text,
                }
            )
            if previous_tier == "premium":
                _append_history(
                    row,
                    {
                        "id": str(uuid.uuid4()),
                        "action": "canceled",
                        "plan": "free",
                        "billing_period": None,
                        "payment_method": None,
                        "amount": 0,
                        "at": now_text,
                    },
                )
        return row

    ref.transaction(apply)
    return subscription_snapshot(owner_uid)


def cancel_subscription(owner_uid: str, *, immediate: bool = True) -> dict:
    """Cancel Premium. immediate=True downgrades now; otherwise keep access until renews_at."""
    now = _now()
    now_text = _iso(now)
    ref = _reference(f"{ROOT}/subscriptions/{owner_uid}")

    def apply(current):
        row = _normalized_subscription(current, now)
        row["owner_uid"] = owner_uid
        if row.get("tier") != "premium":
            return row
        row["canceled_at"] = now_text
        row["updated_at"] = now_text
        row["pending_checkout"] = None
        _append_history(
            row,
            {
                "id": str(uuid.uuid4()),
                "action": "canceled",
                "plan": "premium" if not immediate else "free",
                "billing_period": row.get("billing_period"),
                "payment_method": row.get("payment_method"),
                "amount": 0,
                "at": now_text,
            },
        )
        if immediate:
            row.update(
                {
                    "tier": "free",
                    "status": "none",
                    "billing_period": None,
                    "payment_method": None,
                    "renews_at": None,
                }
            )
        else:
            row["status"] = "canceled"
        return row

    ref.transaction(apply)
    return subscription_snapshot(owner_uid)


def store_pending_checkout(
    owner_uid: str,
    *,
    checkout_session_id: str,
    billing_period: str,
    amount: float,
    checkout_url: str,
) -> None:
    """Remember an unpaid PayMongo checkout so the webhook can activate Premium."""
    now = _now()
    now_text = _iso(now)
    pending = {
        "checkout_session_id": checkout_session_id,
        "owner_uid": owner_uid,
        "billing_period": billing_period,
        "amount": amount,
        "checkout_url": checkout_url,
        "status": "pending",
        "created_at": now_text,
    }
    _reference(f"{ROOT}/checkout_sessions/{checkout_session_id}").set(pending)

    ref = _reference(f"{ROOT}/subscriptions/{owner_uid}")

    def apply(current):
        row = _normalized_subscription(current, now)
        row["owner_uid"] = owner_uid
        row["pending_checkout"] = pending
        row["updated_at"] = now_text
        if not row.get("created_at"):
            row["created_at"] = now_text
        return row

    ref.transaction(apply)


def get_pending_checkout(checkout_session_id: str) -> dict | None:
    item = _reference(f"{ROOT}/checkout_sessions/{checkout_session_id}").get()
    return item if isinstance(item, dict) else None


def activate_premium_from_payment(
    owner_uid: str,
    *,
    billing_period: str,
    payment_method: str | None = None,
    amount: float | None = None,
    checkout_session_id: str | None = None,
    payment_id: str | None = None,
) -> dict:
    """Activate or renew Premium after PayMongo confirms payment (webhook)."""
    billing_period = (billing_period or "monthly").strip().lower()
    if billing_period not in {"monthly", "annual"}:
        raise ValueError("Billing period must be monthly or annual.")
    method = (payment_method or "paymongo").strip().lower() or "paymongo"

    now = _now()
    now_text = _iso(now)
    start, end = _month_bounds(now)
    ref = _reference(f"{ROOT}/subscriptions/{owner_uid}")

    def apply(current):
        row = _normalized_subscription(current, now)
        row["owner_uid"] = owner_uid
        previous_tier = row.get("tier") or "free"
        # Idempotent: same checkout already applied.
        history = list(row.get("history") or [])
        if checkout_session_id and any(
            isinstance(entry, dict) and entry.get("checkout_session_id") == checkout_session_id
            for entry in history
        ):
            return row

        action = "changed" if previous_tier == "premium" else "subscribed"
        if previous_tier == "premium" and row.get("status") == "active":
            action = "renewed"
        row.update(
            {
                "tier": "premium",
                "status": "active",
                "billing_period": billing_period,
                "payment_method": method,
                "renews_at": _renewal_date(now, billing_period),
                "canceled_at": None,
                "pending_checkout": None,
                "period_start": row.get("period_start") or start,
                "period_end": row.get("period_end") or end,
                "updated_at": now_text,
                "last_checkout_session_id": checkout_session_id,
                "last_payment_id": payment_id,
            }
        )
        if not row.get("created_at"):
            row["created_at"] = now_text
        _append_history(
            row,
            {
                "id": str(uuid.uuid4()),
                "action": action,
                "plan": "premium",
                "billing_period": billing_period,
                "payment_method": method,
                "amount": amount,
                "checkout_session_id": checkout_session_id,
                "payment_id": payment_id,
                "at": now_text,
            },
        )
        return row

    ref.transaction(apply)
    if checkout_session_id:
        _reference(f"{ROOT}/checkout_sessions/{checkout_session_id}").update(
            {"status": "paid", "paid_at": now_text, "payment_id": payment_id}
        )
    return subscription_snapshot(owner_uid)


def _increment_scans_used(owner_uid: str) -> dict:
    now = _now()
    now_text = _iso(now)
    ref = _reference(f"{ROOT}/subscriptions/{owner_uid}")

    def apply(current):
        row = _normalized_subscription(current, now)
        row["owner_uid"] = owner_uid
        row["scans_used"] = int(row.get("scans_used", 0) or 0) + 1
        row["updated_at"] = now_text
        if not row.get("created_at"):
            row["created_at"] = now_text
        return row

    return ref.transaction(apply)


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
    if sub["used"] >= sub["limit"]:
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
    # Enforce limits against RTDB subscription before writing the scan row.
    sub = check_scan_eligibility(owner_uid, manuscript_id, version_id)
    scan_id, created = str(uuid.uuid4()), _iso(_now())
    with _write_lock, connection() as conn:
        conn.execute("BEGIN IMMEDIATE")
        current = conn.execute(
            "SELECT current_version_id FROM manuscripts WHERE id = ? AND owner_uid = ?",
            (manuscript_id, owner_uid),
        ).fetchone()
        version = conn.execute(
            """SELECT 1 FROM manuscript_versions
               WHERE id = ? AND manuscript_id = ?""",
            (version_id, manuscript_id),
        ).fetchone()
        mechanics = conn.execute(
            "SELECT 1 FROM mechanics WHERE id = ? AND owner_uid = ?", (mechanics_id, owner_uid)
        ).fetchone()
        if not current or not version or not mechanics:
            conn.rollback()
            raise LookupError("Requested scan input was not found.")
        conn.execute(
            """INSERT INTO compliance_scans
               (id, owner_uid, manuscript_version_id, mechanics_id, overall_score, issues_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (scan_id, owner_uid, version_id, mechanics_id, overall_score, json.dumps(issues), created),
        )
        for section in sections:
            conn.execute(
                """INSERT INTO section_formatting_checks
                   (scan_id, section_name, formatting_score, issue_count, issues_json)
                   VALUES (?, ?, ?, ?, ?)""",
                (
                    scan_id,
                    section["section"],
                    section["formatting_score"],
                    section["issue_count"],
                    json.dumps(section.get("issues", [])),
                ),
            )
        conn.commit()
    try:
        _increment_scans_used(owner_uid)
    except Exception:
        # Scan already persisted; leave usage bump to next successful write path.
        pass
    del sub
    return get_scan(owner_uid, scan_id)


def get_scan(owner_uid: str, scan_id: str) -> dict | None:
    with connection() as conn:
        row = conn.execute(
            "SELECT * FROM compliance_scans WHERE id = ? AND owner_uid = ?", (scan_id, owner_uid)
        ).fetchone()
        if not row:
            return None
        section_rows = conn.execute(
            """SELECT section_name, formatting_score, issue_count, issues_json
               FROM section_formatting_checks WHERE scan_id = ? ORDER BY id""",
            (scan_id,),
        ).fetchall()
    return {
        "id": row["id"], "manuscript_version_id": row["manuscript_version_id"],
        "mechanics_id": row["mechanics_id"], "overall_score": round(float(row["overall_score"]), 2),
        "issues": _loads(row["issues_json"]),
        "sections": [
            {
                "section": item["section_name"],
                "formatting_score": round(float(item["formatting_score"]), 2),
                "issue_count": item["issue_count"],
                "issues": _loads(item["issues_json"]),
            }
            for item in section_rows
        ],
        "created_at": row["created_at"],
    }
