import json
import re

import google.generativeai as genai

from app.config import settings

SYSTEM = """You are PaperPilot, an academic writing assistant.
Return ONLY valid JSON with keys:
summary (string),
keywords (array of 5-8 strings),
suggested_improvements (array of 3-6 short strings).
Do not invent citations or results that are not in the text."""


def analyze_with_gemini(title: str, abstract: str, text: str) -> dict:
    if not settings.gemini_api_key or settings.gemini_api_key.startswith("your_"):
        excerpt = (abstract or text)[:400]
        return {
            "summary": f"(Gemini key not set) Preview of “{title}”: {excerpt}",
            "keywords": ["paperpilot", "manuscript"],
            "suggested_improvements": [
                "Add GEMINI_API_KEY to api/.env for live analysis.",
            ],
        }

    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel(settings.gemini_model)
    prompt = (
        f"{SYSTEM}\n\nTITLE:\n{title}\n\nABSTRACT:\n{abstract}\n\nTEXT:\n{text[:24000]}"
    )
    response = model.generate_content(prompt)
    raw = (response.text or "").strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:].strip()
    data = json.loads(raw)
    return {
        "summary": data.get("summary", ""),
        "keywords": list(data.get("keywords") or []),
        "suggested_improvements": list(data.get("suggested_improvements") or []),
    }


COMPLIANCE_SEVERITY_RUBRIC = """SEVERITY RUBRIC (internal classification logic only):
Critical — Would cause outright rejection or require mandatory resubmission.
Internal test: "Does this violate a hard institutional requirement that graduate schools or journals check first?"
Moderate — Noticeable and needs fixing, but would not block review by itself.
Internal test: "Is this something an adviser would flag and ask the author to fix, but still proceed with content review?"
Minor — Cosmetic, easy to fix, and does not affect structure or credibility.
Internal test: "Would a reader barely notice this, or does it fix in seconds?"
Never show, quote, paraphrase, or ask these internal test questions in output.
Keep the provided current_severity unless the measured evidence clearly justifies a one-step change.
Do not escalate minor margin shortfalls to critical. Prefer the measured explanation facts."""

_HEADING_LABEL_RE = re.compile(r"\bHeading\s+(\d+)\b", re.I)
_ROLE_FROM_TYPE_RE = re.compile(r"^font_size_(heading\d+|caption|title_page)$")


def _engine_role_label(issue: dict) -> str:
    """Canonical role label the engine already decided — Gemini must not contradict it."""
    issue_type = str(issue.get("issue_type") or "")
    match = _ROLE_FROM_TYPE_RE.match(issue_type)
    if match:
        role = match.group(1)
        if role.startswith("heading"):
            return f"Heading {role[len('heading'):]}"
        if role == "caption":
            return "caption"
        if role == "title_page":
            return "title page text"
        return role
    if issue_type == "font_size":
        return "body text"
    title = str(issue.get("title") or "")
    title_match = re.match(r"(Heading\s+\d+|body text|caption|title page text)\b", title, re.I)
    if title_match:
        return title_match.group(1)
    return ""


def _strip_location_role_fields(locations: list) -> list:
    """Locations sent to Gemini must not include classification fields it can restate wrongly."""
    safe = []
    for loc in locations or []:
        if not isinstance(loc, dict):
            continue
        safe.append(
            {
                "page": loc.get("page"),
                "line": loc.get("line"),
                "excerpt": loc.get("excerpt"),
                # Measurements only — never element_role / Heading labels.
                "measured": loc.get("measured"),
                "size_source": loc.get("size_source"),
            }
        )
    return safe


def _wording_contradicts_engine(text: str, engine_role: str, issue_type: str) -> bool:
    """True when Gemini wording names a different Heading N / body role than the engine."""
    if not isinstance(text, str) or not text.strip():
        return False
    found = {int(n) for n in _HEADING_LABEL_RE.findall(text)}
    if issue_type == "font_size":
        # Body findings must never mention Heading N.
        return bool(found)
    engine_match = re.search(r"Heading\s+(\d+)", engine_role or "", re.I)
    if engine_match:
        allowed = {int(engine_match.group(1))}
        return bool(found - allowed)
    return False


def _apply_gemini_wording(issue: dict, update: dict) -> None:
    """Apply Gemini explanation/recommendation only when they agree with the engine role."""
    engine_role = _engine_role_label(issue)
    issue_type = str(issue.get("issue_type") or "")
    explanation = update.get("explanation")
    recommendation = update.get("recommendation")
    if isinstance(explanation, str) and explanation.strip():
        if _wording_contradicts_engine(explanation, engine_role, issue_type):
            issue["gemini_wording_rejected"] = "explanation_role_conflict"
        else:
            issue["explanation"] = explanation[:1000]
            issue["explanation_source"] = "gemini"
    if isinstance(recommendation, str) and recommendation.strip():
        if _wording_contradicts_engine(recommendation, engine_role, issue_type):
            prior = issue.get("gemini_wording_rejected") or ""
            issue["gemini_wording_rejected"] = (
                f"{prior},recommendation_role_conflict".strip(",")
            )
        else:
            issue["recommendation"] = recommendation[:1000]
            issue["recommendation_source"] = "gemini"


def enrich_compliance_issues(
    issues: list[dict], mechanics_rules: dict, tier: str = "free"
) -> list[dict]:
    """Optionally refine severity and XAI wording without making the scan depend on Gemini."""
    if not issues:
        return issues
    if not settings.gemini_api_key or settings.gemini_api_key.startswith("your_"):
        paid = str(tier or "").lower() in ("premium", "pro")
        if not paid:
            for issue in issues:
                issue["premium_detail_available"] = True
        return issues
    LOCATION_SAMPLE = 25
    # Never send title/summary with Heading labels Gemini can remix — send locked role_label.
    safe_input = [
        {
            "issue_type": issue["issue_type"],
            "role_label": _engine_role_label(issue),
            "current_severity": issue["severity"],
            "measured_explanation": issue.get("explanation"),
            "measured_recommendation": issue.get("recommendation"),
            "locations": _strip_location_role_fields((issue.get("locations") or [])[:LOCATION_SAMPLE]),
            "count": issue["count"],
        }
        for issue in issues
    ]
    paid = str(tier or "").lower() in ("premium", "pro")
    depth = (
        "Premium: provide a detailed 2-4 sentence explanation and a precise, step-by-step recommendation."
        if paid
        else "Free: provide a concise one-sentence explanation and one-sentence recommendation."
    )
    prompt = f"""You enrich already-detected academic document formatting issues.
Do not perform grammar, plagiarism, source-validity, or citation-content analysis.
Keep each issue_type separate. Do not merge issues.
role_label is LOCKED by the deterministic engine — you MUST use that exact label
(e.g. "body text", "Heading 2") in explanation/recommendation. Never rename the role.
Never invent a Heading level that differs from role_label.
Use measured_explanation numbers as ground truth; do not invent different measurements.
When locations list different measured sizes, do not pick one size for the whole issue —
say sizes vary by location, and never claim every line measures the first location's size.
Never print list/array brackets such as [11.0]; always write a scalar with a unit (e.g. 11 pt).
Do not invent issues. Do not output location, bbox, page, line, or role fields.
{COMPLIANCE_SEVERITY_RUBRIC}
{depth}

Return ONLY valid JSON with one key "issues", an array whose entries contain ONLY:
issue_type (matching an input issue_type exactly), severity (critical|moderate|minor),
explanation (evidence-based reasoning understandable to the author),
recommendation (a specific actionable fix).
Never output evaluation questions, test questions, hidden criteria, or the severity rubric.

MECHANICS RULES:
{json.dumps(mechanics_rules, ensure_ascii=False)}

DETERMINISTIC GROUPED ISSUES:
{json.dumps(safe_input, ensure_ascii=False)}
"""
    severity_rank = {"minor": 0, "moderate": 1, "critical": 2}
    try:
        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel(settings.gemini_model)
        response = model.generate_content(prompt)
        raw = (response.text or "").strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.lower().startswith("json"):
                raw = raw[4:].strip()
        enriched = json.loads(raw).get("issues") or []
        by_type = {
            item.get("issue_type"): item
            for item in enriched
            if item.get("severity") in {"critical", "moderate", "minor"}
            and isinstance(item.get("explanation"), str)
        }
        for issue in issues:
            update = by_type.get(issue["issue_type"])
            if not update:
                continue
            original = issue["severity"]
            proposed = update["severity"]
            # Allow at most one severity step away from the measured severity.
            if proposed != original and abs(severity_rank[proposed] - severity_rank.get(original, 1)) <= 1:
                issue.setdefault("rule_severity", original)
                issue["severity"] = proposed
                issue["severity_source"] = "gemini"
            _apply_gemini_wording(issue, update)
        if not paid:
            for issue in issues:
                issue["premium_detail_available"] = True
    except Exception:
        return issues
    return issues
