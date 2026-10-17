from __future__ import annotations

import base64
import json
import logging
import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

from app.compliance import run_compliance_scan
from app.config import settings
from app.documents import DocumentError, normalize_mechanics_rules, parse_document, validate_document
from app.schemas import JobStage

logger = logging.getLogger("paperpilot.ml.jobs")


@dataclass
class JobRecord:
    job_id: str
    stage: JobStage = JobStage.queued
    percent: int = 0
    message: str = "Queued"
    status: str = "running"
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    result: dict[str, Any] | None = None
    error: str | None = None

    def to_public(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "stage": self.stage.value if isinstance(self.stage, JobStage) else self.stage,
            "percent": self.percent,
            "message": self.message,
            "status": self.status,
            "error": self.error,
            "result": self.result,
        }


def _job_dir() -> Path:
    path = Path(settings.job_store_dir or os.environ.get("JOB_STORE_DIR") or "/tmp/paperpilot-jobs")
    path.mkdir(parents=True, exist_ok=True)
    return path


class JobStore:
    """Thread-safe job registry with disk snapshots so concurrent users do not lose jobs
    when the process is busy, and progress survives brief restarts on the same instance.
    """

    def __init__(self) -> None:
        self._jobs: dict[str, JobRecord] = {}
        self._lock = threading.Lock()

    def _path(self, job_id: str) -> Path:
        safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in job_id)[:120]
        return _job_dir() / f"{safe}.json"

    def _persist(self, record: JobRecord) -> None:
        payload = {
            "job_id": record.job_id,
            "stage": record.stage.value if isinstance(record.stage, JobStage) else str(record.stage),
            "percent": record.percent,
            "message": record.message,
            "status": record.status,
            "created_at": record.created_at,
            "updated_at": record.updated_at,
            "error": record.error,
            # Results can be large; keep them so a restarted worker can still return done jobs.
            "result": record.result,
        }
        try:
            tmp = self._path(record.job_id).with_suffix(".tmp")
            tmp.write_text(json.dumps(payload, default=str), encoding="utf-8")
            tmp.replace(self._path(record.job_id))
        except OSError as exc:
            logger.warning("Could not persist job %s: %s", record.job_id, exc)

    def _load_disk(self, job_id: str) -> JobRecord | None:
        path = self._path(job_id)
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        stage_raw = data.get("stage") or "queued"
        try:
            stage = JobStage(stage_raw)
        except ValueError:
            stage = JobStage.queued
        record = JobRecord(
            job_id=str(data.get("job_id") or job_id),
            stage=stage,
            percent=int(data.get("percent") or 0),
            message=str(data.get("message") or ""),
            status=str(data.get("status") or "running"),
            created_at=float(data.get("created_at") or time.time()),
            updated_at=float(data.get("updated_at") or time.time()),
            result=data.get("result") if isinstance(data.get("result"), dict) else None,
            error=data.get("error"),
        )
        if time.time() - record.created_at > settings.job_ttl_seconds:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass
            return None
        return record

    def create(self, job_id: str | None = None) -> tuple[JobRecord, bool]:
        """Create a job. Returns (record, created). Reuses an in-flight job_id."""
        if job_id:
            existing = self.get(job_id)
            if existing and existing.status == "running":
                return existing, False
        record = JobRecord(job_id=job_id or str(uuid.uuid4()))
        with self._lock:
            prior = self._jobs.get(record.job_id)
            if prior and prior.status == "running":
                return prior, False
            self._jobs[record.job_id] = record
            self._persist(record)
        return record, True

    def get(self, job_id: str) -> JobRecord | None:
        with self._lock:
            record = self._jobs.get(job_id)
            if record and time.time() - record.created_at > settings.job_ttl_seconds:
                self._jobs.pop(job_id, None)
                try:
                    self._path(job_id).unlink(missing_ok=True)
                except OSError:
                    pass
                return None
            if record:
                return record
        disk = self._load_disk(job_id)
        if disk:
            with self._lock:
                self._jobs[job_id] = disk
        return disk

    def _update(self, job_id: str, **kwargs) -> None:
        with self._lock:
            record = self._jobs.get(job_id)
            if not record:
                disk = self._load_disk(job_id)
                if not disk:
                    return
                self._jobs[job_id] = disk
                record = disk
            for key, value in kwargs.items():
                setattr(record, key, value)
            record.updated_at = time.time()
            self._persist(record)

    def set_stage(self, job_id: str, stage: JobStage, percent: int, message: str) -> None:
        self._update(job_id, stage=stage, percent=percent, message=message)

    def complete(self, job_id: str, result: dict[str, Any]) -> None:
        self._update(
            job_id,
            stage=JobStage.done,
            percent=100,
            message="Analysis complete",
            status="done",
            result=result,
        )

    def fail(self, job_id: str, error: str) -> None:
        self._update(
            job_id,
            stage=JobStage.failed,
            percent=100,
            message=error,
            status="failed",
            error=error,
        )


job_store = JobStore()


def _load_document_bytes(document_url: str | None, document_base64: str | None) -> bytes:
    if document_base64:
        try:
            return base64.b64decode(document_base64, validate=True)
        except Exception as exc:
            raise DocumentError("document_base64 is not valid base64.") from exc
    if not document_url:
        raise DocumentError("No document bytes were provided.")
    try:
        with httpx.Client(timeout=120.0, follow_redirects=True) as client:
            response = client.get(document_url)
            response.raise_for_status()
            return response.content
    except DocumentError:
        raise
    except Exception as exc:
        raise DocumentError("The document URL could not be downloaded.") from exc


def run_analyze_job(
    job_id: str,
    *,
    document_url: str | None,
    document_base64: str | None,
    filename: str,
    mechanics_rules: dict,
    tier: str,
) -> None:
    try:
        # Every concurrent user gets the same progress path — no slot queue.
        job_store.set_stage(job_id, JobStage.parsing, 4, "Downloading document")
        raw = _load_document_bytes(document_url, document_base64)
        job_store.set_stage(job_id, JobStage.parsing, 12, "Checking the file")
        file_type = validate_document(filename, raw, settings.max_document_bytes)

        def on_page(done: int, total: int) -> None:
            span = 28
            percent = 16 + int(span * done / max(total, 1))
            noun = "page" if total == 1 else "pages"
            job_store.set_stage(job_id, JobStage.parsing, percent, f"Parsing {done} of {total} {noun}")

        parsed = parse_document(raw, file_type, on_progress=on_page)

        rules = normalize_mechanics_rules(mechanics_rules)

        def on_check(done: int, total: int, label: str) -> None:
            percent = 48 + int(36 * done / max(total, 1))
            job_store.set_stage(job_id, JobStage.checking, min(percent, 84), label)

        feature_tier = "premium" if str(tier or "").lower() in ("premium", "pro") else "free"
        scan = run_compliance_scan(parsed, rules, tier=feature_tier, on_progress=on_check)

        job_store.set_stage(job_id, JobStage.scoring, 92, "Computing scores and summaries")
        scan["document_format"] = file_type
        job_store.complete(job_id, scan)
    except DocumentError as exc:
        job_store.fail(job_id, str(exc))
    except Exception as exc:
        job_store.fail(job_id, f"Analysis failed: {exc}")


def start_analyze_job(**kwargs) -> JobRecord:
    requested_id = kwargs.pop("job_id", None)
    record, created = job_store.create(requested_id)
    if not created:
        # Idempotent: concurrent clients / gateway requeue reuse the same job_id.
        return record
    thread = threading.Thread(
        target=run_analyze_job,
        kwargs={"job_id": record.job_id, **kwargs},
        daemon=True,
        name=f"analyze-{record.job_id[:8]}",
    )
    thread.start()
    return record
