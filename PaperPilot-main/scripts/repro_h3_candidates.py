#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

from app.compliance import NUMBERED_HEADING_RE, _document_units, _is_short_standalone_title
from app.documents import parse_document

PDF = ROOT / "PAPERPILOT-FINAL_MANUSCRIPT.pdf"


def main() -> None:
    parsed = parse_document(PDF.read_bytes(), "pdf")
    units = _document_units(parsed, {"font": {"heading1_size": 14, "heading2_size": 12, "heading3_size": 11}})
    n_num = 0
    for u in units:
        t = (u.get("text") or "").strip()
        if not t or len(t) > 100:
            continue
        if NUMBERED_HEADING_RE.match(t):
            n_num += 1
            print("NUMBERED", repr(t[:90]), "page", u.get("page_index"))
    print("total numbered heading-like", n_num)
    # bold-ish short lines near chapter pages
    for u in units:
        t = (u.get("text") or "").strip()
        if not t or len(t.split()) > 10:
            continue
        if u.get("page_index") in {11, 13, 19, 21, 31} and t[:1].isupper():
            print("p", u.get("page_index"), "size", u.get("dominant_size"), repr(t))


if __name__ == "__main__":
    main()
