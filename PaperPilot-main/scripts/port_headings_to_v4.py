#!/usr/bin/env python3
"""Port Heading 2..N + related helpers onto paperpilot-ml V4 without wiping Captions."""
from __future__ import annotations

import re
from pathlib import Path

SRC = Path(
    r"c:\Users\vince\Downloads\PaperPilot-main\PaperPilot-main\machinelearning\app\compliance.py"
)
DST = Path(
    r"c:\Users\vince\Downloads\PaperPilot-main\PaperPilot-main\api\app\compliance.py"
)


def main() -> None:
    src = SRC.read_text(encoding="utf-8")
    dst = DST.read_text(encoding="utf-8")

    helpers_match = re.search(
        r"(# Small words allowed inside Title Case section headings.*?"
        r"\ndef _resolve_section_title_pending\(.*?\n)(\ndef _looks_like_heading_line)",
        src,
        re.S,
    )
    if not helpers_match:
        raise SystemExit("helpers not found in src")
    helpers = helpers_match.group(1)

    annotate_match = re.search(
        r"(def _annotate_roles\(units: list\[dict\], rules: dict\) -> None:.*?\n    _mark_toc_lines\(units\)\n)",
        src,
        re.S,
    )
    if not annotate_match:
        raise SystemExit("annotate_roles not found in src")
    annotate = annotate_match.group(1)

    if "_is_caption_prose_reference" in dst:
        annotate = annotate.replace(
            "and not PROSE_REFERENCE_RE.match(\n            text\n        )",
            "and not _is_caption_prose_reference(\n            text\n        )",
        )
    if "YEAR_RANGE_HEADING_RE" in dst and "YEAR_RANGE_HEADING_RE" not in annotate:
        annotate = annotate.replace(
            "if heading_line and NUMBERED_HEADING_RE.match(text):",
            "if heading_line and not YEAR_RANGE_HEADING_RE.match(text) and NUMBERED_HEADING_RE.match(text):",
        )
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

    if "_is_section_heading_title" not in dst:
        dst = dst.replace(
            "def _looks_like_heading_line(unit: dict, text: str) -> bool:",
            helpers + "def _looks_like_heading_line(unit: dict, text: str) -> bool:",
            1,
        )
    else:
        # Replace existing helpers block if present.
        old_helpers = re.search(
            r"# Small words allowed inside Title Case section headings.*?"
            r"\ndef _resolve_section_title_pending\(.*?\n(?=\ndef _looks_like_heading_line)",
            dst,
            re.S,
        )
        if old_helpers:
            dst = dst[: old_helpers.start()] + helpers + dst[old_helpers.end() :]

    annotate_dst = re.search(
        r"def _annotate_roles\(units: list\[dict\], rules: dict\) -> None:.*?\n    _mark_toc_lines\(units\)\n",
        dst,
        re.S,
    )
    if not annotate_dst:
        raise SystemExit("annotate_roles not found in dst")
    dst = dst[: annotate_dst.start()] + annotate + dst[annotate_dst.end() :]
    DST.write_text(dst, encoding="utf-8")

    text = DST.read_text(encoding="utf-8")
    for needle in (
        "_is_section_heading_title",
        "_resolve_section_title_pending",
        "section_title_pending",
        "h2_plus_rules",
        "_is_caption_prose_reference",
        "YEAR_RANGE_HEADING_RE",
        "Checking captions",
    ):
        print(f"{needle}: {needle in text}")


if __name__ == "__main__":
    main()
