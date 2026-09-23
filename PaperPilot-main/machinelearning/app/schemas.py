from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class JobStage(str, Enum):
    queued = "queued"
    parsing = "parsing"
    checking = "checking"
    scoring = "scoring"
    done = "done"
    failed = "failed"


class MechanicsPayload(BaseModel):
    rules: dict[str, Any] = Field(default_factory=dict)


class AnalyzeCreateRequest(BaseModel):
    job_id: str | None = None
    document_url: str | None = None
    document_base64: str | None = Field(default=None, description="Base64-encoded PDF or DOCX bytes")
    filename: str = "document.pdf"
    mechanics: MechanicsPayload
    tier: Literal["free", "premium"] = "free"

    @model_validator(mode="after")
    def require_document_source(self):
        if not self.document_url and not self.document_base64:
            raise ValueError("Provide document_url or document_base64.")
        return self


class AnalyzeCreateResponse(BaseModel):
    job_id: str
    status: Literal["queued"] = "queued"


class JobProgressResponse(BaseModel):
    job_id: str
    stage: JobStage
    percent: int = Field(ge=0, le=100)
    message: str
    status: Literal["running", "done", "failed"]


class CategoryWrongPct(BaseModel):
    category: str
    wrong_pct: float
    failed_units: int = 0


class SeverityPct(BaseModel):
    critical: float = 0.0
    moderate: float = 0.0
    minor: float = 0.0


class IssueLocation(BaseModel):
    page: int
    line: int
    section: str | None = None
    bbox: list[float] | None = None
    page_index: int | None = None
    line_index: int | None = None


class ScanIssue(BaseModel):
    issue_type: str
    severity: Literal["critical", "moderate", "minor"]
    title: str | None = None
    summary: str
    explanation: str | None = None
    recommendation: str | None = None
    count: int = 0
    locations: list[IssueLocation] = Field(default_factory=list)
    premium_detail_available: bool | None = None


class SectionBreakdown(BaseModel):
    section: str
    formatting_score: float
    issue_count: int = 0
    issues: list[str] = Field(default_factory=list)


class AnalyzeResultResponse(BaseModel):
    job_id: str
    status: Literal["done", "failed"]
    stage: JobStage = JobStage.done
    right_pct: float | None = None
    wrong_pct: float | None = None
    category_wrong_pct: list[CategoryWrongPct] = Field(default_factory=list)
    severity_pct: dict[str, float] = Field(default_factory=dict)
    overall_score: float | None = None
    issues: list[ScanIssue] = Field(default_factory=list)
    sections: list[SectionBreakdown] = Field(default_factory=list)
    page_count: int | None = None
    pagination: dict[str, Any] | None = None
    units_checked: int | None = None
    units_failed: int | None = None
    error: str | None = None
