from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = (ROOT / "api" / "app" / "compliance.py").read_text(encoding="utf-8")
ML_PATH = ROOT / "machinelearning" / "app" / "compliance.py"
ml = ML_PATH.read_text(encoding="utf-8")


def replace_block(src: str, dst: str, start_pat: str) -> str:
    sm = re.search(start_pat, src, re.M)
    dm = re.search(start_pat, dst, re.M)
    if not sm or not dm:
        print("MISSING", start_pat)
        return dst
    s_start = sm.start()
    d_start = dm.start()
    se = re.search(r"^def |^class |^[A-Z_]+_RE = |^_[A-Z_]+ = ", src[s_start + 1 :], re.M)
    de = re.search(r"^def |^class |^[A-Z_]+_RE = |^_[A-Z_]+ = ", dst[d_start + 1 :], re.M)
    s_end = s_start + 1 + se.start() if se else len(src)
    d_end = d_start + 1 + de.start() if de else len(dst)
    block = src[s_start:s_end]
    print("sync", start_pat, "bytes", len(block))
    return dst[:d_start] + block + dst[d_end:]


# Ensure new constants exist in ML before block sync.
if "APA_REFERENCE_RE" not in ml:
    ml = ml.replace(
        'REFERENCE_HEADER_RE = re.compile(r"^(references|bibliography|works cited|literature cited)$", re.I)',
        "REFERENCE_HEADER_RE = re.compile(\n"
        '    r"^(?:references|bibliography|works cited|literature cited)\\b", re.I\n'
        ")\n"
        'APA_REFERENCE_RE = re.compile(r"\\([12]\\d{3}[a-z]?\\)")\n'
        'MLA_REFERENCE_RE = re.compile(r",\\s*[12]\\d{3}\\.?$")',
    )
    print("injected APA/MLA reference regexes")

if "_allowed_line_spacings" not in ml:
    block = re.search(r"^def _allowed_line_spacings\(.*?(?=^def )", API, re.M | re.S)
    if block:
        ml = ml.replace("def _check_spacing(", block.group(0) + "def _check_spacing(")
        print("inserted _allowed_line_spacings")

if "_is_title_or_cover_page" not in ml:
    block = re.search(r"^def _is_title_or_cover_page\(.*?(?=^def )", API, re.M | re.S)
    if block:
        ml = ml.replace("def _check_object_placement(", block.group(0) + "def _check_object_placement(")
        print("inserted _is_title_or_cover_page")

if "LIST_ITEM_RE" not in ml:
    block = re.search(r"^LIST_ITEM_RE = .*?(?=^def _check_indentation\()", API, re.M | re.S)
    if block:
        ml = ml.replace("def _check_indentation(", block.group(0) + "def _check_indentation(")
        print("inserted LIST_ITEM helpers")

markers = [
    r"^def _line_font_samples\(",
    r"^def _starts_paragraph\(",
    r"^def _pdf_alignment\(",
    r"^PROSE_REFERENCE_RE = ",
    r"^REFERENCE_HEADER_RE = ",
    r"^APA_REFERENCE_RE = ",
    r"^MLA_REFERENCE_RE = ",
    r"^_SPACING_STANDARDS = ",
    r"^def _spacing_matches\(",
    r"^def _allowed_line_spacings\(",
    r"^def _check_spacing\(",
    r"^def _observe_spacing\(",
    r"^LIST_ITEM_RE = ",
    r"^def _is_list_like_paragraph\(",
    r"^def _check_indentation\(",
    r"^def _check_alignment\(",
    r"^def _annotate_roles\(",
    r"^TABLE_LABEL_RE = ",
    r"^FIGURE_LABEL_RE = ",
    r"^def _is_title_or_cover_page\(",
    r"^def _check_object_placement\(",
    r"^def _check_citations\(",
    r"^def _is_table_like_unit\(",
    r"^def _section_starts\(",
    r"^def _check_pagination\(",
]

for pat in markers:
    if re.search(pat, API, re.M) and re.search(pat, ml, re.M):
        ml = replace_block(API, ml, pat)
    elif re.search(pat, API, re.M):
        print("ONLY IN API", pat)

ML_PATH.write_text(ml, encoding="utf-8")
print("wrote", ML_PATH)
