import json

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
Never show, quote, paraphrase, or ask these internal test questions in output."""


def enrich_compliance_issues(
    issues: list[dict], mechanics_rules: dict, tier: str = "free"
) -> list[dict]:
    """Optionally refine severity and XAI wording without making the scan depend on Gemini."""
    if not issues:
        return issues
    if not settings.gemini_api_key or settings.gemini_api_key.startswith("your_"):
        if tier != "premium":
            for issue in issues:
                issue["premium_detail_available"] = True
        return issues
    safe_input = [
        {
            "issue_type": issue["issue_type"],
            "current_severity": issue["severity"],
            "summary": issue["summary"],
            "locations": issue["locations"],
            "count": issue["count"],
        }
        for issue in issues
    ]
    depth = (
        "Premium: provide a detailed 2-4 sentence explanation and a precise, step-by-step recommendation."
        if tier == "premium"
        else "Free: provide a concise one-sentence explanation and one-sentence recommendation."
    )
    prompt = f"""You enrich already-detected academic document formatting issues.
Do not perform grammar, plagiarism, source-validity, or citation-content analysis.
Consolidate reasoning by issue_type. Do not create or remove issue types.
{COMPLIANCE_SEVERITY_RUBRIC}
{depth}

Return ONLY valid JSON with one key "issues", an array whose entries contain ONLY:
issue_type (matching an input issue_type), severity (critical|moderate|minor),
explanation (evidence-based reasoning understandable to the author),
recommendation (a specific actionable fix).
Never output evaluation questions, test questions, hidden criteria, or the severity rubric.

MECHANICS RULES:
{json.dumps(mechanics_rules, ensure_ascii=False)}

DETERMINISTIC GROUPED ISSUES:
{json.dumps(safe_input, ensure_ascii=False)}
"""
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
            if update:
                issue["severity"] = update["severity"]
                issue["explanation"] = update["explanation"][:1000]
                recommendation = update.get("recommendation")
                if isinstance(recommendation, str) and recommendation.strip():
                    issue["recommendation"] = recommendation[:1000]
        if tier != "premium":
            for issue in issues:
                issue["premium_detail_available"] = True
    except Exception:
        return issues
    return issues
