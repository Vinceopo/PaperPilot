"""PDF-only first-line / hanging / left / right indentation checker.

 deliberately does not use ``_starts_paragraph``, ``_prose_paragraphs``, or
``_pdf_text_columns`` so Spacing, Alignment, and Margins stay identical.
"""

from __future__ import annotations

import logging
import re
from collections import Counter, defaultdict
from typing import Any

from app.mechanics_options import rule_unset

logger = logging.getLogger(__name__)

PT_PER_INCH = 72.0

# --- Configurable thresholds (not derived from the user's rule) ---
# Default tolerance when the mechanics file does not state one (PDF render noise).
INDENT_DEFAULT_TOLERANCE_IN = 0.08
# Extra margin beyond tolerance before a reading becomes a Fail (not Uncertain).
INDENT_SAFETY_MARGIN_IN = 0.02
# If this share of eligible paragraphs Fail, abandon the category as unreliable.
INDENT_RELIABILITY_FAIL_SHARE = 0.55
# Minimum eligible paragraphs before the flood / reliability guard applies.
INDENT_RELIABILITY_MIN_ELIGIBLE = 8
# If this share of eligible paragraphs share one indent, treat others as outliers.
INDENT_MODE_SHARE = 0.55
# Vertical gap factor (× median line pitch) that suggests a paragraph break
# when the next line is indented.
INDENT_PARA_GAP_FACTOR = 1.35
# Stronger gap required to start a flush-left paragraph (avoids splitting a
# soft-wrapped continuation after a full-width line on ordinary leading).
INDENT_FLUSH_PARA_GAP_FACTOR = 2.0
# Minimum left offset from block baseline (pt) to count as visibly indented.
INDENT_MIN_INDENT_PT = 14.0
# Right gap (pt) below which a line counts as full-width within its column.
INDENT_FULL_WIDTH_RIGHT_GAP_PT = 18.0
# Right gap (pt) above which the previous line counts as a short last line.
INDENT_SHORT_LINE_RIGHT_GAP_PT = 36.0
# Horizontal gap (pt) that separates multi-column blocks. Must stay above the
# largest typical first-line indent (~0.85") so indent clusters are not columns.
INDENT_COLUMN_SEPARATION_PT = 72.0
# Maximum first-line words stored on an issue for naming / bbox verification.
INDENT_FIRST_WORDS = 8
# Skip a first-of-page line that may continue the previous page's paragraph.
INDENT_SKIP_PAGE_CONTINUE = True

LIST_ITEM_RE = re.compile(
    r"^(?:"
    r"\(\d+(?:\.\d+)*\)\s+"
    r"|\([A-Za-z]\)\s+"
    r"|(?:\d+(?:\.\d+)*|[A-Za-z]|[ivxlcdm]+)[.)]\s+"
    r"|[-•●▪◦○]\s+"
    r"|(?:Q(?:uestion)?|Question)\s*\d+(?:\s*[.:)]\s*|\s+)"
    r")",
    re.I,
)
CAPTION_RE = re.compile(r"^(?:figure|fig\.?|table|tbl\.?|plate|map|photo|image)\s*[\d.]+\b", re.I)
LABEL_VALUE_RE = re.compile(r"^[A-Za-z][^:]{0,40}:\s+\S+")
REFERENCE_LIKE_RE = re.compile(r"^\(\d{4}[a-z]?\)|,\s*\d{4}\.?$")
HEADING_ROLE_PREFIX = "heading"


def _has_box(unit: dict) -> bool:
    return len(unit.get("bbox") or []) >= 4


def _is_pdf_units(units: list[dict]) -> bool:
    return any(_has_box(unit) for unit in units if (unit.get("text") or "").strip())


def _text(unit: dict) -> str:
    return " ".join(str(unit.get("text") or "").split()).strip()


def _first_words(text: str, n: int = INDENT_FIRST_WORDS) -> str:
    words = text.split()
    return " ".join(words[:n])


def resolve_indent_rule(rules: dict | None) -> dict | None:
    """Build a structured indent rule from mechanics, or None → IGNORE.

    Never invents a default inches value. Bare \"tab\" without a stated equivalent
    yields IGNORE.
    """
    rules = rules if isinstance(rules, dict) else {}
    raw_indent = rules.get("indention")
    raw_inches = rules.get("first_line_indent_inches")
    raw_type = str(rules.get("indent_type") or rules.get("indentation_type") or "").strip().lower()
    tolerance_raw = rules.get("indent_tolerance_inches")
    start_page = rules.get("indent_start_page") or rules.get("body_start_page")

    if rule_unset(raw_indent) and rule_unset(raw_inches) and not raw_type:
        return None
    if isinstance(raw_indent, str) and rule_unset(raw_indent) and rule_unset(raw_inches):
        return None

    # Explicit disabled / none rule with no numeric target.
    type_hint = raw_type
    blob = f"{raw_indent or ''} {raw_type or ''}".lower()
    if re.search(r"\bhanging\b", blob):
        type_hint = type_hint or "hanging"
    elif re.search(r"\bright\s+indent\b", blob):
        type_hint = type_hint or "right"
    elif re.search(r"\bleft\s+indent\b", blob) and "first" not in blob:
        type_hint = type_hint or "left"
    elif re.search(r"\b(no|none|without)\s+indent", blob) or blob.strip() in {"none", "0", "0 inch", "0 inches"}:
        type_hint = type_hint or "none"

    value = _parse_indent_inches(raw_indent)
    if value is None and not rule_unset(raw_inches):
        try:
            value = float(raw_inches)
        except (TypeError, ValueError):
            value = None

    if type_hint in {"none", "no", "disabled"}:
        value = 0.0 if value is None else value
        type_hint = "none"

    if value is None and type_hint not in {"none"}:
        # Unreadable / tab without equivalent / contradictory → IGNORE
        logger.info("indent rule IGNORE: no usable inches (raw_indent=%r raw_inches=%r)", raw_indent, raw_inches)
        return None

    if not type_hint:
        type_hint = "first_line"

    tolerance = INDENT_DEFAULT_TOLERANCE_IN
    if not rule_unset(tolerance_raw):
        try:
            tolerance = float(tolerance_raw)
        except (TypeError, ValueError):
            tolerance = INDENT_DEFAULT_TOLERANCE_IN

    start = None
    if not rule_unset(start_page):
        try:
            start = int(start_page)
        except (TypeError, ValueError):
            start = None

    applies_to = str(rules.get("indent_applies_to") or "body_paragraphs").strip() or "body_paragraphs"
    format_name = str(rules.get("format_mechanics_name") or rules.get("mechanics_name") or "").strip()

    return {
        "indent_type": type_hint,
        "value_in": float(value if value is not None else 0.0),
        "tolerance_in": float(tolerance),
        "start_page": start,
        "applies_to": applies_to,
        "format_mechanics_name": format_name,
        "snapshot": {
            "indention": raw_indent,
            "first_line_indent_inches": raw_inches,
            "indent_type": type_hint,
            "indent_tolerance_inches": tolerance,
            "indent_start_page": start,
            "indent_applies_to": applies_to,
            "format_mechanics_name": format_name,
        },
    }


def _parse_indent_inches(value) -> float | None:
    """Parse an indent length. Bare 'tab' / 'one tab' without a measure → None."""
    if value is None or rule_unset(value):
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        number = float(value)
        return number if 0 <= number <= 2 else None
    text = str(value).strip().lower().replace(",", ".")
    if not text:
        return None
    # Tab only counts when the mechanics also state an equivalent length.
    if re.search(r"\b(?:one\s+)?tab\b", text):
        from app.documents import parse_length_inches

        measure = re.search(
            r"(\d+(?:\.\d+)?\s*(?:in(?:ch(?:es)?)?|\"|″|cm|mm|pt)\b|\d+\s*/\s*\d+\s*(?:in(?:ch(?:es)?)?|\"|″)?)",
            text,
            re.I,
        )
        if not measure:
            # e.g. "0.5 inch TAB" already has a leading measure — parse_length_inches
            # would hardcode tab→0.5; strip tab words and parse the remainder.
            stripped = re.sub(r"\b(?:one\s+)?tab\b", " ", text)
            stripped = re.sub(r"\s+", " ", stripped).strip()
            if not stripped:
                return None
            return parse_length_inches(stripped)
        return parse_length_inches(text.replace("tab", " "))
    from app.documents import parse_length_inches

    return parse_length_inches(text)


def _body_lines(units: list[dict]) -> list[dict]:
    lines = []
    for unit in units:
        if not _text(unit):
            continue
        if (unit.get("source") or "body") in {"header", "footer", "footnote", "endnote", "textbox"}:
            continue
        if unit.get("role") == "pagination":
            continue
        if unit.get("has_drawing") and not _text(unit):
            continue
        if not _has_box(unit):
            continue
        lines.append(unit)
    return lines


def _median(values: list[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


def _group_column_blocks(lines: list[dict]) -> list[list[dict]]:
    """Group lines into column blocks by page.

    Multi-column only when two left-edge modes are far apart *and* lines from
    those modes share vertical bands (true side-by-side columns). A first-line
    indent cluster must not become its own column.
    """
    by_page: dict[int, list[dict]] = defaultdict(list)
    for line in lines:
        by_page[int(line.get("page_index") or 0)].append(line)

    blocks: list[list[dict]] = []
    for page in sorted(by_page):
        page_lines = sorted(by_page[page], key=lambda u: (u["bbox"][1], u["bbox"][0]))
        if not page_lines:
            continue
        lefts = [round(u["bbox"][0] / 4) * 4 for u in page_lines]
        modes = [edge for edge, _count in Counter(lefts).most_common(4)]
        split = False
        if len(modes) >= 2 and abs(modes[0] - modes[1]) >= INDENT_COLUMN_SEPARATION_PT:
            # Require overlapping y-ranges between the two mode groups (side-by-side).
            groups = {modes[0]: [], modes[1]: []}
            for unit in page_lines:
                anchor = min(modes[:2], key=lambda edge: abs(edge - unit["bbox"][0]))
                if anchor in groups:
                    groups[anchor].append(unit)
            ys0 = [u["bbox"][1] for u in groups[modes[0]]]
            ys1 = [u["bbox"][1] for u in groups[modes[1]]]
            if ys0 and ys1:
                overlap = min(max(ys0), max(ys1)) - max(min(ys0), min(ys1))
                split = overlap > 20
        if split:
            clusters: dict[float, list[dict]] = defaultdict(list)
            for unit in page_lines:
                x0 = unit["bbox"][0]
                anchor = min(modes[:2], key=lambda edge: abs(edge - x0))
                clusters[anchor].append(unit)
            for anchor in sorted(clusters):
                blocks.append(sorted(clusters[anchor], key=lambda u: (u["bbox"][1], u["bbox"][0])))
        else:
            blocks.append(page_lines)
    return blocks


def _block_baseline_x0(block: list[dict]) -> float:
    """Most common left edge among lines in the block (not the page margin).

    When a first-line indent cluster dominates the histogram, still prefer the
    leftmost edge in the typical indent band so the body edge remains baseline.
    """
    lefts = [round(unit["bbox"][0]) for unit in block]
    if not lefts:
        return 0.0
    common = Counter(lefts).most_common()
    primary = float(common[0][0])
    candidates = [primary]
    for edge in {float(value) for value in lefts}:
        gap = abs(edge - primary)
        if 0.28 * PT_PER_INCH <= gap <= 0.85 * PT_PER_INCH:
            candidates.append(edge)
    # Ties for most-common: prefer leftmost.
    top_count = common[0][1]
    tied = [float(edge) for edge, count in common if count == top_count]
    candidates.extend(tied)
    return float(min(candidates))


def _line_pitch(block: list[dict]) -> float:
    gaps = []
    for previous, current in zip(block, block[1:]):
        gap = current["bbox"][1] - previous["bbox"][1]
        if gap > 0:
            gaps.append(gap)
    return _median(gaps) or 16.0


def _is_full_width(unit: dict, baseline: float, block_right: float) -> bool:
    """True when the line reaches the block's right edge (regardless of left indent)."""
    del baseline  # right-edge fullness does not depend on left baseline
    right_gap = block_right - unit["bbox"][2]
    return right_gap <= INDENT_FULL_WIDTH_RIGHT_GAP_PT


def _is_short_last(unit: dict, block_right: float) -> bool:
    return (block_right - unit["bbox"][2]) >= INDENT_SHORT_LINE_RIGHT_GAP_PT


def _is_heading_unit(unit: dict) -> bool:
    role = str(unit.get("role") or "")
    if role.startswith(HEADING_ROLE_PREFIX):
        return True
    text = _text(unit)
    if not text or len(text) > 80:
        return False
    if unit.get("dominant_size") and float(unit["dominant_size"]) >= 13:
        return True
    return bool(text.isupper() and len(text.split()) <= 10)


def _visibly_indented(unit: dict, baseline: float) -> bool:
    return (unit["bbox"][0] - baseline) >= INDENT_MIN_INDENT_PT


def indent_prose_paragraphs(units: list[dict]) -> list[dict]:
    """Forked paragraph detection for indentation only.

    A line starts a new paragraph only if it is indented relative to its block
    baseline AND follows a short last line, a paragraph gap, or a heading.
    A flush-left line after a full-width line is always a continuation.
    """
    lines = _body_lines(units)
    blocks = _group_column_blocks(lines)
    paragraphs: list[dict] = []
    para_serial = 0

    for block in blocks:
        if not block:
            continue
        baseline = _block_baseline_x0(block)
        pitch = _line_pitch(block)
        block_right = max(unit["bbox"][2] for unit in block)
        current: list[dict] = []

        def close():
            nonlocal para_serial, current
            if not current:
                return
            para_serial += 1
            paragraphs.append(
                {
                    "paragraph_id": f"p{current[0].get('page_index', 0)}-{para_serial}",
                    "lines": current,
                    "baseline_x0": baseline,
                    "block_right": block_right,
                }
            )
            current = []

        for index, unit in enumerate(block):
            if unit.get("table_row") or unit.get("source") == "table":
                close()
                continue
            if _is_heading_unit(unit):
                close()
                continue
            if not current:
                current = [unit]
                continue
            previous = current[-1]
            gap = unit["bbox"][1] - previous["bbox"][1]
            large_gap = gap > INDENT_PARA_GAP_FACTOR * pitch
            flush_para_gap = gap > INDENT_FLUSH_PARA_GAP_FACTOR * pitch
            indented = _visibly_indented(unit, baseline)
            prev_full = _is_full_width(previous, baseline, block_right)
            prev_short = _is_short_last(previous, block_right)
            prev_heading = _is_heading_unit(previous)

            # Flush-left after a full-width line is a continuation unless a clear
            # paragraph blank separates them (unindented manuscripts).
            if not indented and prev_full and not flush_para_gap:
                current.append(unit)
                continue
            # New paragraph: indented after a short last line, gap, heading, or
            # full-width line (classic first-line indent with no extra spacing).
            if indented and (prev_short or large_gap or prev_heading or prev_full):
                close()
                current = [unit]
                continue
            # Flush paragraph style (no first-line indent) after a clear blank.
            if not indented and flush_para_gap:
                close()
                current = [unit]
                continue
            # Same page continuation or soft wrap.
            current.append(unit)
        close()
    return paragraphs


def _mode_x0(lines: list[dict]) -> float | None:
    if not lines:
        return None
    lefts = [round(unit["bbox"][0]) for unit in lines]
    return float(Counter(lefts).most_common(1)[0][0])


def _snap_follow_to_body(follow_x0: float, baseline: float, first: dict) -> float:
    """Snap a jittered following-line edge to the block/column body edge."""
    column = first.get("column")
    if isinstance(column, (list, tuple)) and len(column) >= 1:
        col_left = float(column[0])
        # Wrap jitter sits near the true body edge, not near the first-line indent.
        if abs(follow_x0 - col_left) <= 0.28 * PT_PER_INCH:
            return col_left
    if abs(follow_x0 - baseline) < INDENT_MIN_INDENT_PT:
        return baseline
    return follow_x0


def measure_paragraph_indent(paragraph: dict, indent_type: str) -> dict | None:
    """Measure indent in inches from the paragraph's own lines (not the page margin)."""
    lines = paragraph.get("lines") or []
    if not lines or not _has_box(lines[0]):
        return None
    first = lines[0]
    following = [line for line in lines[1:] if _has_box(line)]
    first_x0 = float(first["bbox"][0])
    follow_x0 = _mode_x0(following)
    baseline = float(paragraph.get("baseline_x0") or follow_x0 or first_x0)

    if indent_type in {"first_line", "none"}:
        if follow_x0 is None:
            # Single-line: cannot measure first-line indent confidently.
            return None
        follow_x0 = _snap_follow_to_body(follow_x0, baseline, first)
        measured = (first_x0 - follow_x0) / PT_PER_INCH
        return {
            "measured_in": round(measured, 3),
            "measured_x0": first_x0,
            "baseline_x0": follow_x0,
        }
    if indent_type == "hanging":
        if follow_x0 is None:
            return None
        follow_x0 = _snap_follow_to_body(follow_x0, baseline, first)
        measured = (follow_x0 - first_x0) / PT_PER_INCH
        return {
            "measured_in": round(measured, 3),
            "measured_x0": first_x0,
            "baseline_x0": follow_x0,
        }
    if indent_type == "left":
        # How far the paragraph's left edge sits from the block baseline.
        block_base = float(paragraph.get("baseline_x0") or first_x0)
        measured = (min(unit["bbox"][0] for unit in lines) - block_base) / PT_PER_INCH
        return {
            "measured_in": round(measured, 3),
            "measured_x0": first_x0,
            "baseline_x0": block_base,
        }
    if indent_type == "right":
        rights = [unit["bbox"][2] for unit in lines]
        page_w = float(first.get("page_width") or 612)
        measured = (page_w - max(rights)) / PT_PER_INCH
        return {
            "measured_in": round(measured, 3),
            "measured_x0": first_x0,
            "baseline_x0": float(paragraph.get("baseline_x0") or first_x0),
        }
    return None


def _overlaps_image(unit: dict, units: list[dict]) -> bool:
    if not _has_box(unit):
        return False
    box = unit["bbox"]
    page = unit.get("page_index")
    for other in units:
        if other is unit or other.get("page_index") != page:
            continue
        if not (other.get("has_drawing") or other.get("source") == "figure"):
            continue
        if not _has_box(other):
            continue
        ob = other["bbox"]
        horizontally = box[2] >= ob[0] - 8 and box[0] <= ob[2] + 8
        vertically = box[3] >= ob[1] - 12 and box[1] <= ob[3] + 12
        if horizontally and vertically:
            return True
    return False


def _is_list_paragraph(lines: list[dict]) -> bool:
    if not lines:
        return False
    if lines[0].get("list_item"):
        return True
    text = _text(lines[0])
    if LIST_ITEM_RE.match(text):
        return True
    # Continuation of a list: previous structural cue — consistent extra offset
    # with a marker on a nearby prior line is handled by skip when the opening
    # line matched; orphan wraps still look list-like when short and offset.
    return False


def eligibility(paragraph: dict, units: list[dict], rule: dict) -> tuple[bool, str | None]:
    """Return (eligible, skip_reason). Skipped items are not units."""
    lines = paragraph.get("lines") or []
    if not lines:
        return False, "empty"
    first = lines[0]
    text = _text(first)
    if not text:
        return False, "empty"

    applies = str(rule.get("applies_to") or "body_paragraphs")
    if applies not in {"body_paragraphs", "body", "paragraphs", ""}:
        # Unknown applies_to → be conservative.
        pass

    start_page = rule.get("start_page")
    page = int(first.get("page_index") or 0)
    if start_page is not None and (page + 1) < int(start_page):
        return False, "before_start_page"

    if first.get("table_row") or first.get("source") == "table":
        return False, "table"
    # Far-right column / table cell (not body text).
    page_w = float(first.get("page_width") or 612)
    baseline = float(paragraph.get("baseline_x0") or first["bbox"][0])
    if baseline > max(2.0 * PT_PER_INCH, 0.35 * page_w):
        return False, "far_right_column"
    if _is_heading_unit(first):
        return False, "heading"
    if CAPTION_RE.match(text):
        return False, "caption"
    if LABEL_VALUE_RE.match(text) and len(lines) == 1:
        return False, "label_value"
    if _is_list_paragraph(lines):
        return False, "list"
    if _overlaps_image(first, units):
        return False, "beside_image"
    if REFERENCE_LIKE_RE.search(text) and len(text) < 120:
        return False, "reference"
    # Front-matter heuristic: roman folio pages often precede body_start; if the
    # rule set a start_page we already skipped. Without it, still skip very short
    # single-line non-sentences.
    if len(lines) == 1:
        return False, "single_line"
    if INDENT_SKIP_PAGE_CONTINUE:
        # First line on a page with no indent vs baseline may continue prior page.
        page_lines = [u for u in units if u.get("page_index") == page and _has_box(u) and _text(u)]
        if page_lines and page_lines[0] is first and not _visibly_indented(first, paragraph["baseline_x0"]):
            if page > 0:
                return False, "possible_page_continuation"

    # Default: body paragraphs of at least 2 lines.
    if len(lines) < 2:
        return False, "single_line"
    return True, None


def _printed_page_labels(units: list[dict]) -> dict[int, str]:
    """Map page_index → printed label from detected edge tokens when available."""
    from app.compliance import _format_page_value, _pdf_page_marks

    page_count = max((int(u.get("page_index") or 0) for u in units), default=-1) + 1
    if page_count <= 0:
        return {}
    marks = _pdf_page_marks({"metadata": {"format": "pdf"}}, units, page_count)
    labels: dict[int, str] = {}
    for mark in marks:
        page = int(mark.get("page") or 0)
        if mark.get("shown") and mark.get("value") is not None:
            labels[page] = _format_page_value(int(mark["value"]), mark.get("style") or "arabic")
        else:
            labels[page] = str(page + 1)
    return labels


def _bbox_matches_words(unit: dict, words: str) -> bool:
    text = _text(unit).lower()
    needle = " ".join(words.lower().split()[:3])
    if not needle:
        return False
    return needle in text or text.startswith(needle[: max(3, len(needle) // 2)])


def _classify(measured: float, expected: float, tolerance: float) -> str:
    delta = abs(measured - expected)
    if delta <= tolerance:
        return "pass"
    if delta <= tolerance + INDENT_SAFETY_MARGIN_IN:
        return "uncertain"
    return "fail"


def check_pdf_indentation(
    units: list[dict],
    rules: dict,
    stats: Any,
    collector: Any,
    *,
    unit_location_fn,
) -> dict:
    """Run the PDF indentation check. Mutates stats/collector. Returns meta."""
    rule = resolve_indent_rule(rules)
    meta = {"status": "ignore", "eligible": 0, "failed": 0, "uncertain": 0, "skipped": [], "notice": None}
    if rule is None:
        # IGNORE: measure nothing, 0 units, 0 issues, leave applicable False.
        logger.info("indentation category IGNORE (no usable enabled rule)")
        return meta

    # Text layer required.
    if not any(_text(u) for u in units):
        stats.applicable = True
        stats.unreliable = True
        stats.notice = "Could not check reliably: PDF has no extractable text layer."
        meta.update(status="unreliable", notice=stats.notice)
        logger.info("indentation unreliable: no text layer")
        return meta

    stats.applicable = True
    paragraphs = indent_prose_paragraphs(units)
    labels = _printed_page_labels(units)
    indent_type = rule["indent_type"]
    expected = float(rule["value_in"])
    tolerance = float(rule["tolerance_in"])

    evaluated: list[dict] = []
    prev_was_list = False
    for paragraph in paragraphs:
        lines = paragraph.get("lines") or []
        is_list = _is_list_paragraph(lines)
        # Orphan wrap after a list item is not a body paragraph.
        if prev_was_list and not is_list and lines and not _text(lines[0])[:1].isupper():
            meta["skipped"].append({"paragraph_id": paragraph["paragraph_id"], "reason": "list_continuation"})
            prev_was_list = True
            continue
        ok, skip_reason = eligibility(paragraph, units, rule)
        if not ok:
            meta["skipped"].append({"paragraph_id": paragraph["paragraph_id"], "reason": skip_reason})
            prev_was_list = is_list or skip_reason == "list"
            continue
        measured = measure_paragraph_indent(paragraph, indent_type)
        if measured is None:
            meta["skipped"].append({"paragraph_id": paragraph["paragraph_id"], "reason": "unmeasurable"})
            prev_was_list = False
            continue
        outcome = _classify(measured["measured_in"], expected, tolerance)
        first = paragraph["lines"][0]
        opening = _first_words(_text(first))
        evaluated.append(
            {
                "paragraph": paragraph,
                "first": first,
                "opening": opening,
                "measured": measured,
                "outcome": outcome,
            }
        )
        prev_was_list = False

    meta["eligible"] = len(evaluated)
    if not evaluated:
        meta["status"] = "checked"
        return meta

    # Consistency: if most share one indent, only flag outliers vs that mode when
    # the mode matches the rule; if every reading shares the same delta from the
    # rule, suspect a wrong baseline.
    measured_values = [round(item["measured"]["measured_in"], 2) for item in evaluated]
    mode_value, mode_count = Counter(measured_values).most_common(1)[0]
    mode_share = mode_count / len(evaluated)
    deltas = [round(item["measured"]["measured_in"] - expected, 2) for item in evaluated]
    common_delta, delta_count = Counter(deltas).most_common(1)[0]
    # Consistently unindented (measured ≈ 0) is a real failure pattern — emit issues.
    consistently_unindented = abs(mode_value) <= tolerance + INDENT_SAFETY_MARGIN_IN
    if (
        len(evaluated) >= INDENT_RELIABILITY_MIN_ELIGIBLE
        and delta_count == len(evaluated)
        and abs(common_delta) > tolerance + INDENT_SAFETY_MARGIN_IN
        and not consistently_unindented
    ):
        stats.unreliable = True
        stats.notice = (
            "Could not check reliably: every eligible paragraph differs from the "
            "rule by the same amount, which usually means a wrong baseline."
        )
        meta.update(status="unreliable", notice=stats.notice)
        logger.info("indentation unreliable: uniform delta=%s", common_delta)
        return meta

    failed_items = []
    uncertain_items = []
    for item in evaluated:
        outcome = item["outcome"]
        # Outlier mode: when a clear mode matches the rule, only flag clear outliers.
        if (
            mode_share >= INDENT_MODE_SHARE
            and abs(mode_value - expected) <= tolerance
            and abs(item["measured"]["measured_in"] - mode_value) <= tolerance
        ):
            outcome = "pass"
        if outcome == "pass":
            stats.observe(True)
        elif outcome == "uncertain":
            meta["uncertain"] += 1
            uncertain_items.append(item)
            # Uncertain never lowers the score and is not a unit failure.
            stats.observe(True)
        else:
            failed_items.append(item)

    # Reliability flood guard (not when every paragraph is simply unindented).
    if (
        len(evaluated) >= INDENT_RELIABILITY_MIN_ELIGIBLE
        and len(failed_items) / len(evaluated) >= INDENT_RELIABILITY_FAIL_SHARE
        and not consistently_unindented
    ):
        # Roll back unit observations for this category.
        stats.checked = 0
        stats.failed = 0
        stats.unreliable = True
        stats.notice = (
            "Could not check reliably: an unusually high share of eligible "
            "paragraphs failed, so indentation issues were not emitted."
        )
        meta.update(status="unreliable", notice=stats.notice, failed=0)
        logger.info(
            "indentation unreliable: fail_share=%s/%s",
            len(failed_items),
            len(evaluated),
        )
        return meta

    for item in failed_items:
        first = item["first"]
        measured = item["measured"]
        opening = item["opening"]
        if not _bbox_matches_words(first, opening):
            logger.info("drop indent issue: bbox/text mismatch paragraph=%s", item["paragraph"]["paragraph_id"])
            stats.observe(True)
            continue
        stats.observe(False)
        page_index = int(first.get("page_index") or 0)
        printed = labels.get(page_index)
        loc = unit_location_fn(first, "Indentation")
        loc.update(
            {
                "paragraph_id": item["paragraph"]["paragraph_id"],
                "page_index": page_index,
                "printed_page_label": printed,
                "excerpt": opening,
                "bbox": list(first["bbox"][:4]),
                "measured_x0": measured["measured_x0"],
                "baseline_x0": measured["baseline_x0"],
                "measured_indent_in": measured["measured_in"],
                "expected_indent_in": expected,
                "indent_type": indent_type,
                "rule_snapshot": rule["snapshot"],
                "highlight_from": "stored_bbox",
            }
        )
        # Display line comes from the same unit list that created the issue.
        if first.get("line_index") is not None:
            loc["line"] = int(first["line_index"]) + 1
            loc["line_index"] = int(first["line_index"])
        why = (
            f"Paragraph “{opening}” uses a {measured['measured_in']:g}-inch "
            f"{indent_type.replace('_', '-')} indent; the format rule requires "
            f"{expected:g} inches"
            f"{f' ({rule['snapshot'].get('indention')})' if rule['snapshot'].get('indention') else ''}."
        )
        collector.add(
            "first_line_indent",
            "minor",
            "First-line indentation differs",
            "Paragraph indentation does not match the mechanics.",
            why,
            "Set the paragraph indent to the mechanics-specified measurement.",
            loc,
        )

    meta["failed"] = stats.failed
    meta["status"] = "checked"
    meta["needs_review"] = [
        {
            "paragraph_id": item["paragraph"]["paragraph_id"],
            "measured": item["measured"]["measured_in"],
            "expected": expected,
            "opening": item["opening"],
        }
        for item in uncertain_items
    ]
    return meta
