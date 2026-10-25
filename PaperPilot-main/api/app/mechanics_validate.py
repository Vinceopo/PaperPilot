"""Validate format-mechanics documents against the required sample schema.

A guide must keep every category and field label. Values must be real or IGNORE
(case-insensitive). Blank / N/A / NA are not allowed in the uploaded file.
"""

from __future__ import annotations

import re
from typing import Any

# Mirrors api/app/documents.py _SAMPLE_SECTIONS (strict labels).
MECHANICS_SCHEMA: tuple[dict[str, Any], ...] = (
    {
        "id": "margins",
        "title": "Margins (in inches)",
        "fields": (
            {"id": "top", "label": "Top", "example": "1", "rule": ("margins_inches", "top")},
            {"id": "left", "label": "Left", "example": "1", "rule": ("margins_inches", "left")},
            {"id": "bottom", "label": "Bottom", "example": "1", "rule": ("margins_inches", "bottom")},
            {"id": "right", "label": "Right", "example": "1", "rule": ("margins_inches", "right")},
            {"id": "gutter", "label": "Gutter", "example": "0", "rule": ("margins_inches", "gutter")},
            {"id": "header", "label": "Header", "example": "0.5", "rule": ("margins_inches", "header")},
            {"id": "footer", "label": "Footer", "example": "0.5", "rule": ("margins_inches", "footer")},
        ),
    },
    {
        "id": "paper",
        "title": "Paper",
        "fields": (
            {"id": "size", "label": "Size", "example": "8.5 x 11", "rule": ("paper", "size")},
            {
                "id": "orientation",
                "label": "Orientation",
                "example": "Portrait",
                "rule": ("paper", "orientation"),
            },
            {
                "id": "substance",
                "label": "Substance",
                "example": "20",
                "rule": ("paper", "substance"),
            },
            {"id": "spacing", "label": "Spacing", "example": "Double", "rule": ("spacing",)},
            {
                "id": "word_spacing",
                "label": "Word spacing",
                "example": "One space between words and after periods",
                "rule": ("word_spacing",),
            },
            {
                "id": "indention",
                "label": "Indention",
                "example": "0.5 inch",
                "rule": ("indention",),
            },
            {"id": "alignment", "label": "Alignment", "example": "Left", "rule": ("alignment",)},
            {
                "id": "landscape_pages",
                "label": "Landscape pages",
                "example": "Allowed for tables and figures",
                "rule": ("paper", "landscape_pages"),
            },
        ),
    },
    {
        "id": "font",
        "title": "Font",
        "fields": (
            {
                "id": "heading1_size",
                "label": "Heading 1 size",
                "example": "12 pt",
                "rule": ("font", "heading1_size"),
            },
            {
                "id": "heading2_size",
                "label": "Heading 2 size",
                "example": "12 pt",
                "rule": ("font", "heading2_size"),
            },
            {
                "id": "body_size",
                "label": "Body text size",
                "example": "12 pt",
                "rule": ("font", "body_size"),
            },
            {"id": "font_type", "label": "Font type", "example": "Times New Roman", "rule": ("font", "type")},
            {"id": "font_color", "label": "Font color", "example": "Black", "rule": ("font", "color")},
        ),
    },
    {
        "id": "heading_styles",
        "title": "Heading Styles",
        "fields": (
            {
                "id": "heading1_style",
                "label": "Heading 1 style",
                "example": "Bold, Title Case, centered",
                "rule": ("font", "heading_styles", "heading1"),
            },
            {
                "id": "heading2_style",
                "label": "Heading 2 style",
                "example": "Bold, Title Case, flush left",
                "rule": ("font", "heading_styles", "heading2"),
            },
        ),
    },
    {
        "id": "pagination",
        "title": "Pagination",
        "fields": (
            {
                "id": "page_number_position",
                "label": "Page number position",
                "example": "Top right",
                "rule": ("pagination", "position"),
            },
            {
                "id": "title_page",
                "label": "Title page",
                "example": "Number shown",
                "rule": ("pagination", "title_page"),
            },
            {
                "id": "first_page_of_chapter",
                "label": "First page of each chapter",
                "example": "Same position as other pages",
                "rule": ("pagination", "first_page_of_chapter"),
            },
            {
                "id": "body_numbering",
                "label": "Body numbering",
                "example": "Arabic, continuous",
                "rule": ("pagination", "body_numbering"),
            },
            {
                "id": "chapter_starts",
                "label": "Chapter starts",
                "example": "CHAPTER I, CHAPTER II…; Chapter 1, Chapter 2…",
                "rule": ("pagination", "chapter_markers"),
            },
        ),
    },
    {
        "id": "page_breaks",
        "title": "Page Breaks",
        "fields": (),
        "free_text": True,
        "example": "Only to start each new chapter and the reference list",
        "rule": ("page_break_requirements",),
    },
    {
        "id": "table_layout",
        "title": "Table Layout",
        "fields": (),
        "free_text": True,
        "example": (
            "Table number in bold, with the title in italic title case on the next line, "
            "both placed above it"
        ),
        "rule": ("table_layout_requirements",),
    },
    {
        "id": "figure_layout",
        "title": "Figure Layout",
        "fields": (),
        "free_text": True,
        "example": (
            "Figure number in bold, with the title in italic title case on the next line, "
            "both placed above the image"
        ),
        "rule": ("figure_layout_requirements",),
    },
    {
        "id": "citation_format",
        "title": "Citation Format",
        "fields": (
            {
                "id": "citation_style",
                "label": "Citation style",
                "example": "APA",
                "rule": ("citation_style",),
            },
        ),
    },
)

_FORBIDDEN_PLACEHOLDERS = frozenset(
    {
        "",
        "na",
        "n/a",
        "n.a.",
        "n.a",
        "not applicable",
        "none",
        "-",
        "—",
    }
)

_IGNORE_RE = re.compile(r"^ignore$", re.I)
_LABEL_VALUE_RE = re.compile(
    r"(?im)^[ \t]*(?P<label>[^:\n]{1,80}?)\s*:\s*(?P<value>.*?)\s*$"
)


def is_ignore_value(value: Any) -> bool:
    return bool(_IGNORE_RE.match(str(value or "").strip()))


def is_forbidden_placeholder(value: Any) -> bool:
    text = " ".join(str(value or "").split()).lower()
    return text in _FORBIDDEN_PLACEHOLDERS


def _norm_heading(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).lower()


def _rule_has_path(rules: dict | None, path: tuple[str, ...]) -> bool:
    """True when the saved/edited rules already cover this schema field (not IGNORE)."""
    if not path or not isinstance(rules, dict):
        return False
    cursor: Any = rules
    for key in path:
        if not isinstance(cursor, dict) or key not in cursor:
            return False
        cursor = cursor[key]
    if cursor is None:
        return False
    if isinstance(cursor, list):
        return any(str(item).strip() and not is_ignore_value(item) for item in cursor)
    if isinstance(cursor, dict):
        return bool(cursor)
    text = str(cursor).strip()
    return bool(text) and not is_ignore_value(text)


def _lines_with_pages(text: str, pages: list[dict] | None = None) -> list[dict]:
    """Flatten document text into [{page, line, text}, ...] for location mapping."""
    if pages:
        out: list[dict] = []
        for index, page in enumerate(pages):
            page_num = int(page.get("page_index", index)) + 1
            page_text = str(page.get("text") or "")
            if not page_text.strip():
                continue
            for line_idx, line in enumerate(page_text.splitlines()):
                out.append({"page": page_num, "line": line_idx + 1, "text": line})
        if out:
            return out

    out = []
    for line_idx, line in enumerate(str(text or "").splitlines()):
        out.append({"page": 1, "line": line_idx + 1, "text": line})
    return out


_OUTLINE_PREFIX_RE = re.compile(
    r"^(?:[a-z]|[ivxlcdm]+|\d+)[.)]\s+",
    re.I,
)


# School guides often use "Typeface" for the Font category.
_TITLE_ALIASES: dict[str, frozenset[str]] = {
    "font": frozenset({"font", "typeface"}),
}


def _title_aliases(title: str) -> frozenset[str]:
    want = _norm_heading(title).rstrip(".:")
    return _TITLE_ALIASES.get(want, frozenset({want}))


_INLINE_TITLE_VALUE_RE_CACHE: dict[str, re.Pattern[str]] = {}


def _inline_title_value_re(alias: str) -> re.Pattern[str]:
    """Match \"Title\", \"Title:\", or \"Title - value\" but not \"Title type: …\"."""
    cached = _INLINE_TITLE_VALUE_RE_CACHE.get(alias)
    if cached:
        return cached
    pattern = re.compile(rf"^{re.escape(alias)}(?:\s*[:\-—–].*)?$", re.I)
    _INLINE_TITLE_VALUE_RE_CACHE[alias] = pattern
    return pattern


def _heading_matches_title(text: str, title: str) -> bool:
    """True for exact titles, aliases (Font↔Typeface), and outline forms like \"f. Pagination\".

    Also matches inline guide lines such as \"A. Typeface - Arial…\" or \"Font: Times…\",
    without treating field labels like \"Font type\" as the Font category heading.
    """
    aliases = _title_aliases(title)
    got = _norm_heading(text).rstrip(".:")
    if not aliases or not got:
        return False
    if got in aliases:
        return True
    stripped = _OUTLINE_PREFIX_RE.sub("", got).strip()
    if stripped in aliases:
        return True
    for alias in aliases:
        if _inline_title_value_re(alias).match(stripped) or _inline_title_value_re(alias).match(got):
            return True
    return False


def _field_is_optional(category: str, field_id: str) -> bool:
    """Heading sizes/styles are optional — Format Fields only require them when added."""
    if category == "font" and field_id in {"heading1_size", "heading2_size"}:
        return True
    if category == "heading_styles" and field_id in {"heading1_style", "heading2_style"}:
        return True
    return False


def _find_heading_index(lines: list[dict], title: str) -> int | None:
    for index, row in enumerate(lines):
        if _heading_matches_title(row["text"], title):
            return index
    return None


def _section_bounds(lines: list[dict], start: int, titles: set[str]) -> tuple[int, int]:
    end = len(lines)
    for index in range(start + 1, len(lines)):
        text = lines[index]["text"]
        if any(_heading_matches_title(text, title) for title in titles) and index != start:
            end = index
            break
    return start, end


def _section_body(lines: list[dict], start: int, end: int) -> str:
    parts = [str(row["text"]).strip() for row in lines[start + 1 : end] if str(row["text"]).strip()]
    return "\n".join(parts).strip()


def _location_for(row: dict | None, *, excerpt: str = "", severity: str = "critical") -> dict:
    if not row:
        return {
            "page": 1,
            "line": 1,
            "excerpt": excerpt[:240],
            "severity": severity,
            "section": "Mechanics",
        }
    return {
        "page": row.get("page") or 1,
        "line": row.get("line"),
        "excerpt": (excerpt or str(row.get("text") or ""))[:240],
        "severity": severity,
        "section": "Mechanics",
    }


def _issue(
    *,
    code: str,
    category: str,
    field: str,
    message: str,
    location: dict,
    severity: str = "critical",
) -> dict:
    return {
        "id": f"{category}:{field}:{code}",
        "category": category,
        "field": field,
        "code": code,
        "message": message,
        "severity": severity,
        "location": location,
    }


def _parse_labeled_values(section_lines: list[dict]) -> dict[str, tuple[str, dict]]:
    """Map normalized label -> (value, line_row) within a section."""
    found: dict[str, tuple[str, dict]] = {}
    for row in section_lines:
        match = _LABEL_VALUE_RE.match(str(row.get("text") or ""))
        if not match:
            continue
        label = _norm_heading(match.group("label"))
        value = str(match.group("value") or "").strip()
        found[label] = (value, row)
    return found


def validate_mechanics_document(
    text: str,
    *,
    pages: list[dict] | None = None,
    rules: dict | None = None,
) -> dict:
    """Return ``{ ok, issues }`` for a mechanics guide body.

    Issues already covered by non-empty ``rules`` (form IGNORE cleared by filling,
    or field set after extract) are omitted so the user can resolve via Format Fields.
    """
    lines = _lines_with_pages(text, pages)
    titles = {_norm_heading(section["title"]).rstrip(".:") for section in MECHANICS_SCHEMA}
    issues: list[dict] = []

    for section in MECHANICS_SCHEMA:
        category = section["id"]
        title = section["title"]
        fields = section.get("fields") or ()
        free_text = bool(section.get("free_text"))
        example = str(section.get("example") or "")
        rule_path = tuple(section.get("rule") or ())

        heading_idx = _find_heading_index(lines, title)
        if heading_idx is None:
            # Whole-category IGNORE is only possible when the heading exists.
            # If rules already cover every required field (or free-text rule), skip.
            if free_text and _rule_has_path(rules, rule_path):
                continue
            if fields and all(
                _field_is_optional(category, field["id"])
                or _rule_has_path(rules, tuple(field["rule"]))
                for field in fields
            ):
                continue
            issues.append(
                _issue(
                    code="missing_category",
                    category=category,
                    field="",
                    message=f'Missing label: "{title}"',
                    location=_location_for(lines[0] if lines else None, excerpt=title),
                )
            )
            continue

        start, end = _section_bounds(lines, heading_idx, titles)
        heading_row = lines[heading_idx]
        body = _section_body(lines, start, end)

        if is_ignore_value(body):
            continue

        if free_text:
            if _rule_has_path(rules, rule_path):
                continue
            if is_forbidden_placeholder(body) or not body:
                issues.append(
                    _issue(
                        code="missing_value",
                        category=category,
                        field=category,
                        message=f"Value is missing (e.g. {example})",
                        location=_location_for(heading_row, excerpt=title),
                    )
                )
            continue

        labeled = _parse_labeled_values(lines[start + 1 : end])
        for field in fields:
            field_id = field["id"]
            label = field["label"]
            field_rule = tuple(field["rule"])
            if _rule_has_path(rules, field_rule):
                continue
            key = _norm_heading(label)
            if key not in labeled:
                # Optional schema fields (heading sizes/styles) are not required
                # unless the guide actually lists them.
                if _field_is_optional(category, field_id):
                    continue
                issues.append(
                    _issue(
                        code="missing_label",
                        category=category,
                        field=field_id,
                        message=f'Missing label: "{label}" under {title}',
                        location=_location_for(heading_row, excerpt=title),
                    )
                )
                continue
            value, value_row = labeled[key]
            if is_ignore_value(value):
                continue
            if is_forbidden_placeholder(value):
                issues.append(
                    _issue(
                        code="missing_value",
                        category=category,
                        field=field_id,
                        message=f"Value is missing (e.g. {label}: {field['example']})",
                        location=_location_for(value_row, excerpt=str(value_row.get("text") or "")),
                    )
                )

    return {"ok": len(issues) == 0, "issues": issues}


def _ignored_set(ignored_fields: list[str] | None) -> set[str]:
    out: set[str] = set()
    for item in ignored_fields or []:
        key = str(item or "").strip().lower()
        if key:
            out.add(key)
    return out


def _issue_ignored(issue: dict, ignored: set[str]) -> bool:
    category = str(issue.get("category") or "").strip().lower()
    field = str(issue.get("field") or "").strip().lower()
    if not category:
        return False
    if f"{category}:{field}" in ignored:
        return True
    if not field:
        section = next((item for item in MECHANICS_SCHEMA if item["id"] == category), None)
        if section and section.get("free_text"):
            return f"{category}:{category}" in ignored
        fields = [str(item["id"]).lower() for item in (section or {}).get("fields") or ()]
        return bool(fields) and all(f"{category}:{field_id}" in ignored for field_id in fields)
    return False


def _heading_style_optional_covered(
    category: str, field_id: str, rules: dict | None, ignored: set[str]
) -> bool:
    """Heading Styles labels are optional once the matching heading size is set or IGNORE.

    School guides often list Heading 1/2 sizes under Font without a separate
    \"Heading Styles\" section. Extra heading levels (H3+) are never required.
    """
    if category != "heading_styles":
        return False
    size_key = {
        "heading1_style": "heading1_size",
        "heading2_style": "heading2_size",
    }.get(field_id)
    if not size_key:
        return False
    if f"font:{size_key}" in ignored or f"heading_styles:{field_id}" in ignored:
        return True
    font = rules.get("font") if isinstance(rules, dict) else None
    if not isinstance(font, dict):
        return False
    return font.get(size_key) not in (None, "", [], {})


def _optional_field_covered(
    category: str, field_id: str, rules: dict | None, ignored: set[str]
) -> bool:
    """Optional schema fields clear when ignored, filled, or simply not required."""
    if _heading_style_optional_covered(category, field_id, rules, ignored):
        return True
    if not _field_is_optional(category, field_id):
        return False
    if f"{category}:{field_id}" in ignored:
        return True
    # Font heading sizes: optional unless the user filled them (then covered via rules).
    if category == "font" and field_id in {"heading1_size", "heading2_size"}:
        return True
    return False


def filter_issues_for_rules(
    validation: dict,
    rules: dict | None,
    ignored_fields: list[str] | None = None,
) -> dict:
    """Re-check which document issues remain after Format Fields edits / IGNORE."""
    text_issues = validation.get("issues") if isinstance(validation, dict) else None
    if not isinstance(text_issues, list):
        return {"ok": True, "issues": []}
    ignored = _ignored_set(ignored_fields)
    remaining = []
    for issue in text_issues:
        if _issue_ignored(issue, ignored):
            continue
        category = issue.get("category")
        field = issue.get("field") or ""
        section = next((item for item in MECHANICS_SCHEMA if item["id"] == category), None)
        if not section:
            remaining.append(issue)
            continue
        if section.get("free_text"):
            path = tuple(section.get("rule") or ())
            if _rule_has_path(rules, path) or f"{category}:{category}" in ignored:
                continue
            remaining.append(issue)
            continue
        match = next((item for item in (section.get("fields") or ()) if item["id"] == field), None)
        if match and (
            _rule_has_path(rules, tuple(match["rule"]))
            or f"{category}:{match['id']}" in ignored
            or _optional_field_covered(category, match["id"], rules, ignored)
        ):
            continue
        # Category-level issue (e.g. missing "Pagination") clears when every
        # Format Field is either filled, optional, or explicitly IGNORE.
        if not field and section.get("fields"):
            if all(
                _rule_has_path(rules, tuple(item["rule"]))
                or f"{category}:{item['id']}" in ignored
                or _optional_field_covered(category, item["id"], rules, ignored)
                for item in section["fields"]
            ):
                continue
        remaining.append(issue)
    return {"ok": len(remaining) == 0, "issues": remaining}


def assert_mechanics_rules_ready(rules: dict | None) -> None:
    """Raise ValueError when saved rules are empty (nothing to scan against)."""
    if not isinstance(rules, dict) or not rules:
        raise ValueError(
            "This format has no active rules. Fill Format Fields or set IGNORE only where you "
            "intentionally skip a check, and keep at least one rule before scanning."
        )


def _pop_rule_path(rules: dict, path: tuple[str, ...]) -> None:
    """Remove a nested rule path; drop empty parent dicts."""
    if not path or not isinstance(rules, dict):
        return
    if len(path) == 1:
        rules.pop(path[0], None)
        return
    child = rules.get(path[0])
    if not isinstance(child, dict):
        return
    _pop_rule_path(child, path[1:])
    if not child:
        rules.pop(path[0], None)


def apply_ignored_fields_to_rules(
    rules: dict | None, ignored_fields: list[str] | None = None
) -> dict:
    """Return a copy of rules with IGNORE / empty Format Fields removed.

    Empty heading rows (font:heading1_size, heading_styles:…) must not remain as
    active scan rules — nothing set means that check is skipped.
    """
    import copy

    out = copy.deepcopy(rules) if isinstance(rules, dict) else {}
    ignored = _ignored_set(ignored_fields)
    if not ignored:
        return out

    for key in sorted(ignored):
        category, _, field = key.partition(":")
        section = next((item for item in MECHANICS_SCHEMA if item["id"] == category), None)
        if not section:
            continue
        if section.get("free_text"):
            path = tuple(section.get("rule") or ())
            if path and (not field or field == category):
                _pop_rule_path(out, path)
            continue
        match = next(
            (item for item in (section.get("fields") or ()) if item["id"] == field),
            None,
        )
        if match:
            _pop_rule_path(out, tuple(match["rule"]))
            continue
        # Category-level ignore: drop every field under that category.
        if not field:
            for item in section.get("fields") or ():
                _pop_rule_path(out, tuple(item["rule"]))
    return out
