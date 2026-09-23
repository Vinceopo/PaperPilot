from __future__ import annotations

from fastapi import Depends, FastAPI, HTTPException, status

from app.auth import require_service_key
from app.jobs import job_store, start_analyze_job
from app.schemas import (
    AnalyzeCreateRequest,
    AnalyzeCreateResponse,
    AnalyzeResultResponse,
    JobProgressResponse,
    JobStage,
)

app = FastAPI(
    title="PaperPilot ML Analyze Service",
    version="1.0.0",
    description="Render-hosted hybrid document compliance analysis for PaperPilot.",
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "paperpilot-machinelearning"}


@app.post("/v1/analyze", response_model=AnalyzeCreateResponse, dependencies=[Depends(require_service_key)])
def create_analyze_job(payload: AnalyzeCreateRequest) -> AnalyzeCreateResponse:
    record = start_analyze_job(
        job_id=payload.job_id,
        document_url=payload.document_url,
        document_base64=payload.document_base64,
        filename=payload.filename,
        mechanics_rules=payload.mechanics.rules,
        tier=payload.tier,
    )
    return AnalyzeCreateResponse(job_id=record.job_id)


@app.get(
    "/v1/analyze/{job_id}/progress",
    response_model=JobProgressResponse,
    dependencies=[Depends(require_service_key)],
)
def analyze_progress(job_id: str) -> JobProgressResponse:
    record = job_store.get(job_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    return JobProgressResponse(
        job_id=record.job_id,
        stage=record.stage,
        percent=record.percent,
        message=record.message,
        status=record.status,  # type: ignore[arg-type]
    )


@app.get(
    "/v1/analyze/{job_id}/result",
    response_model=AnalyzeResultResponse,
    dependencies=[Depends(require_service_key)],
)
def analyze_result(job_id: str) -> AnalyzeResultResponse:
    record = job_store.get(job_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    if record.status == "failed":
        return AnalyzeResultResponse(
            job_id=record.job_id,
            status="failed",
            stage=JobStage.failed,
            error=record.error or record.message,
        )
    if record.status != "done" or not record.result:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Job is still running; poll /progress until stage is done or failed.",
        )
    data = record.result
    return AnalyzeResultResponse(
        job_id=record.job_id,
        status="done",
        stage=JobStage.done,
        right_pct=data.get("right_pct"),
        wrong_pct=data.get("wrong_pct"),
        category_wrong_pct=data.get("category_wrong_pct") or [],
        severity_pct=data.get("severity_pct") or {},
        overall_score=data.get("overall_score"),
        issues=data.get("issues") or [],
        sections=data.get("sections") or [],
        page_count=data.get("page_count"),
        pagination=data.get("pagination"),
        units_checked=data.get("units_checked"),
        units_failed=data.get("units_failed"),
    )
