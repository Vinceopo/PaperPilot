#!/usr/bin/env python3
"""Port latest heading precision + mechanics extraction onto paperpilot-ml V4 tip."""
from __future__ import annotations

import re
import shutil
from pathlib import Path

API = Path(r"c:\Users\vince\Downloads\PaperPilot-main\PaperPilot-main\api\app")
DST = Path(r"C:\Users\vince\AppData\Local\Temp\paperpilot-ml-deploy\app")


def replace_block(dst: str, src: str, start: str, end_lookahead: str) -> str:
    pat = re.compile(
        re.escape(start) + r".*?(?=" + end_lookahead + r")",
        re.S,
    )
    src_m = pat.search(src)
    dst_m = pat.search(dst)
    if not src_m or not dst_m:
        raise SystemExit(f"block not found for {start!r}: src={bool(src_m)} dst={bool(dst_m)}")
    return dst[: dst_m.start()] + src_m.group(0) + dst[dst_m.end() :]


def main() -> None:
    api_comp = (API / "compliance.py").read_text(encoding="utf-8")
    dst_comp = (DST / "compliance.py").read_text(encoding="utf-8")

    # Heading helpers through resolve (before _looks_like_heading_line)
    dst_comp = replace_block(
        dst_comp,
        api_comp,
        "# Small words allowed inside Title Case section headings",
        r"def _looks_like_heading_line",
    )

    # annotate_roles
    ann_src = re.search(
        r"(def _annotate_roles\(units: list\[dict\], rules: dict\) -> None:.*?\n)(?=def _body_size_targets)",
        api_comp,
        re.S,
    )
    ann_dst = re.search(
        r"(def _annotate_roles\(units: list\[dict\], rules: dict\) -> None:.*?\n)(?=def _body_size_targets)",
        dst_comp,
        re.S,
    )
    if not ann_src or not ann_dst:
        raise SystemExit("annotate_roles not found")
    annotate = ann_src.group(1)
    # Keep V4 caption prose helper + year-range if present
    if "_is_caption_prose_reference" in dst_comp:
        annotate = annotate.replace(
            "and not PROSE_REFERENCE_RE.match(\n            text\n        )",
            "and not _is_caption_prose_reference(\n            text\n        )",
        )
    if "YEAR_RANGE_HEADING_RE" in dst_comp and "YEAR_RANGE_HEADING_RE" not in annotate:
        annotate = annotate.replace(
            "if heading_line and NUMBERED_HEADING_RE.match(text):",
            "if heading_line and not YEAR_RANGE_HEADING_RE.match(text) and NUMBERED_HEADING_RE.match(text):",
        )
    # Keep V4 table source sync
    if 'unit["source"] = "table"' in ann_dst.group(1) and 'unit["source"] = "table"' not in annotate:
        annotate = annotate.replace(
            '            unit["role"] = "table"\n'
            "            continue\n"
            "        if (TABLE_CAPTION_RE.match(text) or FIGURE_CAPTION_RE.match(text))",
            '            unit["role"] = "table"\n'
            "            # Keep source/table_row in sync so spacing + indent skip the same cells.\n"
            '            unit["source"] = "table"\n'
            '            unit["table_row"] = True\n'
            "            continue\n"
            "        if (TABLE_CAPTION_RE.match(text) or FIGURE_CAPTION_RE.match(text))",
        )
    dst_comp = dst_comp[: ann_dst.start()] + annotate + dst_comp[ann_dst.end() :]

    # Font check: skip heading_uncertain
    if '"heading_uncertain"' not in dst_comp.split("def _check_fonts")[1][:2500]:
        dst_comp = dst_comp.replace(
            'role in {"empty", "pagination", "figure", "toc"}',
            'role in {"empty", "pagination", "figure", "toc", "heading_uncertain"}',
            1,
        )
        dst_comp = dst_comp.replace(
            'if role == "heading_other" or (_is_heading_role(role) and expected_size is None):',
            'if role in {"heading_other", "heading_uncertain"} or (\n'
            "            _is_heading_role(role) and expected_size is None\n"
            "        ):",
            1,
        )

    (DST / "compliance.py").write_text(dst_comp, encoding="utf-8")

    # Extraction + schema removals from API
    for name in ("documents.py", "mechanics_options.py", "mechanics_validate.py"):
        shutil.copy2(API / name, DST / name)

    text = (DST / "compliance.py").read_text(encoding="utf-8")
    for needle in (
        "_section_title_confidence",
        "heading_uncertain",
        "SECTION_TITLE_CONFIDENCE_THRESHOLD",
        "_is_caption_prose_reference",
        "Checking captions",
        "stats[\"Captions\"]",
        "needs_review",
        "Never invent Portrait",
    ):
        # needs_review / Portrait live in documents.py
        loc = text if needle.startswith("_") or needle.startswith("SECTION") or needle.startswith("Checking") or needle.startswith("stats") or needle.startswith("heading") or "caption" in needle else (DST / "documents.py").read_text(encoding="utf-8")
        print(f"{needle}: {needle in loc}")


if __name__ == "__main__":
    main()
