#!/usr/bin/env python3
"""Why section titles become table / heading_other instead of heading2."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

from app.compliance import (
    _annotate_roles,
    _document_units,
    _is_short_standalone_title,
    _is_structural_heading_text,
    _looks_like_heading_line,
)
from app.documents import parse_document
from app.indent_check import _looks_like_table_row, _mark_indent_table_units

PDF = ROOT / "PAPERPILOT-FINAL_MANUSCRIPT.pdf"
TARGETS = {
    "INTRODUCTION",
    "Objectives of the Study",
    "Scope and Limitations of the Study",
    "Significance of the Study",
    "Definition of Terms",
    "Theoretical Background",
    "Review of Related Literature",
    "Software Engineering Methodology",
}


def main() -> None:
    parsed = parse_document(PDF.read_bytes(), "pdf")
    rules = {
        "font": {
            "heading1_size": 14,
            "heading2_size": 12,
            "heading3_size": 11,
            "body_size": 11,
            "heading_styles": {
                "heading1": {"bold": True},
                "heading2": {"bold": True},
                "heading3": {"bold": True},
            },
        }
    }
    units = _document_units(parsed, rules)
    table_ids = _mark_indent_table_units(units)
    for u in units:
        t = (u.get("text") or "").strip()
        if t not in TARGETS:
            continue
        idx = units.index(u)
        print("=" * 60)
        print("text:", t)
        print("page:", u.get("page_index"), "size:", u.get("dominant_size") or u.get("size"))
        print("style:", u.get("style"), "source:", u.get("source"), "table_row:", u.get("table_row"))
        print("in table_ids:", idx in table_ids)
        print("looks_like_table_row:", _looks_like_table_row(u))
        print("looks_like_heading_line:", _looks_like_heading_line(u, t))
        print("structural:", _is_structural_heading_text(t))
        print("short_standalone:", _is_short_standalone_title(t))
        print("bbox/gaps:", {k: u.get(k) for k in ("x0", "x1", "y0", "y1", "left", "right", "width") if u.get(k) is not None})
        print("formatting:", u.get("formatting"))
    _annotate_roles(units, rules)
    print("\n--- after annotate ---")
    for u in units:
        t = (u.get("text") or "").strip()
        if t in TARGETS:
            print(t, "->", u.get("role"))


if __name__ == "__main__":
    main()
