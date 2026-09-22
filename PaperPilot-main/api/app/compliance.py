from __future__ import annotations

import re
from collections import defaultdict

from app.gemini_client import enrich_compliance_issues

SEVERITY_ORDER = {"critical": 0, "moderate": 1, "minor": 2}
BREAKDOWN_ORDER = ("Fonts", "Margins", "Indentation", "Spacing", "Alignment")
NAMED_PAPER = {"A4": (8.27, 11.69), "LETTER": (8.5, 11.0), "LEGAL": (8.5, 14.0)}
MAX_LOCATIONS = 20000
PT_PER_INCH = 72.0
CHROME_SOURCES = {"header", "footer"}
NON_PROSE_SOURCES = {"table", "header", "footer", "footnote", "endnote", "textbox"}


def _font_key(value: str) -> str:
    value = value.split("+")[-1]
    return re.sub(r"[^a-z0-9]", "", value.lower()).replace("psmt", "").replace("mt", "")


DECORATIVE_FONT_RE = re.compile(
    r"(emoji|symbol|wingdings|webdings|marlett|dingbat|barra?code|icon|mt\s*extra|ms\s*outlook)",
    re.I,
)


def _is_decorative_font(name: str | None) -> bool:
    return bool(name and DECORATIVE_FONT_RE.search(str(name)))


def _is_prose_font_text(text: str) -> bool:
    """True when the run has real letters/digits — not only emoji/symbols/spaces."""
    return any(ch.isalnum() for ch in text)


def _line_font_samples(unit: dict) -> list[tuple[str, float | None, int]]:
    """(font, size, weight) for prose text only; uses this line’s runs when available."""
    samples: list[tuple[str, float | None, int]] = []
    for span in unit.get("spans") or []:
        text = str(span.get("text") or "")
        if not text.strip() or not _is_prose_font_text(text):
            continue
        font = span.get("font")
        if not font or _is_decorative_font(font):
            continue
        size = span.get("size")
        samples.append((str(font), float(size) if size is not None else None, len(text.strip())))
    runs = unit.get("line_runs")
    if runs is None:
        runs = unit.get("runs") or []
    for run in runs:
        text = str(run.get("text") or "")
        if not text.strip() or not _is_prose_font_text(text):
            continue
        font = run.get("font")
        if font and _is_decorative_font(font):
            continue
        size = run.get("size")
        # Allow missing font name (inherited) but still measure size from this line’s text.
        samples.append(
            (
                str(font) if font else "inherited",
                float(size) if size is not None else None,
                len(text.strip()),
            )
        )
    return samples


def _dominant_font_sample(unit: dict) -> tuple[str | None, float | None]:
    samples = _line_font_samples(unit)
    if not samples:
        return None, None
    font_weights: dict[str, list] = defaultdict(lambda: [0, None])
    size_weights: dict[float, int] = defaultdict(int)
    for font, size, weight in samples:
        font_weights[font][0] += weight
        if size is not None:
            font_weights[font][1] = size
            size_weights[round(float(size), 2)] += weight
    font, payload = max(font_weights.items(), key=lambda item: item[1][0])
    shown_font = None if font == "inherited" else font
    shown_size = max(size_weights.items(), key=lambda item: item[1])[0] if size_weights else payload[1]
    return shown_font, shown_size


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return round(max(low, min(high, value)), 2)


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
                "_seen": set(),
                "_extra": 0,
            },
        )
        key = (location.get("page"), location.get("line"), location.get("section"))
        if key in item["_seen"]:
            return
        item["_seen"].add(key)
        if len(item["locations"]) < MAX_LOCATIONS:
            item["locations"].append(location)
        else:
            item["_extra"] += 1

    def result(self) -> list[dict]:
        issues = []
        for issue in self.items.values():
            extra = issue.pop("_extra", 0)
            issue.pop("_seen", None)
            issue["count"] = len(issue["locations"]) + extra
            issues.append(issue)
        return sorted(issues, key=lambda issue: (SEVERITY_ORDER[issue["severity"]], issue["issue_type"]))


class CategoryStats:
    def __init__(self) -> None:
        self.checked = 0
        self.failed = 0

    def observe(self, ok: bool) -> None:
        self.checked += 1
        if not ok:
            self.failed += 1

    def score(self) -> float:
        if not self.checked:
            return 100.0
        return _clamp(100.0 * (self.checked - self.failed) / self.checked)


def _location(page: int | None, line: int | None, category: str) -> dict:
    page_number = (page + 1) if page is not None else 1
    line_number = (line + 1) if line is not None else 1
    return {
        "page": max(1, page_number),
        "line": max(1, line_number),
        "section": category,
    }


def _paper_inches(parsed: dict, rules: dict) -> tuple[float, float]:
    rule = rules.get("paper_size") or {}
    if rule.get("width_inches") and rule.get("height_inches"):
        return float(rule["width_inches"]), float(rule["height_inches"])
    if rule.get("name") in NAMED_PAPER:
        return NAMED_PAPER[rule["name"]]
    if parsed.get("metadata", {}).get("format") == "pdf":
        pages = parsed.get("pages") or []
        if pages:
            return pages[0]["width_points"] / PT_PER_INCH, pages[0]["height_points"] / PT_PER_INCH
    sections = parsed.get("sections") or []
    if sections:
        width = sections[0].get("page_width_inches") or 8.5
        height = sections[0].get("page_height_inches") or 11.0
        return float(width), float(height)
    return 8.5, 11.0


def _lines_per_page(parsed: dict, rules: dict) -> int:
    width, height = _paper_inches(parsed, rules)
    del width
    margins = rules.get("margins_inches") or {}
    sections = parsed.get("sections") or [{}]
    section = sections[0] if sections else {}
    top = float(section.get("top_margin_inches") or margins.get("top") or 1.0)
    bottom = float(section.get("bottom_margin_inches") or margins.get("bottom") or 1.0)
    font = rules.get("font") or {}
    sizes = font.get("sizes_points") or []
    body = font.get("heading3_content_size")
    font_pt = float(body or (min(sizes) if sizes else 11.0))
    spacing = float(rules.get("line_spacing") or 1.5)
    usable = max(1.0, height - top - bottom)
    line_height = max(0.12, (font_pt * spacing) / PT_PER_INCH)
    return max(20, int(usable / line_height))


def _visual_chars_per_line(parsed: dict, rules: dict, source: str = "body") -> int:
    """How many characters fit on one typeable line for this page width."""
    width, _height = _paper_inches(parsed, rules)
    margins = rules.get("margins_inches") or {}
    sections = parsed.get("sections") or [{}]
    section = sections[0] if sections else {}
    left = float(section.get("left_margin_inches") or margins.get("left") or 1.0)
    right = float(section.get("right_margin_inches") or margins.get("right") or 1.0)
    usable = max(1.0, width - left - right)
    font = rules.get("font") or {}
    sizes = font.get("sizes_points") or []
    body = font.get("heading3_content_size")
    font_pt = float(body or (min(sizes) if sizes else 11.0))
    avg_char_inches = max(0.04, (font_pt * 0.5) / PT_PER_INCH)
    chars = max(20, int(usable / avg_char_inches))
    if source in {"table", "textbox", "footnote", "endnote"}:
        return max(12, chars // 2)
    return chars


def _soft_wrap_visual_lines(text: str | None, chars_per_line: int) -> list[str]:
    return [text for text, _runs in _soft_wrap_visual_lines_with_runs(text, [], chars_per_line)]


def _soft_wrap_visual_lines_with_runs(
    text: str | None,
    runs: list[dict],
    chars_per_line: int,
) -> list[tuple[str, list[dict]]]:
    """
    Typeable visual lines with the runs that actually appear on each line.
    Empty paragraph → one blank typeable line (no font measurement later).
    """
    width = max(8, int(chars_per_line))
    stream: list[tuple[str, dict | None]] = []
    if runs:
        for run in runs:
            for ch in str(run.get("text") or ""):
                stream.append((ch, run))
    else:
        for ch in ("" if text is None else str(text)):
            stream.append((ch, None))

    if not stream:
        return [("", list(runs or []))]

    def flush_hard(segment: list[tuple[str, dict | None]]) -> list[tuple[str, list[dict]]]:
        if not segment:
            return [("", [])]
        raw = "".join(ch for ch, _run in segment)
        if raw == "":
            return [("", [])]
        # Soft-wrap words while tracking which runs contributed.
        lines: list[tuple[str, list[dict]]] = []
        word_buf: list[tuple[str, dict | None]] = []
        current: list[tuple[str, dict | None]] = []

        def commit_line(chars: list[tuple[str, dict | None]]) -> None:
            line_text = "".join(ch for ch, _r in chars)
            line_runs: list[dict] = []
            seen = set()
            for _ch, run in chars:
                if run is None:
                    continue
                key = id(run)
                if key in seen:
                    continue
                seen.add(key)
                # Keep only the slice of this run that appears on this line.
                piece = "".join(ch for ch, r in chars if r is run)
                line_runs.append({**run, "text": piece})
            lines.append((line_text, line_runs))

        def emit_word(chars: list[tuple[str, dict | None]]) -> None:
            nonlocal current
            if not chars:
                return
            word_text = "".join(ch for ch, _r in chars)
            cur_text = "".join(ch for ch, _r in current)
            candidate = word_text if not cur_text else f"{cur_text} {word_text}"
            if len(candidate) <= width:
                if current and word_text:
                    # space between words belongs to no run
                    current = [*current, (" ", None), *chars]
                else:
                    current = [*current, *chars]
                return
            if current:
                commit_line(current)
                current = []
            if len(word_text) <= width:
                current = list(chars)
                return
            # Hard-break overlong token.
            start = 0
            while start < len(chars):
                chunk = chars[start : start + width]
                if len(chars) - start > width:
                    commit_line(chunk)
                else:
                    current = list(chunk)
                start += width

        for ch, run in segment:
            if ch == " ":
                emit_word(word_buf)
                word_buf = []
                continue
            if ch == "\t":
                emit_word(word_buf)
                word_buf = []
                # tabs act like spaces for wrapping width
                if current:
                    current.append((" ", None))
                continue
            word_buf.append((ch, run))
        emit_word(word_buf)
        if current or not lines:
            commit_line(current)
        return lines

    # Split on hard Enter first.
    hard_segments: list[list[tuple[str, dict | None]]] = [[]]
    for ch, run in stream:
        if ch == "\n":
            hard_segments.append([])
        elif ch == "\r":
            continue
        else:
            hard_segments[-1].append((ch, run))

    out: list[tuple[str, list[dict]]] = []
    for segment in hard_segments:
        out.extend(flush_hard(segment))
    return out if out else [("", list(runs or []))]


def _spacing_blank_lines(formatting: dict, font_pt: float, line_spacing: float) -> tuple[int, int]:
    """Convert Word space-before/after into blank typeable lines (visual gaps)."""
    line_h = max(1.0, float(font_pt) * float(line_spacing or 1.5))
    before = float(formatting.get("space_before_points") or 0.0)
    after = float(formatting.get("space_after_points") or 0.0)
    # Count full line-heights of gap the reader sees as empty lines.
    before_lines = int(before / line_h + 0.35) if before > 2 else 0
    after_lines = int(after / line_h + 0.35) if after > 2 else 0
    return before_lines, after_lines


def _docx_text_chunks(paragraph: dict) -> list[tuple[int, str, list[dict]]]:
    """(page_advances_before, text, runs_in_chunk)."""
    runs = paragraph.get("runs") or []
    if not runs:
        return [(0, paragraph.get("text") or "", [])]
    chunks: list[tuple[int, str, list[dict]]] = []
    pending_advance = 0
    buffer_runs: list[dict] = []
    for run in runs:
        advance = int(run.get("page_breaks") or 0) + int(run.get("rendered_page_breaks") or 0)
        if advance:
            if buffer_runs:
                text = "".join(str(item.get("text") or "") for item in buffer_runs)
                chunks.append((pending_advance, text, buffer_runs))
                buffer_runs = []
                pending_advance = 0
            pending_advance += advance
        buffer_runs.append(run)
    text = "".join(str(item.get("text") or "") for item in buffer_runs)
    if buffer_runs or not chunks:
        chunks.append((pending_advance, text if text else (paragraph.get("text") or ""), buffer_runs))
    return chunks


def _document_units(parsed: dict, rules: dict) -> list[dict]:
    if (parsed.get("metadata") or {}).get("format") == "pdf":
        units = []
        for page in parsed.get("pages") or []:
            page_lines = list(page.get("lines") or [])
            page_lines.sort(
                key=lambda line: (
                    (line.get("bbox") or [0, 0, 0, 0])[1],
                    (line.get("bbox") or [0, 0, 0, 0])[0],
                    line.get("line_index", 0),
                )
            )
            for line_index, line in enumerate(page_lines):
                units.append(
                    {
                        "page_index": page.get("page_index", 0),
                        "line_index": line_index,
                        "text": line.get("text") or "",
                        "spans": line.get("spans") or [],
                        "bbox": line.get("bbox"),
                        "page_width": page.get("width_points"),
                        "page_height": page.get("height_points"),
                        "formatting": {},
                        "style": None,
                        "source": "body",
                        "alignment": _pdf_alignment(line.get("bbox"), page, rules),
                    }
                )
        return units

    paragraphs = parsed.get("paragraphs") or []
    rendered_breaks = sum(
        int(run.get("rendered_page_breaks") or 0)
        for paragraph in paragraphs
        for run in (paragraph.get("runs") or [])
    )
    use_rendered = rendered_breaks > 0
    per_page = 10_000 if use_rendered else _lines_per_page(parsed, rules)
    page_index = 0
    line_on_page = 0
    units: list[dict] = []
    chrome: list[dict] = []
    font = rules.get("font") or {}
    body_pt = float(
        font.get("heading3_content_size")
        or (min(font.get("sizes_points") or [11]) if font.get("sizes_points") else 11.0)
    )
    line_spacing = float(rules.get("line_spacing") or 1.5)

    def append_unit(paragraph: dict, page: int, line: int, text: str, line_runs: list[dict]) -> None:
        nonlocal line_on_page
        formatting = paragraph.get("formatting") or {}
        units.append(
            {
                "page_index": page,
                "line_index": line,
                "text": text,
                "spans": [],
                "runs": paragraph.get("runs") or [],
                "line_runs": line_runs,
                "bbox": None,
                "page_width": None,
                "page_height": None,
                "formatting": formatting,
                "style": paragraph.get("style"),
                "source": paragraph.get("source") or "body",
                "alignment": formatting.get("alignment"),
                "paragraph_index": paragraph.get("paragraph_index"),
            }
        )

    def emit_blank(paragraph: dict, count: int) -> None:
        nonlocal page_index, line_on_page
        for _ in range(max(0, count)):
            if not use_rendered and line_on_page >= per_page:
                page_index += 1
                line_on_page = 0
            append_unit(paragraph, page_index, line_on_page, "", [])
            line_on_page += 1

    for paragraph in paragraphs:
        source = paragraph.get("source") or "body"
        if source in CHROME_SOURCES:
            chrome.append(paragraph)
            continue
        formatting = paragraph.get("formatting") or {}
        if formatting.get("page_break_before") and (line_on_page or units):
            page_index += 1
            line_on_page = 0
        chars = _visual_chars_per_line(parsed, rules, source)
        run_sizes = [float(run["size"]) for run in (paragraph.get("runs") or []) if run.get("size")]
        para_pt = run_sizes[0] if run_sizes else body_pt
        before_blanks, after_blanks = _spacing_blank_lines(formatting, para_pt, line_spacing)
        emit_blank(paragraph, before_blanks)
        for advance, chunk_text, chunk_runs in _docx_text_chunks(paragraph):
            if advance and (units or line_on_page):
                page_index += advance
                line_on_page = 0
            visual_rows = _soft_wrap_visual_lines_with_runs(chunk_text, chunk_runs, chars)
            for visual, line_runs in visual_rows:
                if not use_rendered and line_on_page >= per_page:
                    page_index += 1
                    line_on_page = 0
                append_unit(paragraph, page_index, line_on_page, visual, line_runs)
                line_on_page += 1
        emit_blank(paragraph, after_blanks)

    extra_line = 1 + max(
        (unit["line_index"] for unit in units if unit["page_index"] == 0),
        default=-1,
    )
    for paragraph in chrome:
        chars = _visual_chars_per_line(parsed, rules, paragraph.get("source") or "header")
        for visual, line_runs in _soft_wrap_visual_lines_with_runs(
            paragraph.get("text") or "", paragraph.get("runs") or [], chars
        ):
            append_unit(paragraph, 0, extra_line, visual, line_runs)
            extra_line += 1
    return units


def _pagination_meta(parsed: dict, rules: dict) -> dict:
    meta = parsed.get("metadata") or {}
    if meta.get("format") == "pdf":
        return {
            "fidelity": "pdf_source",
            "note": (
                "Line numbers count every visible text line on that page "
                "(line 1 = first line; numbers restart at 1 on every page)."
            ),
        }
    rendered = int(meta.get("rendered_page_break_count") or 0)
    if rendered <= 0:
        rendered = sum(
            int(run.get("rendered_page_breaks") or 0)
            for paragraph in (parsed.get("paragraphs") or [])
            for run in (paragraph.get("runs") or [])
        )
    if rendered > 0:
        return {
            "fidelity": "word_rendered",
            "note": (
                "Line numbers count every typeable visual line on the page "
                "(Enter, wrapped lines, and spacing gaps), restarting at 1 each page. "
                "Font size is measured only from the text on that line. "
                "Pages follow Word’s last saved page breaks."
            ),
        }
    return {
        "fidelity": "estimated",
        "note": (
            "Line numbers count every typeable visual line (Enter, wraps, spacing gaps), "
            f"restarting at 1 each page. Pages estimated (~{_lines_per_page(parsed, rules)} lines/page). "
            "Font size is measured only from the text on that line. "
            "Upload a PDF, or open/save the DOCX in Word, for exact page breaks."
        ),
    }


def _pdf_alignment(bbox, page: dict, rules: dict) -> str | None:
    if not bbox or len(bbox) < 4 or not page.get("width_points"):
        return None
    width = float(page["width_points"])
    margins = rules.get("margins_inches") or {}
    left_pts = float(margins.get("left") or 1.0) * PT_PER_INCH
    right_pts = float(margins.get("right") or 1.0) * PT_PER_INCH
    x0, _y0, x1, _y1 = bbox
    left_gap = x0 - left_pts
    right_gap = width - right_pts - x1
    if abs(left_gap - right_gap) <= 14 and min(left_gap, right_gap) > 20:
        return "center"
    if right_gap <= 14 and left_gap > 20:
        return "right"
    if left_gap <= 14 and right_gap <= 14:
        return "justify"
    return "left"


def _line_fonts(unit: dict) -> list[tuple[str | None, float | None]]:
    return [(font, size) for font, size, _weight in _line_font_samples(unit)]


SIZE_TOLERANCE = 0.75
MARGIN_TOLERANCE = 0.15  # inches — Word/PDF rounding and printer offsets
PAGE_NUMBER_RE = re.compile(r"^(?:page\s+)?\d{1,4}(?:\s*[/\-]\s*\d{1,4})?$", re.I)
CHAPTER_RE = re.compile(r"^(?:chapter|ch\.?)\s+(?:\d+|[ivxlcdm]+)\b", re.I)
TABLE_CAPTION_RE = re.compile(r"^\s*table\s+\d+\b", re.I)
FIGURE_CAPTION_RE = re.compile(r"^\s*figure\s+\d+\b", re.I)
IN_TEXT_NUMERIC_RE = re.compile(r"\[(?:\d+)(?:\s*[-,]\s*\d+)*\]")
IN_TEXT_APA_RE = re.compile(
    r"\([A-Z][A-Za-z'’-]+(?:\s+(?:et al\.|&\s+[A-Z][A-Za-z'’-]+))?,?\s+\d{4}[a-z]?(?:,\s*p+\.\s*\d+)?\)"
)
IN_TEXT_MLA_RE = re.compile(r"\([A-Z][A-Za-z'’-]+(?:\s+and\s+[A-Z][A-Za-z'’-]+)?\s+\d{1,3}\)")
REFERENCE_HEADER_RE = re.compile(r"^(references|bibliography|works cited|literature cited)$", re.I)


def _is_body_line(unit: dict) -> bool:
    text = (unit.get("text") or "").strip()
    return len(text) >= 8


def _dominant_size(unit: dict) -> float | None:
    _, size = _dominant_font_sample(unit)
    if size is not None:
        return size
    sizes = [size for _font, size in _line_fonts(unit) if size]
    return max(sizes) if sizes else None


def _is_bold(unit: dict) -> bool:
    runs = unit.get("line_runs")
    if runs is None:
        runs = unit.get("runs") or []
    return any(span.get("bold") for span in unit.get("spans") or []) or any(
        run.get("bold") for run in runs
    )


def _is_running_edge(unit: dict, rules: dict) -> bool:
    bbox = unit.get("bbox")
    height = unit.get("page_height")
    if not bbox or not height or len(bbox) < 4:
        return False
    margins = rules.get("margins_inches") or {}
    header = float(margins.get("header") or 0.5) * PT_PER_INCH
    footer = float(margins.get("footer") or 0.5) * PT_PER_INCH
    return bbox[1] <= header + 10 or bbox[3] >= height - footer - 10


def _size_matches(actual: float | None, expected: float | None) -> bool:
    if actual is None or expected is None:
        return True
    return abs(float(actual) - float(expected)) <= SIZE_TOLERANCE


def _annotate_roles(units: list[dict], rules: dict) -> None:
    font = rules.get("font") or {}
    h1 = font.get("heading1_size")
    h2 = font.get("heading2_size")
    body = font.get("heading3_content_size")
    for unit in units:
        text = (unit.get("text") or "").strip()
        style = str(unit.get("style") or "").lower()
        size = _dominant_size(unit)
        unit["dominant_size"] = size
        if not text:
            unit["role"] = "empty"
            continue
        if PAGE_NUMBER_RE.match(text) or _is_running_edge(unit, rules):
            unit["role"] = "pagination"
            continue
        if re.search(r"heading\s*1|^title$", style):
            unit["role"] = "heading1"
            continue
        if re.search(r"heading\s*2", style):
            unit["role"] = "heading2"
            continue
        if re.search(r"heading\s*3", style):
            unit["role"] = "body"
            continue
        if TABLE_CAPTION_RE.match(text) or FIGURE_CAPTION_RE.match(text):
            unit["role"] = "caption"
            continue
        if size is not None and (h1 or h2 or body):
            distances = []
            if h1 is not None:
                distances.append(("heading1", abs(size - float(h1))))
            if h2 is not None:
                distances.append(("heading2", abs(size - float(h2))))
            if body is not None:
                distances.append(("body", abs(size - float(body))))
            role, dist = min(distances, key=lambda item: item[1])
            body_dist = abs(size - float(body)) if body is not None else 99
            heading_like = len(text) <= 90 and (
                _is_bold(unit) or (text.isupper() and len(text.split()) <= 12)
            )
            if role in {"heading1", "heading2"} and dist <= SIZE_TOLERANCE and heading_like:
                unit["role"] = role
                continue
            if role in {"heading1", "heading2"} and dist + 0.35 < body_dist and heading_like:
                unit["role"] = role
                continue
        if len(text) <= 80 and (_is_bold(unit) or (text.isupper() and 1 <= len(text.split()) <= 12)):
            unit["role"] = "heading1" if CHAPTER_RE.match(text) or text.isupper() else "heading2"
            continue
        unit["role"] = "body"


def _expected_size_for_role(role: str, font: dict) -> float | None:
    if role == "heading1":
        return font.get("heading1_size")
    if role == "heading2":
        return font.get("heading2_size")
    if role in {"body", "caption"}:
        return font.get("heading3_content_size")
    return None


def _check_fonts(units: list[dict], rules: dict, stats: CategoryStats, collector: IssueCollector) -> None:
    font_rule = rules.get("font") or {}
    allowed_fonts = {_font_key(font) for font in font_rule.get("families", [])}
    listed_sizes = {round(float(size), 2) for size in font_rule.get("sizes_points", [])}
    role_sizes = any(font_rule.get(key) for key in ("heading1_size", "heading2_size", "heading3_content_size"))
    if not allowed_fonts and not listed_sizes and not role_sizes:
        return
    for unit in units:
        role = unit.get("role") or "body"
        text = (unit.get("text") or "").strip()
        # Blank / spacing lines are typeable but have no glyphs to measure.
        if not text or role in {"empty", "pagination"}:
            continue
        shown_font, sample_size = _dominant_font_sample(unit)
        if not shown_font and sample_size is None and not _line_font_samples(unit):
            continue
        shown_size = unit.get("dominant_size")
        if shown_size is None:
            shown_size = sample_size
        family_ok = True
        if allowed_fonts and shown_font and not any(
            allowed in _font_key(shown_font) or _font_key(shown_font) in allowed for allowed in allowed_fonts
        ):
            family_ok = False
        expected_size = _expected_size_for_role(role, font_rule) if role_sizes else None
        if expected_size is not None:
            size_ok = _size_matches(shown_size, expected_size)
        elif listed_sizes and shown_size is not None:
            size_ok = any(abs(shown_size - allowed) <= SIZE_TOLERANCE for allowed in listed_sizes)
        else:
            size_ok = True
        if shown_font is None and shown_size is None:
            continue
        # Family unknown (inherited) with a measured size: still score size only.
        if shown_font is None:
            family_ok = True
        stats.observe(family_ok and size_ok)
        loc = _location(unit["page_index"], unit["line_index"], "Fonts")
        if not family_ok:
            collector.add(
                "font_family",
                "critical",
                "Font family differs",
                "Text uses a font family not listed by the uploaded format mechanics.",
                f"Measured font is “{shown_font}”; the format requires {', '.join(font_rule.get('families') or [])}.",
                "Apply the format-mechanics font family to this text.",
                loc,
            )
        if not size_ok and shown_size is not None:
            role_label = {"heading1": "Heading 1", "heading2": "Heading 2", "caption": "caption", "body": "body text"}.get(
                role, "text"
            )
            expected_label = expected_size if expected_size is not None else sorted(listed_sizes)
            collector.add(
                "font_size",
                "critical",
                f"{role_label} font size differs",
                f"This {role_label} does not use the point size required by the uploaded format.",
                (
                    f"Measured {shown_size:g} pt on this line’s text; "
                    f"the format specifies {expected_label} pt for {role_label}."
                ),
                f"Select this line’s text and set the font size to {expected_label} pt.",
                loc,
            )


def _expected_paper(rules: dict) -> tuple[float, float] | None:
    rule = rules.get("paper_size") or {}
    if rule.get("width_inches") and rule.get("height_inches"):
        return float(rule["width_inches"]), float(rule["height_inches"])
    if rule.get("name") in NAMED_PAPER:
        return NAMED_PAPER[rule["name"]]
    return None


def _page_sources(parsed: dict) -> list[tuple[int | None, float | None, float | None, dict]]:
    if (parsed.get("metadata") or {}).get("format") == "pdf":
        return [
            (
                page.get("page_index", 0),
                page.get("width_points", 0) / PT_PER_INCH,
                page.get("height_points", 0) / PT_PER_INCH,
                page,
            )
            for page in parsed.get("pages") or []
        ]
    return [
        (
            index,
            section.get("page_width_inches"),
            section.get("page_height_inches"),
            section,
        )
        for index, section in enumerate(parsed.get("sections") or [{}])
    ]


def _pdf_body_lines(page: dict, rules: dict) -> list[dict]:
    """Body text only — ignore page numbers and header/footer bands for margin measure."""
    width = page.get("width_points")
    height = page.get("height_points")
    if not width or not height:
        return []
    margins = rules.get("margins_inches") or {}
    header_band = float(margins.get("header") or 0.5) * PT_PER_INCH + 14
    footer_band = float(margins.get("footer") or 0.5) * PT_PER_INCH + 14
    body: list[dict] = []
    fallback: list[dict] = []
    for line in page.get("lines") or []:
        bbox = line.get("bbox")
        if not bbox or len(bbox) < 4:
            continue
        text = (line.get("text") or "").strip()
        if not text or PAGE_NUMBER_RE.match(text):
            continue
        fallback.append(line)
        if bbox[1] <= header_band or bbox[3] >= height - footer_band:
            continue
        body.append(line)
    return body if len(body) >= 2 else fallback


def _pdf_page_margins(page: dict, rules: dict | None = None) -> dict[str, float] | None:
    width = page.get("width_points")
    height = page.get("height_points")
    lines = _pdf_body_lines(page, rules or {})
    if not lines or not width or not height:
        return None
    left = min(line["bbox"][0] for line in lines) / PT_PER_INCH
    right = (width - max(line["bbox"][2] for line in lines)) / PT_PER_INCH
    top = min(line["bbox"][1] for line in lines) / PT_PER_INCH
    bottom = (height - max(line["bbox"][3] for line in lines)) / PT_PER_INCH
    return {
        "left": round(left, 3),
        "right": round(right, 3),
        "top": round(top, 3),
        "bottom": round(bottom, 3),
    }


def _margin_delta(actual: float, expected: float, pdf_clearance: bool) -> float:
    """Positive = how far the margin fails the rule; 0 = within tolerance."""
    if pdf_clearance:
        # PDF text clearance: larger than required is fine; only too-small fails.
        deficit = expected - actual
        return max(0.0, deficit - MARGIN_TOLERANCE)
    return max(0.0, abs(actual - expected) - MARGIN_TOLERANCE)


def _margin_severity(delta: float) -> str:
    if delta <= 0.2:
        return "minor"
    if delta <= 0.45:
        return "moderate"
    return "critical"


def _check_margins(parsed: dict, units: list[dict], rules: dict, stats: CategoryStats, collector: IssueCollector) -> None:
    expected = _expected_paper(rules)
    expected_margins = {
        side: float(value)
        for side, value in (rules.get("margins_inches") or {}).items()
        if side in {"top", "bottom", "left", "right"} and value is not None
    }
    if not expected and not expected_margins:
        return

    page_first_line = {}
    for unit in units:
        page_first_line.setdefault(unit["page_index"], unit["line_index"])

    is_pdf = (parsed.get("metadata") or {}).get("format") == "pdf"

    for page, width, height, source in _page_sources(parsed):
        loc = _location(page if page is not None else 0, page_first_line.get(page or 0, 0), "Margins")

        # Paper size is reported under Margins but MUST NOT zero the margin score.
        if expected and width is not None and height is not None:
            orientation = str((rules.get("paper") or {}).get("orientation") or "").strip().lower()
            direct = abs(width - expected[0]) <= 0.15 and abs(height - expected[1]) <= 0.15
            rotated = abs(width - expected[1]) <= 0.15 and abs(height - expected[0]) <= 0.15
            if not (direct or rotated):
                collector.add(
                    "paper_size",
                    "critical",
                    "Paper size differs",
                    "The document page dimensions do not match the uploaded format mechanics.",
                    (
                        f"Measured page size is {width:.2f} × {height:.2f} inches; "
                        f"the format requires {expected[0]:.2f} × {expected[1]:.2f} inches."
                    ),
                    "In Page Setup, set the paper size to the format-mechanics dimensions.",
                    loc,
                )
            elif orientation in {"landscape", "portrait"} and (
                (orientation == "landscape" and width < height - 0.05)
                or (orientation == "portrait" and height < width - 0.05)
            ):
                collector.add(
                    "paper_orientation",
                    "moderate",
                    "Paper orientation differs",
                    "The page orientation does not match the uploaded format mechanics.",
                    f"Measured {width:.2f} × {height:.2f} inches; the format requires {orientation}.",
                    f"Set the document orientation to {orientation} in Page Setup.",
                    loc,
                )

        if is_pdf:
            actual_margins = _pdf_page_margins(source, rules)
        else:
            actual_margins = {
                side: source.get(f"{side}_margin_inches")
                for side in ("top", "bottom", "left", "right")
            }

        if not expected_margins or not actual_margins:
            continue

        # Score each side on its own so one mismatch cannot force Margins to 0%.
        for side, expected_value in expected_margins.items():
            actual = actual_margins.get(side)
            if actual is None:
                continue
            actual = float(actual)
            delta = _margin_delta(actual, expected_value, pdf_clearance=is_pdf)
            side_ok = delta <= 0
            stats.observe(side_ok)
            if side_ok:
                continue
            severity = _margin_severity(delta)
            if is_pdf:
                detail = (
                    f"Body text on this page starts about {actual:g}\" from the {side} edge "
                    f"(clearance). The format requires at least {expected_value:g}\". "
                    f"Shortfall after tolerance: {delta:.2f}\"."
                )
                advice = (
                    f"Increase the {side} page margin so body text stays at least "
                    f"{expected_value:g}\" from the {side} edge (headers/footers excluded)."
                )
            else:
                detail = (
                    f"This section’s {side} margin is set to {actual:g}\" in the document; "
                    f"the uploaded format requires {expected_value:g}\" "
                    f"(difference {abs(actual - expected_value):.2f}\" beyond {MARGIN_TOLERANCE}\" tolerance)."
                )
                advice = (
                    f"In Page Setup → Margins, set {side} to exactly {expected_value:g} inches "
                    f"to match the format mechanics."
                )
            collector.add(
                f"{side}_margin",
                severity,
                f"{side.title()} margin differs",
                f"The {side} margin does not match the uploaded format mechanics.",
                detail,
                advice,
                loc,
            )


def _pdf_line_spacing(units: list[dict]) -> dict[tuple[int, int], float]:
    measured: dict[tuple[int, int], float] = {}
    by_page: dict[int, list[dict]] = defaultdict(list)
    for unit in units:
        if unit.get("bbox") and len(unit["bbox"]) >= 4:
            by_page[unit["page_index"]].append(unit)
    for page_units in by_page.values():
        page_units.sort(key=lambda item: item["bbox"][1])
        for current, nxt in zip(page_units, page_units[1:]):
            font_size = 11.0
            for span in current.get("spans") or []:
                if span.get("size"):
                    font_size = float(span["size"])
                    break
            gap = float(nxt["bbox"][1]) - float(current["bbox"][1])
            if font_size > 0 and gap > 0:
                ratio = round(gap / font_size, 2)
                if 0.8 <= ratio <= 2.6:
                    measured[(current["page_index"], current["line_index"])] = ratio
    return measured


def _is_prose_body(unit: dict) -> bool:
    return (unit.get("source") or "body") not in NON_PROSE_SOURCES and (unit.get("role") or "body") == "body"


def _check_spacing(units: list[dict], rules: dict, stats: CategoryStats, collector: IssueCollector) -> None:
    expected = rules.get("line_spacing")
    if expected is None:
        return
    expected = float(expected)
    pdf_spacing = _pdf_line_spacing(units)
    seen_paragraphs: set[int] = set()
    for unit in units:
        if not _is_prose_body(unit):
            continue
        actual = (unit.get("formatting") or {}).get("line_spacing")
        if actual is None:
            actual = pdf_spacing.get((unit["page_index"], unit["line_index"]))
        if actual is None:
            continue
        marker = id(unit.get("formatting")) if unit.get("formatting") else (unit["page_index"], unit["line_index"])
        if marker in seen_paragraphs and unit.get("formatting"):
            continue
        seen_paragraphs.add(marker)
        ok = abs(float(actual) - expected) <= 0.12
        stats.observe(ok)
        if not ok:
            collector.add(
                "line_spacing",
                "moderate",
                "Line spacing differs",
                "Line spacing does not match the mechanics.",
                f"This line uses {float(actual):g} line spacing; the mechanics specifies {expected:g}.",
                "Set the paragraph line spacing to the mechanics-specified value.",
                _location(unit["page_index"], unit["line_index"], "Spacing"),
            )


def _paragraph_starts(units: list[dict]) -> set[tuple[int, int]]:
    starts: set[tuple[int, int]] = set()
    previous = None
    for unit in units:
        text = (unit.get("text") or "").strip()
        key = (unit["page_index"], unit["line_index"])
        if not text:
            previous = unit
            continue
        if previous is None or previous["page_index"] != unit["page_index"]:
            starts.add(key)
        elif not (previous.get("text") or "").strip():
            starts.add(key)
        elif len((previous.get("text") or "").strip()) < 40:
            starts.add(key)
        previous = unit
    return starts


def _measured_indent(unit: dict, rules: dict) -> float | None:
    indent = (unit.get("formatting") or {}).get("first_line_indent_inches")
    if indent is not None:
        return float(indent)
    bbox = unit.get("bbox")
    if not bbox or not unit.get("page_width"):
        return None
    margins = rules.get("margins_inches") or {}
    left = float(margins.get("left") or 1.0)
    return round((float(bbox[0]) / PT_PER_INCH) - left, 3)


def _check_indentation(units: list[dict], rules: dict, stats: CategoryStats, collector: IssueCollector) -> None:
    expected = rules.get("first_line_indent_inches")
    if expected is None:
        return
    expected = float(expected)
    starts = _paragraph_starts(units)
    for unit in units:
        if not _is_prose_body(unit):
            continue
        if (unit["page_index"], unit["line_index"]) not in starts:
            continue
        actual = _measured_indent(unit, rules)
        if actual is None:
            continue
        ok = abs(actual - expected) <= 0.12
        stats.observe(ok)
        if not ok:
            collector.add(
                "first_line_indent",
                "minor",
                "First-line indentation differs",
                "Paragraph indentation does not match the mechanics.",
                f"This paragraph starts at a {actual:g}-inch first-line indent; expected {expected:g} inches.",
                "Set the first-line indent to the mechanics-specified measurement.",
                _location(unit["page_index"], unit["line_index"], "Indentation"),
            )


def _check_alignment(units: list[dict], rules: dict, stats: CategoryStats, collector: IssueCollector) -> None:
    expected = str(rules.get("alignment") or "").strip().lower()
    allowed = {expected} if expected in {"left", "right", "center", "justify"} else {"left", "justify"}
    for unit in units:
        if not _is_prose_body(unit):
            continue
        actual = unit.get("alignment")
        if not actual or not _is_body_line(unit):
            continue
        if len((unit.get("text") or "").strip()) < 40:
            continue
        ok = actual in allowed
        stats.observe(ok)
        if not ok:
            collector.add(
                "alignment",
                "moderate",
                "Alignment differs",
                "Paragraph alignment does not match the uploaded format mechanics.",
                f"This line appears {actual}; body text should be {' or '.join(sorted(allowed))}.",
                "Set body paragraphs to the mechanics-specified alignment.",
                _location(unit["page_index"], unit["line_index"], "Alignment"),
            )


def _chapter_pages(units: list[dict]) -> set[int]:
    pages = set()
    for unit in units:
        text = (unit.get("text") or "").strip()
        if CHAPTER_RE.match(text) or (
            unit.get("role") == "heading1" and re.search(r"\bchapter\b", text, re.I)
        ):
            pages.add(unit["page_index"])
    return pages


def _check_pagination(units: list[dict], rules: dict, stats: CategoryStats, collector: IssueCollector) -> None:
    pagination = rules.get("pagination") or {}
    position = str(pagination.get("position") or "").lower()
    hide_chapter = bool(pagination.get("first_page_of_chapter") or "")
    if not position and not hide_chapter:
        return
    chapter_pages = _chapter_pages(units) if hide_chapter else set()
    want_top = "top" in position
    want_bottom = "bottom" in position
    want_right = "right" in position
    want_center = "center" in position or "centre" in position
    by_page: dict[int, list[dict]] = defaultdict(list)
    for unit in units:
        by_page[unit["page_index"]].append(unit)
    for page, page_units in sorted(by_page.items()):
        numbers = [unit for unit in page_units if PAGE_NUMBER_RE.match((unit.get("text") or "").strip())]
        loc = _location(page, (numbers[0]["line_index"] if numbers else 0), "Alignment")
        if hide_chapter and page in chapter_pages:
            ok = not numbers
            stats.observe(ok)
            if not ok:
                collector.add(
                    "pagination_chapter_first",
                    "minor",
                    "Page number shown on chapter first page",
                    "The uploaded format hides page numbers on the first page of each chapter.",
                    f"A page number is present on page {page + 1}, which starts a chapter.",
                    "Hide the page number on the first page of each chapter.",
                    loc,
                )
            continue
        if not position:
            continue
        if not numbers:
            stats.observe(False)
            collector.add(
                "pagination_missing",
                "moderate",
                "Page number missing",
                "The uploaded format requires a page number on this page.",
                f"No page number was found on page {page + 1}.",
                "Add page numbers in the mechanics-specified position.",
                loc,
            )
            continue
        marker = numbers[0]
        bbox = marker.get("bbox")
        height = marker.get("page_height") or 0
        width = marker.get("page_width") or 0
        ok = True
        if bbox and height and width:
            topish = bbox[1] <= height * 0.18
            bottomish = bbox[3] >= height * 0.82
            rightish = bbox[0] >= width * 0.55
            centerish = abs((bbox[0] + bbox[2]) / 2 - width / 2) <= width * 0.18
            if want_top and not topish:
                ok = False
            if want_bottom and not bottomish:
                ok = False
            if want_right and not rightish:
                ok = False
            if want_center and not centerish:
                ok = False
        stats.observe(ok)
        if not ok:
            collector.add(
                "pagination_position",
                "moderate",
                "Page number position differs",
                "The page number is not in the position required by the uploaded format.",
                f"The format requires page numbers {position or 'in the specified location'}.",
                "Move the page number to the mechanics-specified position.",
                loc,
            )


def _check_captions(units: list[dict], rules: dict, collector: IssueCollector) -> None:
    table_rules = " ".join(rules.get("table_layout_requirements") or []).lower()
    figure_rules = " ".join(rules.get("figure_layout_requirements") or []).lower()
    if not table_rules and not figure_rules:
        return
    want_table_caps = "title" in table_rules and ("caps" in table_rules or "uppercase" in table_rules or "capital" in table_rules)
    want_figure_prefix = "figure" in figure_rules
    for index, unit in enumerate(units):
        text = (unit.get("text") or "").strip()
        loc = _location(unit["page_index"], unit["line_index"], "Alignment")
        if table_rules and TABLE_CAPTION_RE.match(text):
            title = re.sub(r"^\s*table\s+\d+\s*[:.\-–]?\s*", "", text, flags=re.I).strip()
            if want_table_caps and title and title != title.upper():
                collector.add(
                    "table_caption",
                    "minor",
                    "Table title is not in the required caption form",
                    "Table captions do not follow the uploaded format mechanics.",
                    f"Found “{text}”; the format expects a Table number plus an uppercase title.",
                    "Rewrite the table caption using the mechanics-specified Table n + TITLE pattern.",
                    loc,
                )
        if figure_rules and want_figure_prefix:
            if re.match(r"^\s*fig\.?\s+\d+", text, re.I) and not FIGURE_CAPTION_RE.match(text):
                collector.add(
                    "figure_caption",
                    "minor",
                    "Figure caption prefix differs",
                    "Figure captions do not follow the uploaded format mechanics.",
                    f"Found “{text}”; the format expects captions to start with Figure n.",
                    "Rewrite the figure caption using the mechanics-specified Figure n pattern.",
                    loc,
                )


def _check_citations(units: list[dict], text: str, rules: dict, collector: IssueCollector) -> None:
    style = str(rules.get("citation_style") or "").upper()
    if not style:
        return
    from app.citation_ml import classify_citation

    numeric = len(IN_TEXT_NUMERIC_RE.findall(text or ""))
    author_year = len(IN_TEXT_APA_RE.findall(text or ""))
    mla = len(IN_TEXT_MLA_RE.findall(text or ""))
    if numeric + author_year + mla == 0 and not any(
        REFERENCE_HEADER_RE.match((unit.get("text") or "").strip()) for unit in units
    ):
        return

    expected_numeric = style in {"IEEE", "VANCOUVER"}
    mismatch_pattern = IN_TEXT_APA_RE if expected_numeric else IN_TEXT_NUMERIC_RE
    if expected_numeric:
        style_mismatch = author_year > numeric
    elif style == "MLA":
        style_mismatch = numeric > mla and numeric > author_year
        mismatch_pattern = IN_TEXT_NUMERIC_RE
    else:
        style_mismatch = numeric > author_year

    located = False
    if style_mismatch:
        for unit in units:
            if mismatch_pattern.search(unit.get("text") or ""):
                collector.add(
                    "citation_format",
                    "moderate",
                    "Citation format does not match the uploaded style",
                    f"In-text markers do not follow the uploaded {style} format.",
                    "This check compares citation marker syntax only; it does not validate sources or citation content.",
                    f"Reformat in-text citations using {style} conventions.",
                    _location(unit["page_index"], unit["line_index"], "Citations"),
                )
                located = True
        if not located:
            collector.add(
                "citation_format",
                "moderate",
                "Citation format does not match the uploaded style",
                f"Detected citation markers do not predominantly follow {style} formatting.",
                "This check compares citation marker syntax only; it does not validate sources or citation content.",
                f"Reformat in-text citations using {style} conventions.",
                _location(0, 0, "Citations"),
            )

    in_references = False
    for unit in units:
        raw = (unit.get("text") or "").strip()
        if REFERENCE_HEADER_RE.match(raw):
            in_references = True
            continue
        if in_references and unit.get("role") in {"heading1", "heading2"}:
            in_references = False
        snippet = raw
        if not in_references:
            matches = IN_TEXT_NUMERIC_RE.findall(raw) + IN_TEXT_APA_RE.findall(raw) + IN_TEXT_MLA_RE.findall(raw)
            if not matches:
                continue
            snippet = matches[0]
        elif len(raw) < 20:
            continue
        predicted = classify_citation(snippet)
        if not predicted or predicted["style_confidence"] < 0.62:
            continue
        predicted_style = predicted["citation_style"]
        style_aliases = {"APA": {"APA", "HARVARD", "CHICAGO", "TURABIAN"}, "IEEE": {"IEEE", "VANCOUVER"}}
        expected_set = style_aliases.get(style, {style})
        if predicted_style not in expected_set and predicted_style != style:
            collector.add(
                "citation_style_ml",
                "moderate",
                "Citation style does not match the uploaded format",
                f"A citation appears to follow {predicted_style} instead of the uploaded {style} format.",
                f"The citation classifier predicted {predicted_style} with {predicted['style_confidence']:.0%} confidence.",
                f"Rewrite this citation using {style} format from the uploaded mechanics.",
                _location(unit["page_index"], unit["line_index"], "Citations"),
            )


def _build_breakdown(stats: dict[str, CategoryStats], issues: list[dict]) -> list[dict]:
    issues_by_category: dict[str, list[str]] = defaultdict(list)
    counts: dict[str, int] = defaultdict(int)
    for issue in issues:
        category = None
        for location in issue.get("locations") or []:
            category = location.get("section") or category
        if category not in BREAKDOWN_ORDER:
            continue
        issues_by_category[category].append(issue["issue_type"])
        counts[category] += issue.get("count") or len(issue.get("locations") or [])
    breakdown = []
    for name in BREAKDOWN_ORDER:
        unique = sorted(set(issues_by_category.get(name) or []))
        breakdown.append(
            {
                "section": name,
                "formatting_score": stats[name].score(),
                "issue_count": counts.get(name, 0),
                "issues": unique,
            }
        )
    return breakdown


def run_compliance_scan(
    parsed: dict, mechanics_rules: dict, tier: str = "free"
) -> dict:
    units = _document_units(parsed, mechanics_rules)
    _annotate_roles(units, mechanics_rules)
    stats = {name: CategoryStats() for name in BREAKDOWN_ORDER}
    collector = IssueCollector()
    _check_fonts(units, mechanics_rules, stats["Fonts"], collector)
    _check_margins(parsed, units, mechanics_rules, stats["Margins"], collector)
    _check_indentation(units, mechanics_rules, stats["Indentation"], collector)
    _check_spacing(units, mechanics_rules, stats["Spacing"], collector)
    _check_alignment(units, mechanics_rules, stats["Alignment"], collector)
    _check_pagination(units, mechanics_rules, stats["Alignment"], collector)
    _check_captions(units, mechanics_rules, collector)
    _check_citations(units, parsed.get("text", ""), mechanics_rules, collector)
    issues = enrich_compliance_issues(collector.result(), mechanics_rules, tier)
    issues.sort(key=lambda issue: (SEVERITY_ORDER.get(issue["severity"], 2), issue["issue_type"]))
    breakdown = _build_breakdown(stats, issues)
    measured = [item["formatting_score"] for item in breakdown if stats[item["section"]].checked]
    overall = _clamp(sum(measured) / len(measured)) if measured else 100.0
    page_count = max((unit["page_index"] for unit in units), default=-1) + 1
    if (parsed.get("metadata") or {}).get("format") == "pdf":
        page_count = max(page_count, len(parsed.get("pages") or []))
    pagination = _pagination_meta(parsed, mechanics_rules)
    return {
        "overall_score": overall,
        "issues": issues,
        "sections": breakdown,
        "page_count": page_count,
        "pagination": pagination,
    }
