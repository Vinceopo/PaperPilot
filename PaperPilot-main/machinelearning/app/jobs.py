from __future__ import annotations

import base64
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.compliance import run_compliance_scan
from app.config import settings
from app.documents import DocumentError, normalize_mechanics_rules, parse_document, validate_document
from app.schemas import JobStage


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


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, JobRecord] = {}
        self._lock = threading.Lock()

    def create(self, job_id: str | None = None) -> JobRecord:
        record = JobRecord(job_id=job_id or str(uuid.uuid4()))
        with self._lock:
            self._jobs[record.job_id] = record
        return record

    def get(self, job_id: str) -> JobRecord | None:
        with self._lock:
            record = self._jobs.get(job_id)
        if record and time.time() - record.created_at > settings.job_ttl_seconds:
            with self._lock:
                self._jobs.pop(job_id, None)
            return None
        return record

    def _update(self, job_id: str, **kwargs) -> None:
        with self._lock:
            record = self._jobs.get(job_id)
            if not record:
                return
            for key, value in kwargs.items():
                setattr(record, key, value)
            record.updated_at = time.time()

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
        job_store.set_stage(job_id, JobStage.parsing, 10, "Downloading and parsing document")
        raw = _load_document_bytes(document_url, document_base64)
        file_type = validate_document(filename, raw, settings.max_document_bytes)
        parsed = parse_document(raw, file_type)

        job_store.set_stage(job_id, JobStage.checking, 45, "Running format compliance checks")
        rules = normalize_mechanics_rules(mechanics_rules)
        scan = run_compliance_scan(parsed, rules, tier=tier)

        job_store.set_stage(job_id, JobStage.scoring, 85, "Computing scores and summaries")
        scan["document_format"] = file_type
        job_store.complete(job_id, scan)
    except DocumentError as exc:
        job_store.fail(job_id, str(exc))
    except Exception as exc:
        job_store.fail(job_id, f"Analysis failed: {exc}")


def start_analyze_job(**kwargs) -> JobRecord:
    record = job_store.create(kwargs.pop("job_id", None))
    thread = threading.Thread(
        target=run_analyze_job,
        kwargs={"job_id": record.job_id, **kwargs},
        daemon=True,
    )
    thread.start()
    return record
