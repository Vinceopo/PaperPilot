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
# Minimum eligible paragraphs used by tests / diagnostics (no fail-share suppress).
INDENT_RELIABILITY_MIN_ELIGIBLE = 8
# If this share of eligible paragraphs share one indent, treat others as outliers.
INDENT_MODE_SHARE = 0.55
# Vertical gap factor (× median line pitch) that suggests a paragraph break
# when the next line is indented.
INDENT_PARA_GAP_FACTOR = 1.35
# Flush-left paragraph break only when the gap is clearly larger than ordinary
# leading (never on a small pitch bump alone).
INDENT_FLUSH_PARA_GAP_FACTOR = 2.8
# Minimum left offset from block baseline (pt) to count as visibly indented.
INDENT_MIN_INDENT_PT = 14.0
# Right gap (pt) below which a line counts as full-width within its column.
INDENT_FULL_WIDTH_RIGHT_GAP_PT = 18.0
# Right gap (pt) above which the previous line counts as a short last line.
INDENT_SHORT_LINE_RIGHT_GAP_PT = 36.0
# Horizontal gap (pt) that separates multi-column blocks. Must stay above the
# largest typical first-line indent (~0.85") so indent clusters are not columns.
INDENT_COLUMN_SEPARATION_PT = 72.0
# Span/cell gap (em multiples) that marks a borderless table row.
INDENT_TABLE_CELL_GAP_EM = 1.6
# Narrow line width share of page that can belong to a table column.
INDENT_TABLE_NARROW_PAGE_SHARE = 0.55
# Header / footer edge bands (pt) used only as geometry — no text matching.
INDENT_EDGE_BAND_PT = 56.0
# Maximum first-line words stored on an issue for naming / bbox verification.
INDENT_FIRST_WORDS = 8
# Never flag the first body line of a page (often a prior-page continuation).
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


def _median(values: list[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


def _is_edge_band_unit(unit: dict) -> bool:
    """True when the line sits in the page header/footer band (geometry only)."""
    if not _has_box(unit):
        return False
    bbox = unit["bbox"]
    height = float(unit.get("page_height") or 0.0)
    if height <= 0:
        return False
    return bbox[1] <= INDENT_EDGE_BAND_PT or bbox[3] >= height - INDENT_EDGE_BAND_PT


def _is_non_body_chrome(unit: dict) -> bool:
    """Header, footer, page-number chrome — structural roles / bands, never text."""
    source = unit.get("source") or "body"
    if source in {"header", "footer", "footnote", "endnote", "textbox"}:
        return True
    role = unit.get("role") or ""
    if role in {"pagination", "header", "footer"}:
        return True
    return _is_edge_band_unit(unit)


def _span_cell_gaps(unit: dict) -> int:
    """Count wide horizontal gaps between span clusters on one printed row."""
    spans = [
        span
        for span in (unit.get("spans") or [])
        if span.get("text") and len(span.get("bbox") or []) >= 4
    ]
    if len(spans) < 2:
        return 0
    spans = sorted(spans, key=lambda span: span["bbox"][0])
    sizes = [float(span.get("size") or 0) for span in spans if span.get("size")]
    em = max(6.0, _median(sizes) or 11.0)
    gaps = 0
    for previous, current in zip(spans, spans[1:]):
        if current["bbox"][0] - previous["bbox"][2] > INDENT_TABLE_CELL_GAP_EM * em:
            gaps += 1
    return gaps


def _looks_like_table_row(unit: dict) -> bool:
    if unit.get("table_row") or unit.get("source") == "table" or unit.get("role") == "table":
        return True
    if _span_cell_gaps(unit) >= 1:
        return True
    text = unit.get("text") or ""
    if "\t" in text or text.count("  ") >= 3:
        return True
    return False


def _mark_indent_table_units(units: list[dict]) -> set[int]:
    """Identify table text via row geometry, side-by-side narrow blocks, and drawings.

    Returns indexes into ``units`` that must be skipped (no unit, no issue).
    """
    table_ids: set[int] = set()
    by_page: dict[int, list[tuple[int, dict]]] = defaultdict(list)
    drawings_by_page: dict[int, list[dict]] = defaultdict(list)

    for index, unit in enumerate(units):
        page = int(unit.get("page_index") or 0)
        if unit.get("has_drawing") and _has_box(unit) and not _text(unit):
            drawings_by_page[page].append(unit)
            continue
        if not _has_box(unit) or not _text(unit):
            continue
        by_page[page].append((index, unit))

    for page, items in by_page.items():
        # Seed from explicit / span-gap table rows.
        for index, unit in items:
            if _looks_like_table_row(unit):
                table_ids.add(index)

        # Borderless layout: several narrow blocks side by side at the same height.
        # Units are usually pre-merged; still catch unmerged peers by y-band.
        bands: dict[int, list[tuple[int, dict]]] = defaultdict(list)
        for index, unit in items:
            y_key = int(round(unit["bbox"][1] / 4.0) * 4)
            bands[y_key].append((index, unit))
        for peers in bands.values():
            if len(peers) < 2:
                continue
            page_w = float(peers[0][1].get("page_width") or 612.0)
            narrow = [
                (index, unit)
                for index, unit in peers
                if (unit["bbox"][2] - unit["bbox"][0]) <= INDENT_TABLE_NARROW_PAGE_SHARE * page_w
            ]
            if len(narrow) < 2:
                continue
            ordered = sorted(narrow, key=lambda item: item[1]["bbox"][0])
            side_by_side = 0
            for previous, current in zip(ordered, ordered[1:]):
                if current[1]["bbox"][0] >= previous[1]["bbox"][2] - 2:
                    side_by_side += 1
            if side_by_side >= 1:
                for index, _unit in ordered:
                    table_ids.add(index)

        # Text inside or hugging a drawn rectangle / image is table-or-figure chrome.
        for drawing in drawings_by_page.get(page, []):
            db = drawing["bbox"]
            pad = 6.0
            region = [db[0] - pad, db[1] - pad, db[2] + pad, db[3] + pad]
            inside = []
            for index, unit in items:
                box = unit["bbox"]
                if box[0] >= region[0] and box[2] <= region[2] and box[1] >= region[1] and box[3] <= region[3]:
                    inside.append(index)
            if len(inside) >= 2:
                table_ids.update(inside)

        # Grow seeded table columns: absorb nearby narrow column-aligned lines.
        page_w_default = float((items[0][1].get("page_width") if items else 612.0) or 612.0)
        for _ in range(6):
            anchors = [units[i] for i in table_ids if i < len(units) and _has_box(units[i])]
            if not anchors:
                break
            lefts = sorted({round(float(unit["bbox"][0]) / 4.0) * 4.0 for unit in anchors})
            changed = False
            for index, unit in items:
                if index in table_ids:
                    continue
                bbox = unit["bbox"]
                width = float(bbox[2]) - float(bbox[0])
                page_w = float(unit.get("page_width") or page_w_default)
                if width >= 0.85 * page_w:
                    continue
                left = float(bbox[0])
                if not any(abs(left - edge) <= 10.0 for edge in lefts):
                    continue
                near = any(
                    bbox[1] <= anchor["bbox"][3] + 40.0 and bbox[3] >= anchor["bbox"][1] - 40.0
                    for anchor in anchors
                )
                if not near:
                    continue
                table_ids.add(index)
                changed = True
            if not changed:
                break

    return table_ids


def _body_lines(units: list[dict]) -> list[dict]:
    table_ids = _mark_indent_table_units(units)
    lines = []
    for index, unit in enumerate(units):
        if index in table_ids:
            continue
        if not _text(unit):
            continue
        if _is_non_body_chrome(unit):
            continue
        if unit.get("has_drawing") and not _text(unit):
            continue
        if not _has_box(unit):
            continue
        if _looks_like_table_row(unit):
            continue
        lines.append(unit)
    return lines


def _first_body_line_ids(units: list[dict]) -> set[int]:
    """Identity of the first non-chrome body line on each page (by object id)."""
    by_page: dict[int, list[dict]] = defaultdict(list)
    table_ids = _mark_indent_table_units(units)
    for index, unit in enumerate(units):
        if index in table_ids or not _text(unit) or not _has_box(unit):
            continue
        if _is_non_body_chrome(unit):
            continue
        if unit.get("has_drawing") and not _text(unit):
            continue
        if _looks_like_table_row(unit):
            continue
        by_page[int(unit.get("page_index") or 0)].append(unit)
    first_ids: set[int] = set()
    for page, page_lines in by_page.items():
        if page <= 0 or not page_lines:
            continue
        ordered = sorted(page_lines, key=lambda u: (u["bbox"][1], u["bbox"][0], u.get("line_index") or 0))
        first_ids.add(id(ordered[0]))
    return first_ids


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
    """Ordinary line leading — ignore paragraph blanks that inflate the median."""
    gaps = []
    for previous, current in zip(block, block[1:]):
        gap = current["bbox"][1] - previous["bbox"][1]
        if gap > 0:
            gaps.append(gap)
    if not gaps:
        return 16.0
    # Keep gaps near the smallest positive spacing (soft-wrap leading).
    floor = min(gaps)
    tight = [gap for gap in gaps if gap <= 1.6 * floor + 1.0]
    return _median(tight) or _median(gaps) or 16.0


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


def _is_list_line(unit: dict) -> bool:
    if unit.get("list_item"):
        return True
    return bool(LIST_ITEM_RE.match(_text(unit)))


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
            if unit.get("table_row") or unit.get("source") == "table" or _looks_like_table_row(unit):
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

            # Flush-left after a full-width (or mid-length) line stays a
            # continuation unless the previous line is clearly short or the gap
            # is much larger than normal pitch — never on a small gap bump alone.
            if not indented and not prev_short and not flush_para_gap:
                current.append(unit)
                continue
            # New paragraph: indented after a short last line, gap, heading, or
            # full-width line (classic first-line indent with no extra spacing).
            if indented and (prev_short or large_gap or prev_heading or prev_full):
                close()
                current = [unit]
                continue
            # Flush paragraph style: only after a clearly short last line or a
            # much-larger-than-pitch blank (keeps consistently unindented docs
            # as real multi-paragraph fails when blanks/shorts are present).
            # List wraps after a short marker line are NOT new body paragraphs.
            if not indented and (prev_short or flush_para_gap):
                if _is_list_line(previous) or (current and _is_list_line(current[0])):
                    current.append(unit)
                    continue
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


def eligibility(
    paragraph: dict,
    units: list[dict],
    rule: dict,
    *,
    first_body_ids: set[int] | None = None,
) -> tuple[bool, str | None]:
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

    if first.get("table_row") or first.get("source") == "table" or _looks_like_table_row(first):
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
    if INDENT_SKIP_PAGE_CONTINUE and first_body_ids and id(first) in first_body_ids:
        # First body line on a page (chrome excluded) — never flag; often a wrap.
        return False, "page_top_body"
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
    first_body_ids = _first_body_line_ids(units)
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
        ok, skip_reason = eligibility(paragraph, units, rule, first_body_ids=first_body_ids)
        if not ok:
            meta["skipped"].append({"paragraph_id": paragraph["paragraph_id"], "reason": skip_reason})
            prev_was_list = is_list or skip_reason == "list"
            continue
        measured = measure_paragraph_indent(paragraph, indent_type)
        first = paragraph["lines"][0]
        opening = _first_words(_text(first))
        if measured is None:
            # No following line in the same block to measure against → Uncertain.
            meta["uncertain"] += 1
            stats.observe(True)
            meta.setdefault("needs_review", []).append(
                {
                    "paragraph_id": paragraph["paragraph_id"],
                    "measured": None,
                    "expected": expected,
                    "opening": opening,
                    "reason": "no_following_line",
                }
            )
            prev_was_list = False
            continue
        outcome = _classify(measured["measured_in"], expected, tolerance)
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

    # Score against the user's resolved rule only (never invent inches).
    # A high fail share is a real manuscript problem vs that rule — emit issues.
    # Do not abandon the category as "unreliable" just because many paragraphs fail.
    measured_values = [round(item["measured"]["measured_in"], 2) for item in evaluated]
    mode_value, mode_count = Counter(measured_values).most_common(1)[0]
    mode_share = mode_count / len(evaluated)

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
    review = list(meta.get("needs_review") or [])
    review.extend(
        {
            "paragraph_id": item["paragraph"]["paragraph_id"],
            "measured": item["measured"]["measured_in"],
            "expected": expected,
            "opening": item["opening"],
        }
        for item in uncertain_items
    )
    meta["needs_review"] = review
    return meta
