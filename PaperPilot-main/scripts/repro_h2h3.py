#!/usr/bin/env python3
"""Reproduce Heading 2/3 not flagged on the real manuscript PDF."""
from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

from app.compliance import _annotate_roles, _document_units, run_compliance_scan
from app.documents import parse_document

PDF = ROOT / "PAPERPILOT-FINAL_MANUSCRIPT.pdf"
KEYS = (
    "INTRODUCTION",
    "Background",
    "Statement",
    "Objectives",
    "Significance",
    "Scope",
    "Definition",
    "REVIEW",
    "Related",
    "Theoretical",
    "Conceptual",
    "METHODOLOGY",
    "Research Design",
    "Respondents",
    "Instruments",
    "Data Gathering",
    "ANALYSIS",
    "SUMMARY",
    "CONCLUSION",
    "RECOMMENDATION",
    "1.1",
    "1.2",
    "2.1",
    "3.1",
)


def make_rules(h1=14, h2=12, h3=11):
    return {
        "font": {
            "heading1_size": h1,
            "heading2_size": h2,
            "heading3_size": h3,
            "body_size": 11,
            "type": "Times New Roman",
            "families": ["Times New Roman"],
            "heading_styles": {
                "heading1": {"bold": True, "alignment": "center"},
                "heading2": {"bold": True, "alignment": "left"},
                "heading3": {"bold": True, "alignment": "left"},
            },
        }
    }


def main() -> None:
    parsed = parse_document(PDF.read_bytes(), "pdf")
    rules = make_rules()
    units = _document_units(parsed, rules)
    _annotate_roles(units, rules)
    print("role counts", dict(Counter(u.get("role") for u in units)))
    print("--- likely section titles ---")
    for u in units:
        t = (u.get("text") or "").strip()
        if not t or len(t) >= 90:
            continue
        if not any(k.lower() in t.lower() for k in KEYS):
            continue
        print(
            f"role={u.get('role')!s:15} size={u.get('dominant_size')} "
            f"page={u.get('page_index')} text={t!r}"
        )

    for label, r in (
        ("H1=20", make_rules(h1=20)),
        ("H2=20", make_rules(h2=20)),
        ("H3=20", make_rules(h3=20)),
    ):
        issues = run_compliance_scan(parsed, r, tier="free")["issues"]
        heading = [
            i.get("title")
            for i in issues
            if "Heading" in (i.get("title") or "")
            or "heading" in (i.get("issue_type") or "")
        ]
        print(f"=== {label} heading issues ({len(heading)}) ===")
        for title in heading:
            print(" ", title)


if __name__ == "__main__":
    main()
