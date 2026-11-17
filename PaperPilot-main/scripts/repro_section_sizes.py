#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

from app.compliance import _annotate_roles, _document_units, _dominant_size
from app.documents import parse_document

PDF = ROOT / "PAPERPILOT-FINAL_MANUSCRIPT.pdf"
TARGETS = {
    "INTRODUCTION",
    "Objectives of the Study",
    "Theoretical Background",
    "Software Engineering Methodology",
    "Analysis-Design Phase",
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
    for u in units:
        t = (u.get("text") or "").strip()
        if t not in TARGETS:
            continue
        print(
            t,
            "dom",
            _dominant_size(u),
            "bold",
            u.get("bold"),
            "fonts",
            (u.get("fonts") or u.get("font_samples") or u.get("runs"))[:3]
            if isinstance(u.get("fonts") or u.get("font_samples") or u.get("runs"), list)
            else u.get("fonts") or u.get("formatting"),
        )


if __name__ == "__main__":
    main()
