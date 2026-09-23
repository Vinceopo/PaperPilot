import base64
import io
import json
import time
import uuid
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pypdf import PdfReader

from app.cloudinary_fetch import CloudinaryFetchError, fetch_cloudinary_bytes
from app.config import settings
from app.compliance import run_compliance_scan
from app.compliance_db import (
    MechanicsInUse,
    MechanicsNameConflict,
    UpgradeRequired,
    activate_premium_from_payment,
    cancel_user_subscription,
    check_scan_eligibility,
    create_mechanics,
    create_pending_scan,
    create_version,
    delete_mechanics,
    get_mechanics,
    get_pending_checkout,
    get_scan,
    get_version,
    get_version_document_url,
    get_version_full,
    init_db as init_compliance_db,
    is_current_version,
    latest_pending_checkout_id,
    list_manuscripts,
    list_mechanics,
    list_versions,
    persist_scan,
    require_premium,
    save_pending_checkout,
    subscription_snapshot,
    update_mechanics,
)
from app.ml_service_client import MLServiceError, create_analyze_job, ml_service_configured
from app.scan_ml_sync import hydrate_scan_from_ml, scan_progress_payload
from app.paymongo import (
    PayMongoError,
    checkout_session_is_paid,
    create_checkout_session,
    plan_amount_pesos,
    retrieve_checkout_session,
    verify_webhook_signature,
)
from app.paymongo_events import fulfill_checkout_paid, handle_paymongo_event
from app.documents import (
    DocumentError,
    derive_mechanics_rules,
    normalize_mechanics_rules,
    parse_document,
    validate_document,
)
from app.emailer import send_otp_email
from app.firebase_admin_app import admin_auth
from app.gemini_client import analyze_with_gemini
from app.otp import (
    PURPOSES,
    can_send,
    consume_challenge,
    generate_code,
    init_db,
    issue_challenge,
    store_otp,
    verify_otp,
)
from app.profiles import release_username, reserve_username, save_profile, username_taken
from app.rules import evaluate_manuscript
from app.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    CancelSubscriptionRequest,
    CloudinaryDocumentRequest,
    ConfirmCheckoutRequest,
    OtpSendRequest,
    OtpVerifyRequest,
    RegisterCheckRequest,
    RegisterRequest,
    ResetPasswordRequest,
    RuleResult,
    ComplianceScanRequest,
    ManuscriptVersionCloudinaryRequest,
    MechanicsSaveRequest,
    MechanicsUpdateRequest,
    SubscribeRequest,
)
from app.validators import email_error, name_error, normalize_email, password_error, username_error

app = FastAPI(title="PaperPilot API", version="0.1.0")  # reload settings after .env
init_db()
init_compliance_db()

# Local web (Vite) + Expo / LAN + Vercel. Credentials are not required for /analyze.
origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    # localhost + private LAN IPs + Vercel previews
    allow_origin_regex=(
        r"https?://("
        r"localhost|127\.0\.0\.1|"
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|"
        r"([a-z0-9-]+\.)+vercel\.app"
        r")(:\d+)?"
    ),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "ok": True,
        "service": "paperpilot-api",
        "health": "/health",
        "docs": "/docs",
        "analyze": "POST /analyze",
    }


@app.get("/health")
def health():
    return {"ok": True, "service": "paperpilot-api"}


@app.get("/json/version")
@app.get("/json")
@app.get("/json/list")
def chrome_devtools_probe():
    """IDE/browser probes open ports for Chrome DevTools (/json/version). Answer so logs stay clean."""
    return {
        "ok": True,
        "service": "paperpilot-api",
        "Browser": "PaperPilot API",
        "Protocol-Version": "0",
        "webSocketDebuggerUrl": "",
    }


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(body: AnalyzeRequest):
    try:
        ai = analyze_with_gemini(body.title, body.abstract, body.text)
        rules = evaluate_manuscript(body.title, body.abstract, body.text)
        return AnalyzeResponse(
            summary=ai["summary"],
            keywords=ai["keywords"],
            suggested_improvements=ai["suggested_improvements"],
            rules=RuleResult(**rules),
        )
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"Gemini returned non-JSON: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/extract-pdf")
async def extract_pdf(body: CloudinaryDocumentRequest):
    try:
        data, hint = fetch_cloudinary_bytes(body.cloudinary_url)
    except CloudinaryFetchError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    filename = (body.filename or hint or "document.pdf").strip()
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Upload a PDF file.")
    reader = PdfReader(io.BytesIO(data))
    pages = [(page.extract_text() or "") for page in reader.pages]
    text = "\n\n".join(pages).strip()
    return {"filename": filename, "pages": len(reader.pages), "text": text}


def authenticated_uid(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="A Firebase ID token is required.")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="A Firebase ID token is required.")
    fb = admin_auth()
    if not fb:
        raise HTTPException(
            status_code=503,
            detail=(
                "Firebase Admin is unavailable. Configure FIREBASE_CREDENTIALS with a valid "
                "service account before using protected endpoints."
            ),
        )
    try:
        decoded = fb.verify_id_token(token)
        uid = decoded.get("uid") or decoded.get("sub")
        if not uid:
            raise ValueError("Token has no UID.")
        return str(uid)
    except Exception:
        raise HTTPException(status_code=401, detail="The Firebase ID token is invalid or expired.") from None


def _read_document_bytes(filename: str, data: bytes) -> tuple[str, str, dict]:
    file_type = validate_document(filename, data, settings.max_upload_bytes)
    parsed = parse_document(data, file_type)
    return filename, file_type, parsed


def _read_cloudinary_document(url: str, filename_hint: str | None = None) -> tuple[str, str, dict]:
    data, hint = fetch_cloudinary_bytes(url)
    filename = Path((filename_hint or hint or "document").strip()).name
    if not Path(filename).suffix and hint and Path(hint).suffix:
        filename = Path(hint).name
    return _read_document_bytes(filename, data)


def _document_preview_pages(parsed: dict, text: str, limit: int = 500) -> list[dict]:
    """Text fallback only. The web UI prefers the original uploaded file."""
    pages_out: list[dict] = []
    source_pages = parsed.get("pages") or []
    if source_pages:
        for page in source_pages[:limit]:
            page_text = "\n".join(
                line.get("text", "") for line in (page.get("lines") or []) if line.get("text")
            ).strip()
            pages_out.append(
                {
                    "page_index": page.get("page_index", len(pages_out)),
                    "text": page_text[:8000],
                }
            )
    else:
        paragraphs = parsed.get("paragraphs") or []
        chunks: list[str] = []
        current: list[str] = []
        for paragraph in paragraphs:
            if (paragraph.get("source") or "body") != "body":
                continue
            runs = paragraph.get("runs") or []
            current.append(str(paragraph.get("text") or ""))
            if any(int(run.get("page_breaks") or 0) > 0 for run in runs):
                chunk = "\n".join(current).strip()
                if chunk:
                    chunks.append(chunk)
                current = []
        if current:
            chunk = "\n".join(current).strip()
            if chunk:
                chunks.append(chunk)
        if not chunks:
            body = (text or "").strip()
            size = 2200
            chunks = [
                body[i : i + size].strip()
                for i in range(0, min(len(body), size * limit), size)
                if body[i : i + size].strip()
            ]
        for index, chunk in enumerate(chunks[:limit]):
            if chunk:
                pages_out.append({"page_index": index, "text": chunk[:8000]})

    if not pages_out and text:
        pages_out = [{"page_index": 0, "text": text[:8000]}]
    return pages_out


def _raise_upgrade(exc: UpgradeRequired) -> None:
    raise HTTPException(status_code=403, detail=exc.detail) from None


@app.get("/mechanics")
def mechanics_list(uid: str = Depends(authenticated_uid)):
    return {"items": list_mechanics(uid)}


@app.post("/mechanics/extract")
async def mechanics_extract(
    body: CloudinaryDocumentRequest,
    uid: str = Depends(authenticated_uid),
):
    """Parse a format guide and return editable rules without saving."""
    del uid  # auth only
    try:
        filename, file_type, parsed = _read_cloudinary_document(
            body.cloudinary_url, body.filename
        )
        text = parsed["text"]
        if not text:
            raise DocumentError(
                "No extractable text was found in the document. "
                "Use a text-based PDF or DOCX (not a scanned image-only PDF)."
            )
        rules = derive_mechanics_rules(text)
        pages = _document_preview_pages(parsed, text)
        return {
            "name": Path(filename).stem[:200],
            "source_filename": filename,
            "file_type": file_type,
            "text_preview": text[:6000],
            "extracted_text": text[:100_000],
            "page_count": (parsed.get("metadata") or {}).get("page_count")
            or len(parsed.get("pages") or [])
            or len(pages),
            "pages": pages,
            "rules": rules,
        }
    except CloudinaryFetchError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except DocumentError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@app.post("/mechanics/save", status_code=201)
def mechanics_save(body: MechanicsSaveRequest, uid: str = Depends(authenticated_uid)):
    """Save a mechanics profile from AI extraction (edited) or manual customize."""
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="A mechanics name is required.")
    rules = normalize_mechanics_rules(body.rules)
    if not rules:
        raise HTTPException(
            status_code=400,
            detail="Add at least one format rule before saving.",
        )
    filename = (body.source_filename or f"{name}.docx").strip()[:300]
    raw_type = (body.file_type or "docx").strip().lower()[:40] or "docx"
    # SQLite CHECK only allows pdf/docx — map customize/"manual" saves to docx.
    file_type = raw_type if raw_type in ("pdf", "docx") else "docx"
    if not filename.lower().endswith((".pdf", ".docx")):
        filename = f"{Path(filename).stem}.docx"
    text = (body.extracted_text or "").strip()
    parsed = {
        "text": text,
        "pages": [],
        "source": "manual" if raw_type in ("manual", "customize") else "upload",
    }
    try:
        return create_mechanics(uid, name[:200], filename, file_type, text, parsed, rules)
    except MechanicsNameConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@app.get("/mechanics/sample")
def mechanics_sample():
    """Downloadable sample format-mechanics guide (DOCX) for users who need a starting point."""
    from docx import Document
    from fastapi.responses import StreamingResponse

    doc = Document()
    doc.add_heading("Sample Format Mechanics Guide", level=0)
    doc.add_paragraph(
        "Use this guide as a starting point. Upload it in PaperPilot, review the "
        "extracted Format Fields, then edit any value to match your school or style."
    )
    doc.add_heading("Paper", level=1)
    doc.add_paragraph("Paper size: 8.5 x 11 (Letter)")
    doc.add_paragraph("Orientation: Portrait")
    doc.add_paragraph("Paper substance / weight: 20")
    doc.add_paragraph("Line spacing: 1.5")
    doc.add_paragraph("First-line indentation: 0.5 inch")
    doc.add_heading("Margins (inches)", level=1)
    doc.add_paragraph("Top: 1 · Bottom: 1 · Left: 1 · Right: 1")
    doc.add_paragraph("Gutter: 0 · Header: 0.5 · Footer: 0.5")
    doc.add_heading("Font", level=1)
    doc.add_paragraph("Font type: Times New Roman")
    doc.add_paragraph("Font color: Black/Automatic")
    doc.add_paragraph("Heading 1 size: 16 pt")
    doc.add_paragraph("Heading 2 size: 14 pt")
    doc.add_paragraph("Heading 3 and body content size: 12 pt")
    doc.add_heading("Pagination", level=1)
    doc.add_paragraph("Page number position: Top right")
    doc.add_paragraph("First page of each chapter: No page number shown")
    doc.add_heading("Page breaks", level=1)
    doc.add_paragraph("Insert a page break only when starting a new chapter.")
    doc.add_heading("Tables", level=1)
    doc.add_paragraph('Table naming: Table <name> above a "TABLE TITLE" caption.')
    doc.add_heading("Figures", level=1)
    doc.add_paragraph(
        "Figure naming: Figure <number>: Figure Title in bold/underlined below the figure."
    )
    doc.add_heading("Citation format", level=1)
    doc.add_paragraph("Citation style: APA 7th Edition")

    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    headers = {
        "Content-Disposition": 'attachment; filename="Sample_Format_Mechanics.docx"'
    }
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers=headers,
    )


@app.post("/mechanics", status_code=201)
async def mechanics_create(
    body: CloudinaryDocumentRequest,
    uid: str = Depends(authenticated_uid),
):
    try:
        filename, file_type, parsed = _read_cloudinary_document(
            body.cloudinary_url, body.filename
        )
        text = parsed["text"]
        if not text:
            raise DocumentError("No extractable text was found in the document.")
        item_name = (body.name or Path(filename).stem).strip()
        if not item_name:
            raise DocumentError("A mechanics name is required.")
        item = create_mechanics(
            uid, item_name[:200], filename, file_type, text, parsed, derive_mechanics_rules(text)
        )
        return item
    except CloudinaryFetchError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except MechanicsNameConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except DocumentError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@app.patch("/mechanics/{mechanics_id}")
def mechanics_update(
    mechanics_id: str,
    body: MechanicsUpdateRequest,
    uid: str = Depends(authenticated_uid),
):
    if body.name is None and body.rules is None:
        raise HTTPException(status_code=400, detail="Provide a name and/or rules to update.")
    name = body.name.strip() if body.name is not None else None
    rules = normalize_mechanics_rules(body.rules) if body.rules is not None else None
    if body.rules is not None and not rules:
        raise HTTPException(
            status_code=400,
            detail="Add at least one format rule before saving.",
        )
    try:
        item = update_mechanics(uid, mechanics_id, name=name, rules=rules)
    except MechanicsNameConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    if not item:
        raise HTTPException(status_code=404, detail="Mechanics not found.")
    return item


@app.delete("/mechanics/{mechanics_id}")
def mechanics_delete(mechanics_id: str, uid: str = Depends(authenticated_uid)):
    try:
        deleted = delete_mechanics(uid, mechanics_id)
    except MechanicsInUse as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    if not deleted:
        raise HTTPException(status_code=404, detail="Mechanics not found.")
    return {"ok": True}


@app.get("/manuscripts")
def manuscripts_list(uid: str = Depends(authenticated_uid)):
    return {"items": list_manuscripts(uid)}


@app.post("/manuscripts/preview")
async def manuscript_preview(
    body: CloudinaryDocumentRequest,
    uid: str = Depends(authenticated_uid),
):
    """Extract manuscript pages for a document-style side preview (no version created)."""
    del uid
    try:
        filename, file_type, parsed = _read_cloudinary_document(
            body.cloudinary_url, body.filename
        )
        text = parsed.get("text") or ""
        if not text:
            raise DocumentError("No extractable text was found in the document.")

        pages_out = _document_preview_pages(parsed, text)
        source_pages = parsed.get("pages") or []

        return {
            "filename": filename,
            "file_type": file_type,
            "text_preview": text[:10000],
            "char_count": len(text),
            "page_count": (parsed.get("metadata") or {}).get("page_count")
            or len(source_pages)
            or len(pages_out),
            "pages": pages_out,
            "cloudinary_url": body.cloudinary_url,
        }
    except CloudinaryFetchError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except DocumentError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@app.post("/manuscripts/versions", status_code=201)
async def manuscript_version_create(
    body: ManuscriptVersionCloudinaryRequest,
    uid: str = Depends(authenticated_uid),
):
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="A manuscript title is required.")
    manuscript_id = (body.manuscript_id or "").strip() or None
    if not body.mechanics_id or not get_mechanics(uid, body.mechanics_id):
        raise HTTPException(
            status_code=404,
            detail="Format mechanics not found. Select a saved format profile, then upload again.",
        )
    try:
        filename, file_type, parsed = _read_cloudinary_document(
            body.cloudinary_url, body.filename
        )
        if not parsed["text"]:
            raise DocumentError("No extractable text was found in the document.")
        version, created_parent = create_version(
            uid,
            body.title.strip()[:300],
            body.mechanics_id,
            filename,
            file_type,
            parsed["text"],
            parsed,
            manuscript_id,
            cloudinary_url=body.cloudinary_url,
        )
        return {"created_manuscript": created_parent, "version": version}
    except CloudinaryFetchError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except DocumentError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except LookupError as exc:
        reason = str(exc) or ""
        if "echanics" in reason:
            raise HTTPException(
                status_code=404,
                detail="Format mechanics not found. Select a saved format profile, then upload again.",
            ) from None
        raise HTTPException(
            status_code=404,
            detail="That manuscript was not found on the server. Upload it as a new manuscript and try again.",
        ) from None


@app.get("/manuscripts/{manuscript_id}/versions")
def manuscript_versions_list(
    manuscript_id: str,
    include_history: bool = Query(default=False),
    uid: str = Depends(authenticated_uid),
):
    if include_history:
        try:
            require_premium(uid)
        except UpgradeRequired as exc:
            _raise_upgrade(exc)
    versions, current_id = list_versions(uid, manuscript_id, include_history)
    if versions is None:
        raise HTTPException(status_code=404, detail="Manuscript not found.")
    return {
        "manuscript_id": manuscript_id,
        "current_version_id": current_id,
        "include_history": include_history,
        "items": versions,
    }


@app.get("/manuscripts/{manuscript_id}/versions/{version_id}")
def manuscript_version_detail(
    manuscript_id: str,
    version_id: str,
    uid: str = Depends(authenticated_uid),
):
    version = get_version(uid, manuscript_id, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Manuscript version not found.")
    if not is_current_version(uid, manuscript_id, version_id):
        try:
            require_premium(uid)
        except UpgradeRequired as exc:
            _raise_upgrade(exc)
    return version


@app.post("/manuscripts/{manuscript_id}/versions/{version_id}/scan", status_code=201)
def compliance_scan_create(
    manuscript_id: str,
    version_id: str,
    body: ComplianceScanRequest,
    uid: str = Depends(authenticated_uid),
):
    version = get_version_full(uid, manuscript_id, version_id)
    mechanics = get_mechanics(uid, body.mechanics_id)
    if not version or not mechanics:
        raise HTTPException(status_code=404, detail="Manuscript version or mechanics not found.")
    try:
        subscription = check_scan_eligibility(uid, manuscript_id, version_id)
    except UpgradeRequired as exc:
        _raise_upgrade(exc)
    except LookupError:
        raise HTTPException(status_code=404, detail="Manuscript not found.") from None

    if ml_service_configured():
        document_url = (version.get("cloudinary_url") or "").strip() or get_version_document_url(
            uid, manuscript_id, version_id
        )
        if not document_url:
            raise HTTPException(
                status_code=400,
                detail=(
                    "This manuscript version has no stored Cloudinary URL. "
                    "Upload the document again, then run the scan."
                ),
            )
        # ML cannot authenticate Cloudinary restricted formats; gateway fetches bytes.
        try:
            raw_bytes, _hint = fetch_cloudinary_bytes(document_url)
        except CloudinaryFetchError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from None
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Could not download the document for analysis: {exc}",
            ) from None
        scan_id = str(uuid.uuid4())
        try:
            create_analyze_job(
                job_id=scan_id,
                document_url=None,
                document_base64=base64.b64encode(raw_bytes).decode("ascii"),
                filename=version.get("source_filename") or "document.pdf",
                mechanics_rules=mechanics["rules"],
                tier=subscription["tier"],
            )
        except MLServiceError as exc:
            status = exc.status_code if exc.status_code and exc.status_code < 500 else 502
            raise HTTPException(status_code=status, detail=str(exc)) from None
        try:
            return create_pending_scan(
                uid,
                manuscript_id,
                version_id,
                body.mechanics_id,
                scan_id=scan_id,
                ml_job_id=scan_id,
            )
        except UpgradeRequired as exc:
            _raise_upgrade(exc)
        except LookupError:
            raise HTTPException(status_code=404, detail="Requested scan input was not found.") from None

    result = run_compliance_scan(
        version["parsed_data"], mechanics["rules"], subscription["tier"]
    )
    extra = {
        "page_count": result.get("page_count") or 0,
        "pagination": result.get("pagination") or {},
    }
    for key in ("right_pct", "wrong_pct", "category_wrong_pct", "severity_pct", "units_checked", "units_failed"):
        if key in result:
            extra[key] = result[key]
    try:
        scan = persist_scan(
            uid,
            manuscript_id,
            version_id,
            body.mechanics_id,
            result["overall_score"],
            result["issues"],
            result["sections"],
            extra=extra,
        )
    except UpgradeRequired as exc:
        _raise_upgrade(exc)
    except LookupError:
        raise HTTPException(status_code=404, detail="Requested scan input was not found.") from None
    scan["page_count"] = result.get("page_count") or 0
    scan["pagination"] = result.get("pagination") or {}
    return scan


@app.get("/scans/{scan_id}/progress")
def compliance_scan_progress(scan_id: str, uid: str = Depends(authenticated_uid)):
    if not get_scan(uid, scan_id):
        raise HTTPException(status_code=404, detail="Compliance scan not found.")
    try:
        payload = scan_progress_payload(uid, scan_id)
    except MLServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from None
    if not payload:
        raise HTTPException(status_code=404, detail="Compliance scan not found.")
    return payload


@app.get("/scans/{scan_id}")
def compliance_scan_detail(scan_id: str, uid: str = Depends(authenticated_uid)):
    if not get_scan(uid, scan_id):
        raise HTTPException(status_code=404, detail="Compliance scan not found.")
    try:
        scan = hydrate_scan_from_ml(uid, scan_id)
    except MLServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from None
    if not scan:
        raise HTTPException(status_code=404, detail="Compliance scan not found.")
    return scan


@app.get("/subscription")
def subscription_detail(uid: str = Depends(authenticated_uid)):
    return subscription_snapshot(uid)


@app.get("/subscription/history")
def subscription_history(uid: str = Depends(authenticated_uid)):
    snap = subscription_snapshot(uid)
    return {"history": snap.get("history") or []}


@app.post("/subscription/subscribe")
def subscription_subscribe(body: SubscribeRequest, uid: str = Depends(authenticated_uid)):
    plan = body.plan.lower()
    if plan == "free":
        return cancel_user_subscription(uid, immediate=True)

    billing_period = (body.billing_period or "monthly").lower()
    if billing_period not in ("monthly", "annual"):
        billing_period = "monthly"

    base = (settings.app_public_url or "https://paperpilotph.vercel.app").rstrip("/")
    success_url = f"{base}/?billing=success"
    cancel_url = f"{base}/?billing=canceled"
    reference = f"pp-{uid[:8]}-{int(time.time())}"

    customer_email = None
    customer_name = None
    fb = admin_auth()
    if fb:
        try:
            user = fb.get_user(uid)
            customer_email = user.email
            customer_name = user.display_name
        except Exception:
            pass

    try:
        payload = create_checkout_session(
            uid=uid,
            billing_period=billing_period,
            success_url=success_url,
            cancel_url=cancel_url,
            customer_email=customer_email,
            customer_name=customer_name,
            reference_number=reference,
        )
    except PayMongoError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc

    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="PayMongo returned an unexpected response.")
    attrs = data.get("attributes") if isinstance(data.get("attributes"), dict) else {}
    checkout_url = attrs.get("checkout_url")
    session_id = data.get("id")
    if not checkout_url or not session_id:
        raise HTTPException(status_code=502, detail="PayMongo checkout URL missing.")

    save_pending_checkout(
        uid,
        checkout_session_id=str(session_id),
        billing_period=billing_period,
        reference_number=reference,
        amount_pesos=plan_amount_pesos(billing_period),
    )
    return {
        "checkout_url": checkout_url,
        "checkout_session_id": session_id,
        "billing_period": billing_period,
        "amount": plan_amount_pesos(billing_period),
        "currency": "PHP",
        "provider": "paymongo",
    }


@app.post("/subscription/cancel")
def subscription_cancel(body: CancelSubscriptionRequest, uid: str = Depends(authenticated_uid)):
    return cancel_user_subscription(uid, immediate=bool(body.immediate))


@app.post("/subscription/confirm")
def subscription_confirm(body: ConfirmCheckoutRequest, uid: str = Depends(authenticated_uid)):
    """
    After PayMongo redirects back (?billing=success), the client calls this.
    We re-fetch the Checkout Session with the secret key and activate Premium when paid.
    Works even if the webhook is delayed or misconfigured.
    """
    session_id = (body.checkout_session_id or "").strip() or latest_pending_checkout_id(uid)
    if not session_id:
        snap = subscription_snapshot(uid)
        if str(snap.get("tier") or "").lower() == "premium":
            return {**snap, "confirmed": True, "already_premium": True}
        raise HTTPException(
            status_code=404,
            detail="No pending PayMongo checkout found for this account.",
        )

    pending = get_pending_checkout(session_id)
    if pending and str(pending.get("owner_uid") or "") not in ("", uid):
        raise HTTPException(status_code=403, detail="Checkout session does not belong to this account.")

    # Already activated (webhook may have won the race)
    if pending and pending.get("status") == "paid":
        return {**subscription_snapshot(uid), "confirmed": True, "checkout_session_id": session_id}

    try:
        payload = retrieve_checkout_session(session_id)
    except PayMongoError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc

    if not checkout_session_is_paid(payload):
        snap = subscription_snapshot(uid)
        return {
            **snap,
            "confirmed": False,
            "pending": True,
            "checkout_session_id": session_id,
            "message": "Payment is not marked paid yet. Try again in a few seconds.",
        }

    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    attrs = data.get("attributes") if isinstance(data.get("attributes"), dict) else {}
    meta = attrs.get("metadata") if isinstance(attrs.get("metadata"), dict) else {}
    meta_uid = str(meta.get("uid") or "").strip()
    if meta_uid and meta_uid != uid:
        raise HTTPException(status_code=403, detail="Checkout session does not belong to this account.")

    handled = fulfill_checkout_paid(data if isinstance(data, dict) else {"id": session_id})
    if not handled:
        # Session is paid and owned by this user — activate even if webhook metadata was missing.
        billing_period = str(
            (pending or {}).get("billing_period")
            or meta.get("billing_period")
            or "monthly"
        ).lower()
        payments = attrs.get("payments") if isinstance(attrs.get("payments"), list) else []
        payment_id = None
        amount_pesos = (pending or {}).get("amount")
        payment_method = "paymongo"
        if payments and isinstance(payments[0], dict):
            payment_id = payments[0].get("id")
            pay_attrs = (
                payments[0].get("attributes")
                if isinstance(payments[0].get("attributes"), dict)
                else {}
            )
            if isinstance(pay_attrs.get("amount"), int):
                amount_pesos = pay_attrs["amount"] // 100
            source = pay_attrs.get("source") if isinstance(pay_attrs.get("source"), dict) else {}
            payment_method = source.get("type") or payment_method
        activate_premium_from_payment(
            uid,
            billing_period=billing_period if billing_period in ("monthly", "annual") else "monthly",
            payment_method=payment_method,
            amount_pesos=int(amount_pesos) if amount_pesos is not None else None,
            checkout_session_id=session_id,
            payment_id=str(payment_id) if payment_id else None,
            reference_number=str(attrs.get("reference_number") or "") or None,
        )

    return {
        **subscription_snapshot(uid),
        "confirmed": True,
        "checkout_session_id": session_id,
    }


@app.post("/subscription/create-checkout")
def subscription_create_checkout(body: SubscribeRequest, uid: str = Depends(authenticated_uid)):
    """Alias for PayMongo Hosted Checkout creation (Premium upgrades only)."""
    if body.plan.lower() == "free":
        raise HTTPException(status_code=400, detail="Use /subscription/cancel to leave Premium.")
    return subscription_subscribe(body, uid)


@app.post("/webhooks/paymongo")
@app.post("/api/webhooks/paymongo")
async def paymongo_webhook(
    request: Request,
    paymongo_signature: str | None = Header(default=None, alias="Paymongo-Signature"),
):
    """
    PayMongo webhook — raw body required for HMAC verification.
    FastAPI does not JSON-parse Request.body(), so signature verification is safe here.
    Tier changes happen only after a valid signature (never from client redirects).
    """
    raw = await request.body()
    if not verify_webhook_signature(raw, paymongo_signature):
        raise HTTPException(status_code=403, detail="Invalid PayMongo webhook signature.")

    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook JSON.") from exc

    # Respond quickly after verify; handler is sync/RTDB and should stay short.
    result = handle_paymongo_event(payload if isinstance(payload, dict) else {})
    return JSONResponse(result, status_code=200)


def _require(error: str | None) -> None:
    if error:
        raise HTTPException(status_code=400, detail=error)


def _email_registered(email: str) -> bool | None:
    """True/False when Firebase Admin is configured, otherwise None."""
    fb = admin_auth()
    if not fb:
        return None
    from firebase_admin.auth import UserNotFoundError

    try:
        fb.get_user_by_email(email)
        return True
    except UserNotFoundError:
        return False


@app.post("/auth/register/check")
def auth_register_check(body: RegisterCheckRequest):
    email = normalize_email(body.email)
    username = body.username.strip()
    _require(email_error(email))
    _require(username_error(username))
    if _email_registered(email):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    if username_taken(username) is True:
        raise HTTPException(status_code=409, detail="That username is already taken.")
    return {"ok": True}


@app.post("/auth/otp/send")
def auth_otp_send(body: OtpSendRequest):
    email = normalize_email(body.email)
    _require(email_error(email))
    if body.purpose not in PURPOSES:
        raise HTTPException(status_code=400, detail="Invalid OTP purpose.")

    registered = _email_registered(email)
    if body.purpose == "verify_email" and registered:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    if body.purpose == "reset_password" and registered is False:
        raise HTTPException(status_code=404, detail="No account found for this email.")

    # Local/dev bypass: skip email and return a challenge token immediately.
    if not settings.otp_enabled:
        token = issue_challenge(email, body.purpose)
        key = "signup_token" if body.purpose == "verify_email" else "reset_token"
        return {
            "ok": True,
            "otp_bypassed": True,
            "expires_in": settings.otp_ttl_seconds,
            "resend_in": 0,
            "max_attempts": settings.otp_max_attempts,
            "message": "OTP is disabled; email verification was skipped.",
            key: token,
        }

    allowed, _wait, reason = can_send(email, body.purpose)
    if not allowed:
        raise HTTPException(status_code=429, detail=reason)

    code = generate_code()
    ttl = store_otp(email, body.purpose, code)
    try:
        send_otp_email(email, code, body.purpose)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not send email: {exc}") from exc
    payload = {
        "ok": True,
        "expires_in": ttl,
        "resend_in": settings.otp_resend_seconds,
        "max_attempts": settings.otp_max_attempts,
        "message": "A 6-digit code was sent to your email. It expires in 10 minutes.",
    }
    if settings.otp_echo_in_response or not settings.smtp_host:
        payload["dev_code"] = code
    return payload


@app.post("/auth/otp/verify")
def auth_otp_verify(body: OtpVerifyRequest):
    email = normalize_email(body.email)
    if not settings.otp_enabled:
        token = issue_challenge(email, body.purpose)
    else:
        try:
            token = verify_otp(email, body.purpose, body.code)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    key = "signup_token" if body.purpose == "verify_email" else "reset_token"
    return {"ok": True, "otp_bypassed": not settings.otp_enabled, key: token, "expires_in": settings.otp_ttl_seconds}


@app.post("/auth/register")
def auth_register(body: RegisterRequest):
    email = normalize_email(body.email)
    username = body.username.strip()
    first = body.first_name.strip()
    middle = body.middle_name.strip()
    last = body.last_name.strip()

    _require(name_error(first, "First name"))
    _require(name_error(middle, "Middle name", required=False))
    _require(name_error(last, "Last name"))
    _require(username_error(username))
    _require(email_error(email))
    _require(password_error(body.password))

    # The account is only created once a valid code has been exchanged for this token.
    try:
        consume_challenge(body.signup_token, email, "verify_email")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    fb = admin_auth()
    if not fb:
        # No service account: the client finishes signup with the Firebase SDK.
        return {"ok": True, "client_signup": True, "profile_saved": False}

    from firebase_admin.auth import EmailAlreadyExistsError

    display = " ".join(p for p in [first, middle, last] if p)
    try:
        user = fb.create_user(
            email=email,
            password=body.password,
            display_name=display,
            email_verified=True,
        )
    except EmailAlreadyExistsError:
        raise HTTPException(status_code=409, detail="An account with this email already exists.") from None
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if reserve_username(username, user.uid) is False:
        # Lost a race for the username: roll back so the email stays available.
        fb.delete_user(user.uid)
        raise HTTPException(status_code=409, detail="That username is already taken.")

    profile_saved = save_profile(
        user.uid,
        email=email,
        username=username,
        first_name=first,
        middle_name=middle,
        last_name=last,
    )
    if not profile_saved:
        release_username(username)
    return {"ok": True, "uid": user.uid, "client_signup": False, "profile_saved": profile_saved}


@app.post("/auth/reset-password")
def auth_reset_password(body: ResetPasswordRequest):
    email = normalize_email(body.email)
    _require(email_error(email))
    _require(password_error(body.new_password))
    try:
        consume_challenge(body.reset_token, email, "reset_password")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    fb = admin_auth()
    if not fb:
        raise HTTPException(
            status_code=503,
            detail="Password reset needs FIREBASE_CREDENTIALS on the API (service account JSON).",
        )
    from firebase_admin.auth import UserNotFoundError

    try:
        user = fb.get_user_by_email(email)
        fb.update_user(user.uid, password=body.new_password)
    except UserNotFoundError:
        raise HTTPException(status_code=400, detail="No account found for this email.") from None
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}
