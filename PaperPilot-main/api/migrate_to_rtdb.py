"""One-shot, idempotent import from PaperPilot's legacy SQLite databases.

Run from the api directory:
    python migrate_to_rtdb.py
"""

from __future__ import annotations

import json
import sqlite3
from collections import defaultdict
from pathlib import Path

from app.compliance_db import ROOT as APP_ROOT, _name_key
from app.firebase_admin_app import firebase_admin_app
from app.otp import ROOT as AUTH_ROOT, _email_key, _token_key

DATA_DIR = Path(__file__).resolve().parent / "data"


def _reference(path: str):
    if not firebase_admin_app():
        raise RuntimeError("Firebase Admin could not be initialized.")
    from firebase_admin import db

    return db.reference(path)


def _rows(conn: sqlite3.Connection, table: str) -> list[dict]:
    exists = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)
    ).fetchone()
    if not exists:
        return []
    return [dict(row) for row in conn.execute(f'SELECT * FROM "{table}"').fetchall()]


def _put_if_absent(path: str, value: object) -> bool:
    inserted = False

    def create(current):
        nonlocal inserted
        inserted = current is None
        return value if current is None else current

    _reference(path).transaction(create)
    return inserted


def _json(value: object, fallback: object) -> object:
    if not isinstance(value, str):
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def migrate_compliance(path: Path) -> dict[str, int]:
    counts: defaultdict[str, int] = defaultdict(int)
    if not path.is_file():
        return counts
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        mechanics = _rows(conn, "mechanics")
        manuscripts = _rows(conn, "manuscripts")
        versions = _rows(conn, "manuscript_versions")
        scans = _rows(conn, "compliance_scans")
        checks = _rows(conn, "section_formatting_checks")
        subscriptions = _rows(conn, "subscriptions")
    finally:
        conn.close()

    owner_by_manuscript = {row["id"]: row["owner_uid"] for row in manuscripts}
    owner_by_scan = {row["id"]: row["owner_uid"] for row in scans}
    version_counts: defaultdict[str, int] = defaultdict(int)
    for row in versions:
        version_counts[row["manuscript_id"]] = max(
            version_counts[row["manuscript_id"]], int(row["version_number"])
        )

    for row in mechanics:
        uid = row["owner_uid"]
        item = {
            "id": row["id"],
            "owner_uid": uid,
            "name": row["name"],
            "source_filename": row["source_filename"],
            "file_type": row["file_type"],
            "extracted_text": row["extracted_text"],
            "parsed_data": _json(row["parsed_data_json"], {}),
            "rules": _json(row["rules_json"], {}),
            "created_at": row["created_at"],
        }
        counts["mechanics"] += int(
            _put_if_absent(f"{APP_ROOT}/mechanics/{uid}/{row['id']}", item)
        )
        _put_if_absent(
            f"{APP_ROOT}/mechanics_names/{uid}/{_name_key(row['name'])}", row["id"]
        )

    for row in manuscripts:
        uid = row["owner_uid"]
        item = {
            **row,
            "version_counter": version_counts[row["id"]],
        }
        counts["manuscripts"] += int(
            _put_if_absent(f"{APP_ROOT}/manuscripts/{uid}/{row['id']}", item)
        )

    for row in versions:
        uid = owner_by_manuscript.get(row["manuscript_id"])
        if not uid:
            continue
        item = {
            "id": row["id"],
            "manuscript_id": row["manuscript_id"],
            "mechanics_id": row["mechanics_id"],
            "version_number": row["version_number"],
            "source_filename": row["source_filename"],
            "file_type": row["file_type"],
            "extracted_text": row["extracted_text"],
            "parsed_data": _json(row["parsed_data_json"], {}),
            "created_at": row["created_at"],
        }
        counts["versions"] += int(
            _put_if_absent(
                f"{APP_ROOT}/manuscript_versions/{uid}/{row['manuscript_id']}/{row['id']}",
                item,
            )
        )

    for row in scans:
        uid = row["owner_uid"]
        item = {
            "id": row["id"],
            "owner_uid": uid,
            "manuscript_version_id": row["manuscript_version_id"],
            "mechanics_id": row["mechanics_id"],
            "overall_score": float(row["overall_score"]),
            "issues": _json(row["issues_json"], []),
            "created_at": row["created_at"],
        }
        counts["scans"] += int(
            _put_if_absent(f"{APP_ROOT}/compliance_scans/{uid}/{row['id']}", item)
        )

    for row in checks:
        uid = owner_by_scan.get(row["scan_id"])
        if not uid:
            continue
        item = {
            "id": str(row["id"]),
            "section_name": row["section_name"],
            "formatting_score": float(row["formatting_score"]),
            "issue_count": row["issue_count"],
            "issues": _json(row["issues_json"], []),
        }
        counts["section_checks"] += int(
            _put_if_absent(
                f"{APP_ROOT}/section_formatting_checks/{uid}/{row['scan_id']}/{row['id']}",
                item,
            )
        )

    for row in subscriptions:
        uid = row["owner_uid"]
        counts["subscriptions"] += int(
            _put_if_absent(f"{APP_ROOT}/subscriptions/{uid}", row)
        )
    return counts


def migrate_otp(path: Path) -> dict[str, int]:
    counts: defaultdict[str, int] = defaultdict(int)
    if not path.is_file():
        return counts
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        otps = _rows(conn, "otps")
        challenges = _rows(conn, "challenges")
        sends = _rows(conn, "otp_sends")
    finally:
        conn.close()

    secret_path = DATA_DIR / "otp_secret"
    if secret_path.is_file():
        secret = secret_path.read_text(encoding="utf-8").strip()
        if secret:
            _put_if_absent(f"{AUTH_ROOT}/config/otp_secret", secret)

    for row in otps:
        email_key = _email_key(row["email"])
        item = {
            "code_hash": row["code_hash"],
            "expires_at": row["expires_at"],
            "attempts": row["attempts"],
            "created_at": row["created_at"],
        }
        counts["otps"] += int(
            _put_if_absent(f"{AUTH_ROOT}/otps/{email_key}/{row['purpose']}", item)
        )

    for row in challenges:
        email_key, token_hash = _email_key(row["email"]), _token_key(row["token"])
        item = {
            "email_key": email_key,
            "purpose": row["purpose"],
            "expires_at": row["expires_at"],
            "created_at": row.get("created_at", row["expires_at"]),
        }
        counts["challenges"] += int(
            _put_if_absent(f"{AUTH_ROOT}/challenges/{token_hash}", item)
        )
        _put_if_absent(
            f"{AUTH_ROOT}/challenge_index/{email_key}/{row['purpose']}/{token_hash}", True
        )

    grouped: defaultdict[tuple[str, str], list[float]] = defaultdict(list)
    for row in sends:
        grouped[(_email_key(row["email"]), row["purpose"])].append(row["created_at"])
    for (email_key, purpose), timestamps in grouped.items():
        if _put_if_absent(
            f"{AUTH_ROOT}/send_rates/{email_key}/{purpose}",
            {"sends": sorted(timestamps, reverse=True)},
        ):
            counts["send_rate_groups"] += 1
    return counts


def main() -> None:
    compliance = migrate_compliance(DATA_DIR / "paperpilot.db")
    otp = migrate_otp(DATA_DIR / "otp.db")
    print("Compliance records imported:", sum(compliance.values()))
    print("Authentication records imported:", sum(otp.values()))


if __name__ == "__main__":
    main()
