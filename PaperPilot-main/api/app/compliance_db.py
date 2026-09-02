from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from app.config import settings

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "paperpilot.db"
_write_lock = threading.RLock()


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
    clean_name = name.strip()
    with _write_lock, connection() as conn:
        row = conn.execute(
            "SELECT * FROM mechanics WHERE id = ? AND owner_uid = ?",
            (mechanics_id, owner_uid),
        ).fetchone()
        if not row:
            return None
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
        try:
            conn.execute(
                """UPDATE mechanics SET name = ?, source_filename = ?
                   WHERE id = ? AND owner_uid = ?""",
                (clean_name, renamed_filename, mechanics_id, owner_uid),
            )
        except sqlite3.IntegrityError as exc:
            raise MechanicsNameConflict(
                "A mechanics document with this name already exists."
            ) from exc
        conn.commit()
        updated = conn.execute("SELECT * FROM mechanics WHERE id = ?", (mechanics_id,)).fetchone()
    return _mechanics_row(updated)


def delete_mechanics(owner_uid: str, mechanics_id: str) -> bool:
    with _write_lock, connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM mechanics WHERE id = ? AND owner_uid = ?",
            (mechanics_id, owner_uid),
        ).fetchone()
        if not row:
            return False
        in_use = conn.execute(
            """SELECT 1 FROM manuscript_versions v
               JOIN manuscripts m ON m.id = v.manuscript_id
               WHERE v.mechanics_id = ? AND m.owner_uid = ?
               LIMIT 1""",
            (mechanics_id, owner_uid),
        ).fetchone()
        if in_use:
            raise MechanicsInUse(
                "This mechanics document is used by a manuscript version and cannot be deleted."
            )
        conn.execute(
            "DELETE FROM mechanics WHERE id = ? AND owner_uid = ?",
            (mechanics_id, owner_uid),
        )
        conn.commit()
    return True


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


def _subscription(conn: sqlite3.Connection, owner_uid: str) -> sqlite3.Row:
    now, now_text = _now(), _iso(_now())
    start, end = _month_bounds(now)
    conn.execute(
        """INSERT OR IGNORE INTO subscriptions
           (owner_uid, tier, scans_used, period_start, period_end, created_at, updated_at)
           VALUES (?, 'free', 0, ?, ?, ?, ?)""",
        (owner_uid, start, end, now_text, now_text),
    )
    row = conn.execute("SELECT * FROM subscriptions WHERE owner_uid = ?", (owner_uid,)).fetchone()
    if now_text >= row["period_end"]:
        conn.execute(
            """UPDATE subscriptions SET scans_used = 0, period_start = ?, period_end = ?, updated_at = ?
               WHERE owner_uid = ?""",
            (start, end, now_text, owner_uid),
        )
        row = conn.execute("SELECT * FROM subscriptions WHERE owner_uid = ?", (owner_uid,)).fetchone()
    return row


def subscription_snapshot(owner_uid: str) -> dict:
    with _write_lock, connection() as conn:
        row = _subscription(conn, owner_uid)
        conn.commit()
    limit = settings.premium_scan_limit if row["tier"] == "premium" else settings.free_scan_limit
    used = row["scans_used"]
    return {
        "tier": row["tier"], "limit": limit, "used": used,
        "remaining": max(limit - used, 0), "reset_at": row["period_end"],
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
    scan_id, created = str(uuid.uuid4()), _iso(_now())
    with _write_lock, connection() as conn:
        conn.execute("BEGIN IMMEDIATE")
        sub = _subscription(conn, owner_uid)
        limit = settings.premium_scan_limit if sub["tier"] == "premium" else settings.free_scan_limit
        current = conn.execute(
            "SELECT current_version_id FROM manuscripts WHERE id = ? AND owner_uid = ?",
            (manuscript_id, owner_uid),
        ).fetchone()
        version = conn.execute(
            """SELECT 1 FROM manuscript_versions
               WHERE id = ? AND manuscript_id = ?""", (version_id, manuscript_id)
        ).fetchone()
        mechanics = conn.execute(
            "SELECT 1 FROM mechanics WHERE id = ? AND owner_uid = ?", (mechanics_id, owner_uid)
        ).fetchone()
        if not current or not version or not mechanics:
            conn.rollback()
            raise LookupError("Requested scan input was not found.")
        if (sub["tier"] != "premium" and current["current_version_id"] != version_id) or sub["scans_used"] >= limit:
            conn.rollback()
            raise UpgradeRequired(sub["tier"], limit, sub["scans_used"])
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
                    scan_id, section["section"], section["formatting_score"],
                    section["issue_count"], json.dumps(section.get("issues", [])),
                ),
            )
        conn.execute(
            "UPDATE subscriptions SET scans_used = scans_used + 1, updated_at = ? WHERE owner_uid = ?",
            (created, owner_uid),
        )
        conn.commit()
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
