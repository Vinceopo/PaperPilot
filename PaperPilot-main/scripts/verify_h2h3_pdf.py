#!/usr/bin/env python3
"""Verify H2/H3 flags on the real manuscript PDF; prove H1 unchanged."""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

from app.compliance import _annotate_roles, _document_units, run_compliance_scan
from app.documents import parse_document

PDF = ROOT / "PAPERPILOT-FINAL_MANUSCRIPT.pdf"


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


def heading_summary(result):
    issues = result.get("issues") or []
    titles = [i.get("title") for i in issues if "Heading" in (i.get("title") or "")]
    types = Counter(
        i.get("issue_type")
        for i in issues
        if "heading" in (i.get("issue_type") or "") or i.get("issue_type", "").startswith("font_size")
    )
    return titles, dict(types)


def main() -> None:
    parsed = parse_document(PDF.read_bytes(), "pdf")
    units = _document_units(parsed, make_rules())
    _annotate_roles(units, make_rules())
    roles = Counter(u.get("role") for u in units)
    print("roles", dict(roles))
    for role in ("heading1", "heading2", "heading3"):
        print(f"--- {role} samples ---")
        n = 0
        for u in units:
            if u.get("role") != role:
                continue
            print(repr((u.get("text") or "")[:70]), "size", u.get("dominant_size"))
            n += 1
            if n >= 8:
                break

    baseline = run_compliance_scan(parsed, make_rules(h1=14, h2=12, h3=11), tier="free")
    h1_wrong = run_compliance_scan(parsed, make_rules(h1=20, h2=12, h3=11), tier="free")
    h2_wrong = run_compliance_scan(parsed, make_rules(h1=14, h2=20, h3=11), tier="free")
    h3_wrong = run_compliance_scan(parsed, make_rules(h1=14, h2=12, h3=20), tier="free")

    for label, result in (
        ("baseline", baseline),
        ("H1=20", h1_wrong),
        ("H2=20", h2_wrong),
        ("H3=20", h3_wrong),
    ):
        titles, types = heading_summary(result)
        print(f"=== {label} ===", types)
        for t in titles:
            print(" ", t)

    # Category scores aside from Fonts should match across H2/H3 rule changes.
    def breakdown(result):
        scoring = result.get("scoring") or {}
        return {
            k: v
            for k, v in (scoring.get("breakdown") or scoring).items()
            if k != "Fonts"
        } if isinstance(scoring, dict) else {}

    b_base = json.dumps(breakdown(baseline), sort_keys=True)
    b_h2 = json.dumps(breakdown(h2_wrong), sort_keys=True)
    b_h3 = json.dumps(breakdown(h3_wrong), sort_keys=True)
    print("non-Fonts breakdown unchanged H2 vs baseline?", b_base == b_h2)
    print("non-Fonts breakdown unchanged H3 vs baseline?", b_base == b_h3)


if __name__ == "__main__":
    main()
