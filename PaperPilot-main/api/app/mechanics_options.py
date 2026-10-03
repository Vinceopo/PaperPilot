"""Dropdown choices for Format Mechanics fields and parsers that map free text onto them.

Keep this file identical in machinelearning/app and api/app.
"""

from __future__ import annotations

import re

PAGE_POSITIONS = ("Top left", "Top center", "Top right", "Bottom left", "Bottom center", "Bottom right")

CHAPTER_FIRST_HIDDEN = "No page number shown"
CHAPTER_FIRST_SAME = "Same position as other pages"
CHAPTER_FIRST_BOTTOM_CENTER = "Bottom center"
CHAPTER_FIRST_PAGE_OPTIONS = (CHAPTER_FIRST_HIDDEN, CHAPTER_FIRST_SAME, CHAPTER_FIRST_BOTTOM_CENTER)

TITLE_HIDDEN_COUNTED = "Hidden but counted"
TITLE_HIDDEN_NOT_COUNTED = "Hidden and not counted"
TITLE_SHOWN = "Number shown"
TITLE_PAGE_OPTIONS = (TITLE_HIDDEN_COUNTED, TITLE_HIDDEN_NOT_COUNTED, TITLE_SHOWN)

PRELIM_ROMAN = "Lowercase Roman (i, ii, iii)"
PRELIM_ARABIC = "Arabic (1, 2, 3)"
PRELIMINARY_STYLE_OPTIONS = (PRELIM_ROMAN, PRELIM_ARABIC)

BODY_RESTART = "Arabic, restart at 1 on Chapter 1"
BODY_CONTINUOUS = "Arabic, continuous"
BODY_NUMBERING_OPTIONS = (BODY_RESTART, BODY_CONTINUOUS)

CHAPTER_MARKERS = {
    "chapter_roman": "CHAPTER I, CHAPTER II…",
    "chapter_arabic": "Chapter 1, Chapter 2…",
    "back_matter": "References, Bibliography, Appendices",
    "preliminary": "Preliminary headings (Abstract, Acknowledgment, Table of Contents…)",
}
DEFAULT_CHAPTER_MARKERS = ("chapter_roman", "chapter_arabic")

WORD_SPACING_SINGLE = "One space between words and after periods"
WORD_SPACING_TWO = "Two spaces after periods"
WORD_SPACING_OPTIONS = (WORD_SPACING_SINGLE, WORD_SPACING_TWO)

LANDSCAPE_NOT_ALLOWED = "Not allowed"
LANDSCAPE_TABLES_FIGURES = "Allowed for tables and figures"
LANDSCAPE_ANY = "Allowed on any page"
LANDSCAPE_OPTIONS = (LANDSCAPE_NOT_ALLOWED, LANDSCAPE_TABLES_FIGURES, LANDSCAPE_ANY)

HEADING_LEVELS = ("heading1", "heading2", "heading3")
HEADING_CASES = ("upper", "title")
HEADING_ALIGNMENTS = ("center", "left")


def _text(value) -> str:
    return " ".join(str(value or "").split()).lower()


def page_position_parts(value) -> tuple[str | None, str | None]:
    """'Top right', 'upper-right corner', 'bottom centre of the footer' -> ('top', 'right')."""
    text = _text(value)
    vertical = (
        "top" if re.search(r"\b(top|upper|header)\b", text)
        else "bottom" if re.search(r"\b(bottom|lower|footer)\b", text)
        else None
    )
    horizontal = (
        "left" if re.search(r"\bleft\b", text)
        else "right" if re.search(r"\bright\b", text)
        else "center" if re.search(r"\b(cent(?:er|re|ered|red)|middle)\b", text)
        else None
    )
    return vertical, horizontal


def canonical_page_position(value) -> str:
    vertical, horizontal = page_position_parts(value)
    if vertical and horizontal:
        return f"{vertical.title()} {horizontal}"
    return " ".join(str(value or "").split())


def canonical_chapter_first_page(value) -> str:
    text = _text(value)
    if not text:
        return ""
    if re.search(r"\b(bottom|lower|footer)\b", text) and re.search(r"cent(?:er|re)|middle", text):
        return CHAPTER_FIRST_BOTTOM_CENTER
    if re.search(r"\b(no|not|without|hidden|hide|suppress\w*|omit\w*|none)\b", text):
        return CHAPTER_FIRST_HIDDEN
    if re.search(r"\b(same|shown|show|numbered|visible|display\w*)\b", text):
        return CHAPTER_FIRST_SAME
    return " ".join(str(value).split())


def chapter_first_page_rule(value) -> str | None:
    """'hidden', 'same', 'bottom_center', or None when nothing is required."""
    canonical = canonical_chapter_first_page(value)
    if not canonical:
        return None
    if canonical == CHAPTER_FIRST_SAME:
        return "same"
    if canonical == CHAPTER_FIRST_BOTTOM_CENTER:
        return "bottom_center"
    # Older saved formats stored any wording here and meant "hide it".
    return "hidden"


def canonical_title_page(value) -> str:
    text = _text(value)
    if not text:
        return ""
    if re.search(r"not\s+(?:be\s+)?counted|uncounted|(?:does|do)\s+not\s+count|excluded", text):
        return TITLE_HIDDEN_NOT_COUNTED
    if re.search(r"\b(no|not|without|hidden|hide|suppress\w*|omit\w*|none)\b", text):
        return TITLE_HIDDEN_COUNTED
    if re.search(r"\b(shown|show|numbered|visible|display\w*)\b", text):
        return TITLE_SHOWN
    return ""


def title_page_rule(value) -> str | None:
    return {
        TITLE_HIDDEN_COUNTED: "hidden_counted",
        TITLE_HIDDEN_NOT_COUNTED: "hidden_not_counted",
        TITLE_SHOWN: "shown",
    }.get(canonical_title_page(value))


def canonical_preliminary_style(value) -> str:
    text = _text(value)
    if re.search(r"roman|\bi\s*,\s*ii\b", text):
        return PRELIM_ROMAN
    if re.search(r"arabic|\b1\s*,\s*2\b", text):
        return PRELIM_ARABIC
    return ""


def canonical_body_numbering(value) -> str:
    text = _text(value)
    if re.search(r"restart|re-start|(?:start|begin)s?\s+(?:again\s+)?(?:at|with|from)\s+(?:1|one)\b", text):
        return BODY_RESTART
    if re.search(r"continu", text):
        return BODY_CONTINUOUS
    return ""


def canonical_chapter_markers(value) -> list[str]:
    """Keys from CHAPTER_MARKERS, from a list of keys/labels or a comma/newline separated string."""
    if isinstance(value, str):
        items = [value] if value.strip() in CHAPTER_MARKERS else re.split(r"[\n;]+", value)
    elif isinstance(value, (list, tuple)):
        items = list(value)
    else:
        return []
    keys: list[str] = []
    for item in items:
        raw = str(item or "").strip()
        if not raw:
            continue
        text = raw.lower()
        if raw in CHAPTER_MARKERS:
            found = [raw]
        else:
            found = []
            if re.search(r"chapter\s+(?:i\b|ii\b|roman)", text):
                found.append("chapter_roman")
            if re.search(r"chapter\s+(?:1\b|2\b|arabic)", text):
                found.append("chapter_arabic")
            if re.search(r"reference|bibliograph|append", text):
                found.append("back_matter")
            if re.search(r"prelim|abstract|acknowledg|table of contents|dedication", text):
                found.append("preliminary")
        for key in found:
            if key not in keys:
                keys.append(key)
    return keys


def canonical_word_spacing(value) -> str:
    text = _text(value)
    if re.search(r"\b(two|2|double)\s+spaces?\b", text):
        return WORD_SPACING_TWO
    if re.search(r"\b(one|1|single)\s+space\b|no\s+double\s+spac", text):
        return WORD_SPACING_SINGLE
    return ""


def canonical_landscape_pages(value) -> str:
    text = _text(value)
    if not text:
        return ""
    if re.search(r"\b(not|never|no)\b", text):
        return LANDSCAPE_NOT_ALLOWED
    if re.search(r"table|figure|chart|wide", text):
        return LANDSCAPE_TABLES_FIGURES
    if re.search(r"\b(any|all|allowed|yes)\b", text):
        return LANDSCAPE_ANY
    return ""


def _heading_flag(value) -> bool | None:
    if isinstance(value, bool):
        return value
    text = _text(value)
    if text in {"yes", "true", "bold", "italic", "on", "required"}:
        return True
    if text in {"no", "false", "not bold", "not italic", "off", "regular", "plain"}:
        return False
    return None


def normalize_heading_styles(raw) -> dict:
    """{'heading1': {'bold': True, 'italic': False, 'case': 'upper', 'alignment': 'center'}, ...}."""
    if not isinstance(raw, dict):
        return {}
    out: dict = {}
    for level in HEADING_LEVELS:
        item = raw.get(level)
        if not isinstance(item, dict):
            continue
        style: dict = {}
        for key in ("bold", "italic"):
            flag = _heading_flag(item.get(key))
            if flag is not None:
                style[key] = flag
        case = _text(item.get("case"))
        if case in {"upper", "all caps", "uppercase", "caps"}:
            style["case"] = "upper"
        elif case in {"title", "title case"}:
            style["case"] = "title"
        alignment = _text(item.get("alignment"))
        if alignment in {"center", "centered", "centre", "centred"}:
            style["alignment"] = "center"
        elif alignment in {"left", "flush left", "left aligned"}:
            style["alignment"] = "left"
        if style:
            out[level] = style
    return out


def heading_style_from_text(value) -> dict:
    """'Bold, ALL CAPS, centered' -> {'bold': True, 'case': 'upper', 'alignment': 'center'}."""
    text = _text(value)
    if not text:
        return {}
    style: dict = {}
    if re.search(r"\bnot\s+bold\b|\bregular\b|\bplain\b", text):
        style["bold"] = False
    elif re.search(r"\bbold\b", text):
        style["bold"] = True
    if re.search(r"\bnot\s+italic", text):
        style["italic"] = False
    elif re.search(r"\bitalic", text):
        style["italic"] = True
    if re.search(r"all\s*caps|upper\s*case|capital\s+letters", text):
        style["case"] = "upper"
    elif re.search(r"title\s*case", text):
        style["case"] = "title"
    if re.search(r"cent(?:er|re)", text):
        style["alignment"] = "center"
    elif re.search(r"\bleft\b", text):
        style["alignment"] = "left"
    return style


def normalize_pagination_rules(pagination_in: dict, raw: dict) -> dict:
    """Pagination block for compliance checks from client/guide input (dict or flat keys)."""
    out: dict = {}
    position = pagination_in.get("position") or raw.get("pagination_position") or ""
    if str(position).strip():
        out["position"] = canonical_page_position(position)[:200]
    first_page = pagination_in.get("first_page_of_chapter") or raw.get("pagination_first_page_rule") or ""
    if str(first_page).strip():
        out["first_page_of_chapter"] = canonical_chapter_first_page(first_page)[:200]
    title = canonical_title_page(pagination_in.get("title_page") or raw.get("pagination_title_page"))
    if title:
        out["title_page"] = title
    prelim = canonical_preliminary_style(
        pagination_in.get("preliminary_style") or raw.get("pagination_preliminary_style")
    )
    if prelim:
        out["preliminary_style"] = prelim
    body = canonical_body_numbering(pagination_in.get("body_numbering") or raw.get("pagination_body_numbering"))
    if body:
        out["body_numbering"] = body
    markers = canonical_chapter_markers(
        pagination_in.get("chapter_markers") or raw.get("pagination_chapter_markers") or []
    )
    if markers:
        out["chapter_markers"] = markers
    return out
