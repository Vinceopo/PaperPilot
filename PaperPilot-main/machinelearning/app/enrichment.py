from __future__ import annotations

import json

from app.config import settings

COMPLIANCE_SEVERITY_RUBRIC = """SEVERITY RUBRIC (internal classification logic only):
Critical — Would cause outright rejection or require mandatory resubmission.
Moderate — Noticeable and needs fixing, but would not block review by itself.
Minor — Cosmetic, easy to fix, and does not affect structure or credibility.
Never show, quote, paraphrase, or ask these internal test questions in output.
Keep the provided current_severity unless the measured evidence clearly justifies a one-step change.
Do not escalate minor margin shortfalls to critical. Prefer the measured explanation facts."""


def enrich_compliance_issues(
    issues: list[dict], mechanics_rules: dict, tier: str = "free"
) -> list[dict]:
    """Optionally refine severity and wording; scan does not depend on Gemini."""
    if not issues:
        return issues
    if not settings.gemini_api_key or settings.gemini_api_key.startswith("your_"):
        if tier != "premium":
            for issue in issues:
                issue["premium_detail_available"] = True
        return issues

    try:
        import google.generativeai as genai
    except ImportError:
        return issues

    location_sample = 25
    safe_input = [
        {
            "issue_type": issue["issue_type"],
            "current_severity": issue["severity"],
            "title": issue.get("title"),
            "summary": issue["summary"],
            "measured_explanation": issue.get("explanation"),
            "measured_recommendation": issue.get("recommendation"),
            "locations": (issue.get("locations") or [])[:location_sample],
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
Use measured_explanation numbers as ground truth; do not invent different measurements.
{COMPLIANCE_SEVERITY_RUBRIC}
{depth}

Return ONLY valid JSON with one key "issues", an array whose entries contain ONLY:
issue_type (matching an input issue_type), severity (critical|moderate|minor),
explanation (evidence-based reasoning understandable to the author),
recommendation (a specific actionable fix).

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
            if abs(severity_rank[proposed] - severity_rank.get(original, 1)) <= 1:
                issue["severity"] = proposed
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
