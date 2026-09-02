from __future__ import annotations

import re
from collections import defaultdict

from app.gemini_client import enrich_compliance_issues

SEVERITY_ORDER = {"critical": 0, "moderate": 1, "minor": 2}
SEVERITY_PENALTY = {"critical": 15.0, "moderate": 8.0, "minor": 3.0}


def _font_key(value: str) -> str:
    value = value.split("+")[-1]
    return re.sub(r"[^a-z0-9]", "", value.lower()).replace("psmt", "").replace("mt", "")


def _section_map(parsed: dict) -> dict[tuple[int | None, int], str]:
    mapping: dict[tuple[int | None, int], str] = {}
    current = "General"
    if parsed["metadata"]["format"] == "pdf":
        for page in parsed.get("pages", []):
            for line in page["lines"]:
                text = line["text"].strip()
                bold = any(span.get("bold") for span in line.get("spans", []))
                if text and len(text) <= 100 and (bold or (text.isupper() and len(text.split()) <= 12)):
                    current = text[:100]
                mapping[(page["page_index"], line["line_index"])] = current
    else:
        for paragraph in parsed.get("paragraphs", []):
            text = paragraph["text"].strip()
            style = (paragraph.get("style") or "").lower()
            if text and (style.startswith("heading") or style in {"title", "subtitle"}):
                current = text[:100]
            for line in paragraph["lines"]:
                mapping[(None, line["line_index"])] = current
    return mapping


class IssueCollector:
    def __init__(self) -> None:
        self.items: dict[str, dict] = {}

    def add(
        self,
        issue_type: str,
        severity: str,
        title: str,
        summary: str,
        explanation: str,
        recommendation: str,
        location: dict,
    ) -> None:
        item = self.items.setdefault(
            issue_type,
            {
                "severity": severity,
                "issue_type": issue_type,
                "title": title,
                "summary": summary,
                "explanation": explanation,
                "recommendation": recommendation,
                "locations": [],
            },
        )
        if location not in item["locations"]:
            item["locations"].append(location)

    def result(self) -> list[dict]:
        issues = list(self.items.values())
        for issue in issues:
            issue["count"] = len(issue["locations"])
        return sorted(issues, key=lambda issue: (SEVERITY_ORDER[issue["severity"]], issue["issue_type"]))


def _location(
    sections: dict[tuple[int | None, int], str], page: int | None, line: int
) -> dict:
    return {
        "page": page + 1 if page is not None else None,
        "line": line + 1,
        "section": sections.get((page, line), "General"),
    }


def _check_fonts(parsed: dict, rules: dict, sections: dict, collector: IssueCollector) -> None:
    font_rule = rules.get("font") or {}
    allowed_fonts = {_font_key(font) for font in font_rule.get("families", [])}
    allowed_sizes = {round(float(size), 2) for size in font_rule.get("sizes_points", [])}
    if not allowed_fonts and not allowed_sizes:
        return
    if parsed["metadata"]["format"] == "pdf":
        observations = (
            (page["page_index"], line["line_index"], span)
            for page in parsed.get("pages", [])
            for line in page["lines"]
            for span in line.get("spans", [])
        )
    else:
        observations = (
            (None, line["line_index"], run)
            for paragraph in parsed.get("paragraphs", [])
            for line in paragraph["lines"]
            for run in paragraph.get("runs", [])
            if run.get("text", "").strip()
        )
    seen: set[tuple] = set()
    for page, line, span in observations:
        marker = (page, line)
        font = span.get("font")
        size = span.get("size")
        if allowed_fonts and font and not any(
            allowed in _font_key(font) or _font_key(font) in allowed for allowed in allowed_fonts
        ):
            if ("family", *marker) not in seen:
                collector.add(
                    "font_family", "critical", "Font family differs",
                    "Text uses a font family not listed by the mechanics.",
                    f"The source metadata identifies “{font}”, outside the specified font family set.",
                    "Apply one of the mechanics-approved font families to this text.",
                    _location(sections, page, line),
                )
                seen.add(("family", *marker))
        if allowed_sizes and size is not None and round(float(size), 2) not in allowed_sizes:
            if ("size", *marker) not in seen:
                collector.add(
                    "font_size", "critical", "Font size differs",
                    "Text uses a point size not listed by the mechanics.",
                    f"The source metadata reports {size} pt; accepted extracted sizes are {sorted(allowed_sizes)}.",
                    "Set this text to a point size explicitly specified by the mechanics.",
                    _location(sections, page, line),
                )
                seen.add(("size", *marker))


def _check_page_size(parsed: dict, rules: dict, collector: IssueCollector) -> None:
    rule = rules.get("paper_size")
    if not rule:
        return
    named = {"A4": (8.27, 11.69), "LETTER": (8.5, 11.0), "LEGAL": (8.5, 14.0)}
    expected = None
    if rule.get("width_inches") and rule.get("height_inches"):
        expected = (float(rule["width_inches"]), float(rule["height_inches"]))
    elif rule.get("name") in named:
        expected = named[rule["name"]]
    if not expected:
        return
    if parsed["metadata"]["format"] == "pdf":
        sources = [
            (page["page_index"], page["width_points"] / 72, page["height_points"] / 72)
            for page in parsed.get("pages", [])
        ]
    else:
        sources = [
            (None, section.get("page_width_inches"), section.get("page_height_inches"))
            for section in parsed.get("sections", [])
        ]
    for page, width, height in sources:
        if width is None or height is None:
            continue
        direct = abs(width - expected[0]) <= 0.12 and abs(height - expected[1]) <= 0.12
        rotated = abs(width - expected[1]) <= 0.12 and abs(height - expected[0]) <= 0.12
        if not (direct or rotated):
            collector.add(
                "paper_size", "critical", "Paper size differs",
                "The document page dimensions do not match the mechanics.",
                f"Measured page size is {width:.2f} × {height:.2f} inches; expected {expected[0]:.2f} × {expected[1]:.2f}.",
                "Change the document page size to the mechanics-specified dimensions.",
                {"page": page + 1 if page is not None else None, "line": 1, "section": "Page setup"},
            )


def _check_docx_layout(parsed: dict, rules: dict, sections: dict, collector: IssueCollector) -> None:
    if parsed["metadata"]["format"] != "docx":
        return
    spacing = rules.get("line_spacing")
    indent = rules.get("first_line_indent_inches")
    for paragraph in parsed.get("paragraphs", []):
        if not paragraph["lines"]:
            continue
        line = paragraph["lines"][0]["line_index"]
        location = _location(sections, None, line)
        actual_spacing = paragraph["formatting"].get("line_spacing")
        if spacing is not None and actual_spacing is not None and abs(actual_spacing - spacing) > 0.05:
            collector.add(
                "line_spacing", "moderate", "Line spacing differs",
                "Explicit paragraph line spacing does not match the mechanics.",
                f"This paragraph stores {actual_spacing:g} line spacing; the mechanics specifies {spacing:g}.",
                "Set the paragraph line spacing to the mechanics-specified value.", location,
            )
        actual_indent = paragraph["formatting"].get("first_line_indent_inches")
        if indent is not None and actual_indent is not None and abs(actual_indent - indent) > 0.05:
            collector.add(
                "first_line_indent", "minor", "First-line indentation differs",
                "Explicit paragraph indentation does not match the mechanics.",
                f"This paragraph stores a {actual_indent:g}-inch first-line indent; expected {indent:g} inches.",
                "Set the first-line indent to the mechanics-specified measurement.", location,
            )
    expected_margins = rules.get("margins_inches") or {}
    for section in parsed.get("sections", []):
        for side, expected in expected_margins.items():
            actual = section.get(f"{side}_margin_inches")
            if actual is not None and abs(actual - float(expected)) > 0.05:
                collector.add(
                    f"{side}_margin", "moderate", f"{side.title()} margin differs",
                    f"The explicit {side} margin does not match the mechanics.",
                    f"The section stores a {actual:g}-inch {side} margin; expected {expected:g} inches.",
                    f"Set the {side} margin to {expected:g} inches.",
                    {"page": None, "line": 0, "section": f"Document section {section['section_index'] + 1}"},
                )


def _check_citations(text: str, rules: dict, collector: IssueCollector) -> None:
    style = rules.get("citation_style")
    if not style:
        return
    numeric = len(re.findall(r"\[(?:\d+)(?:\s*[-,]\s*\d+)*\]", text))
    author_year = len(
        re.findall(r"\([A-Z][A-Za-z'’-]+(?:\s+(?:et al\.|&\s+[A-Z][A-Za-z'’-]+))?,?\s+\d{4}[a-z]?\)", text)
    )
    citation_count = numeric + author_year
    if citation_count == 0:
        return
    mismatch = (style in {"IEEE", "VANCOUVER"} and author_year > numeric) or (
        style in {"APA", "HARVARD", "CHICAGO", "TURABIAN"} and numeric > author_year
    )
    if mismatch:
        collector.add(
            "citation_format", "moderate", "Citation format appears inconsistent",
            f"Detected citation markers do not predominantly follow {style} formatting.",
            "This check compares citation marker syntax only; it does not validate sources or citation content.",
            f"Reformat in-text citation markers consistently using {style} conventions.",
            {"page": None, "line": 0, "section": "Citations"},
        )


def run_compliance_scan(
    parsed: dict, mechanics_rules: dict, tier: str = "free"
) -> dict:
    sections = _section_map(parsed)
    collector = IssueCollector()
    _check_fonts(parsed, mechanics_rules, sections, collector)
    _check_page_size(parsed, mechanics_rules, collector)
    _check_docx_layout(parsed, mechanics_rules, sections, collector)
    _check_citations(parsed.get("text", ""), mechanics_rules, collector)
    issues = enrich_compliance_issues(collector.result(), mechanics_rules, tier)
    issues.sort(key=lambda issue: (SEVERITY_ORDER.get(issue["severity"], 2), issue["issue_type"]))

    section_issues: dict[str, list[dict]] = defaultdict(list)
    for issue in issues:
        for location in issue["locations"]:
            section_issues[location.get("section") or "General"].append(issue)
    if not section_issues:
        section_issues["General"] = []
    breakdown = []
    for section, matched in section_issues.items():
        unique = {issue["issue_type"]: issue for issue in matched}.values()
        penalty = sum(SEVERITY_PENALTY[issue["severity"]] for issue in unique)
        breakdown.append(
            {
                "section": section,
                "formatting_score": round(max(0.0, min(100.0, 100.0 - penalty)), 2),
                "issue_count": len(matched),
                "issues": sorted({issue["issue_type"] for issue in matched}),
            }
        )
    overall_penalty = sum(
        SEVERITY_PENALTY[issue["severity"]] * min(issue["count"], 5) for issue in issues
    )
    return {
        "overall_score": round(max(0.0, min(100.0, 100.0 - overall_penalty)), 2),
        "issues": issues,
        "sections": sorted(breakdown, key=lambda item: item["section"].lower()),
    }
