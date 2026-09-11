import io
import json
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader

from app.config import settings
from app.compliance import run_compliance_scan
from app.compliance_db import (
    MechanicsInUse,
    MechanicsNameConflict,
    UpgradeRequired,
    check_scan_eligibility,
    create_mechanics,
    create_version,
    delete_mechanics,
    get_mechanics,
    get_scan,
    get_version,
    init_db as init_compliance_db,
    is_current_version,
    list_manuscripts,
    list_mechanics,
    list_versions,
    persist_scan,
    rename_mechanics,
    require_premium,
    subscription_snapshot,
)
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
from app.otp import PURPOSES, can_send, consume_challenge, generate_code, init_db, store_otp, verify_otp
from app.profiles import release_username, reserve_username, save_profile, username_taken
from app.rules import evaluate_manuscript
from app.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    OtpSendRequest,
    OtpVerifyRequest,
    RegisterCheckRequest,
    RegisterRequest,
    ResetPasswordRequest,
    RuleResult,
    ComplianceScanRequest,
    MechanicsRenameRequest,
    MechanicsSaveRequest,
)
from app.validators import email_error, name_error, normalize_email, password_error, username_error

app = FastAPI(title="PaperPilot API", version="0.1.0")  # reload settings after .env
init_db()
init_compliance_db()

# Local web (Vite) + Expo. Credentials are not required for /analyze.
origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
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
async def extract_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Upload a PDF file.")
    data = await file.read()
    reader = PdfReader(io.BytesIO(data))
    pages = [(page.extract_text() or "") for page in reader.pages]
    text = "\n\n".join(pages).strip()
    return {"filename": file.filename, "pages": len(reader.pages), "text": text}


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


async def _read_document(file: UploadFile) -> tuple[str, str, dict]:
    filename = Path(file.filename or "").name
    try:
        data = await file.read(settings.max_upload_bytes + 1)
    finally:
        await file.close()
    file_type = validate_document(filename, data, settings.max_upload_bytes)
    parsed = parse_document(data, file_type)
    return filename, file_type, parsed


def _raise_upgrade(exc: UpgradeRequired) -> None:
    raise HTTPException(status_code=403, detail=exc.detail) from None


@app.get("/mechanics")
def mechanics_list(uid: str = Depends(authenticated_uid)):
    return {"items": list_mechanics(uid)}


@app.post("/mechanics/extract")
async def mechanics_extract(
    file: UploadFile = File(...),
    uid: str = Depends(authenticated_uid),
):
    """Parse a format guide and return editable rules without saving."""
    del uid  # auth only
    try:
        filename, file_type, parsed = await _read_document(file)
        text = parsed["text"]
        if not text:
            raise DocumentError("No extractable text was found in the document.")
        rules = derive_mechanics_rules(text)
        return {
            "name": Path(filename).stem[:200],
            "source_filename": filename,
            "file_type": file_type,
            "text_preview": text[:6000],
            "extracted_text": text[:100_000],
            "rules": rules,
        }
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
    filename = (body.source_filename or f"{name}.manual").strip()[:300]
    file_type = (body.file_type or "manual").strip()[:40] or "manual"
    text = (body.extracted_text or "").strip()
    parsed = {"text": text, "pages": [], "source": "manual" if file_type == "manual" else "upload"}
    try:
        return create_mechanics(uid, name[:200], filename, file_type, text, parsed, rules)
    except MechanicsNameConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@app.post("/mechanics", status_code=201)
async def mechanics_create(
    file: UploadFile = File(...),
    name: str | None = Form(default=None),
    uid: str = Depends(authenticated_uid),
):
    try:
        filename, file_type, parsed = await _read_document(file)
        text = parsed["text"]
        if not text:
            raise DocumentError("No extractable text was found in the document.")
        item_name = (name or Path(filename).stem).strip()
        if not item_name:
            raise DocumentError("A mechanics name is required.")
        item = create_mechanics(
            uid, item_name[:200], filename, file_type, text, parsed, derive_mechanics_rules(text)
        )
        return item
    except MechanicsNameConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except DocumentError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@app.patch("/mechanics/{mechanics_id}")
def mechanics_rename(
    mechanics_id: str,
    body: MechanicsRenameRequest,
    uid: str = Depends(authenticated_uid),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="A mechanics name is required.")
    try:
        item = rename_mechanics(uid, mechanics_id, name)
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
    file: UploadFile = File(...),
    uid: str = Depends(authenticated_uid),
):
    """Extract manuscript text for a side-by-side preview (no version created)."""
    del uid
    try:
        filename, file_type, parsed = await _read_document(file)
        text = parsed.get("text") or ""
        if not text:
            raise DocumentError("No extractable text was found in the document.")
        return {
            "filename": filename,
            "file_type": file_type,
            "text_preview": text[:10000],
            "char_count": len(text),
            "page_count": parsed.get("page_count") or len(parsed.get("pages") or []) or None,
        }
    except DocumentError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@app.post("/manuscripts/versions", status_code=201)
async def manuscript_version_create(
    file: UploadFile = File(...),
    mechanics_id: str = Form(...),
    title: str = Form(...),
    manuscript_id: str | None = Form(default=None),
    uid: str = Depends(authenticated_uid),
):
    if not title.strip():
        raise HTTPException(status_code=400, detail="A manuscript title is required.")
    if not get_mechanics(uid, mechanics_id):
        raise HTTPException(status_code=404, detail="Mechanics not found.")
    try:
        filename, file_type, parsed = await _read_document(file)
        if not parsed["text"]:
            raise DocumentError("No extractable text was found in the document.")
        version, created_parent = create_version(
            uid,
            title.strip()[:300],
            mechanics_id,
            filename,
            file_type,
            parsed["text"],
            parsed,
            manuscript_id,
        )
        return {"created_manuscript": created_parent, "version": version}
    except DocumentError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except LookupError:
        raise HTTPException(status_code=404, detail="Manuscript or mechanics not found.") from None


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
    version = get_version(uid, manuscript_id, version_id)
    mechanics = get_mechanics(uid, body.mechanics_id)
    if not version or not mechanics:
        raise HTTPException(status_code=404, detail="Manuscript version or mechanics not found.")
    try:
        subscription = check_scan_eligibility(uid, manuscript_id, version_id)
    except UpgradeRequired as exc:
        _raise_upgrade(exc)
    except LookupError:
        raise HTTPException(status_code=404, detail="Manuscript not found.") from None
    result = run_compliance_scan(
        version["parsed_data"], mechanics["rules"], subscription["tier"]
    )
    try:
        return persist_scan(
            uid,
            manuscript_id,
            version_id,
            body.mechanics_id,
            result["overall_score"],
            result["issues"],
            result["sections"],
        )
    except UpgradeRequired as exc:
        _raise_upgrade(exc)
    except LookupError:
        raise HTTPException(status_code=404, detail="Requested scan input was not found.") from None


@app.get("/scans/{scan_id}")
def compliance_scan_detail(scan_id: str, uid: str = Depends(authenticated_uid)):
    scan = get_scan(uid, scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Compliance scan not found.")
    return scan


@app.get("/subscription")
def subscription_detail(uid: str = Depends(authenticated_uid)):
    return subscription_snapshot(uid)


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
    try:
        token = verify_otp(email, body.purpose, body.code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    key = "signup_token" if body.purpose == "verify_email" else "reset_token"
    return {"ok": True, key: token, "expires_in": settings.otp_ttl_seconds}


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
