"""Port fixed caption line-structure checks from api → machinelearning compliance."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = (ROOT / "api" / "app" / "compliance.py").read_text(encoding="utf-8")
ML_PATH = ROOT / "machinelearning" / "app" / "compliance.py"
ml = ML_PATH.read_text(encoding="utf-8")

PROSE_INSERT = r'''
# Narrative verbs after Table/Figure N (any casing) → body reference, not a caption.
_CAPTION_NARRATIVE_VERB_RE = re.compile(
    r"(?i)^\s*(?:table|figure|fig\.?)\s+\d+(?:\.\d+)*\s*[:.\-\u2013]?\s*"
    r"(?:"
    r"presents?|shows?|illustrates?|depicts?|displays?|contains?|lists?|"
    r"summarizes?|provides?|describes?|indicates?|demonstrates?|reveals?|"
    r"highlights?|outlines?|compares?|reports?|includes?|gives?|explains?|"
    r"discusses?|examines?|introduces?|represents?|defines?|details?|"
    r"covers?|follows?|appears?|refers?|corresponds?"
    r")\b"
)
_CAPTION_LABEL_HEAD_RE = re.compile(
    r"(?i)^\s*(?:table|figure|fig\.?)\s+(\d+(?:\.\d+)*)\b\s*[:.\-\u2013]?\s*(.*)$"
)


def _is_caption_prose_reference(text: str) -> bool:
    """True when a Table/Figure line is body narrative, not a caption label."""
    raw = " ".join(str(text or "").split()).strip()
    if not raw:
        return False
    if _CAPTION_NARRATIVE_VERB_RE.match(raw):
        return True
    match = _CAPTION_LABEL_HEAD_RE.match(raw)
    if not match:
        return False
    remainder = (match.group(2) or "").strip()
    if not remainder:
        return False
    words = remainder.split()
    if len(words) >= 12:
        return True
    if len(remainder) >= 80 and ("," in remainder or "." in remainder[8:]):
        return True
    if PROSE_REFERENCE_RE.match(raw) and len(words) >= 6:
        return True
    return False

'''

RULE_UNSET = '''
def rule_unset(value) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and not value.strip():
        return True
    if isinstance(value, (list, tuple, dict)) and not value:
        return True
    if isinstance(value, (list, tuple, dict)):
        return False
    text = str(value).strip().lower()
    return text in {"", "ignore", "n/a", "na", "none", "null"}

'''

OLD_FLAG = '''def _flag_caption(
    collector: IssueCollector,
    issue_type: str,
    unit: dict,
    title: str,
    detail: str,
    fix: str,
    *,
    measured=None,
    expected=None,
    excerpt: str | None = None,
) -> None:
    loc = _unit_location(
        unit,
        "Captions",
        measured=measured,
        expected=expected,
        element=unit.get("role") or "caption",
    )
    # Prefer a caption-specific excerpt (label + title) so later Figure N issues
    # do not collapse onto the first matching "Figure" / line estimate.
    hint = " ".join(str(excerpt or "").split()).strip()
    if hint:
        loc["excerpt"] = hint[:140]
    collector.add(
        issue_type,
        "minor",
        title,
        "This table or figure does not follow the layout saved in format mechanics.",
        detail,
        fix,
        loc,
    )
'''

NEW_FLAG = '''def _flag_caption(
    collector: IssueCollector,
    issue_type: str,
    unit: dict,
    title: str,
    detail: str,
    fix: str,
    *,
    measured=None,
    expected=None,
    excerpt: str | None = None,
) -> None:
    loc = _unit_location(unit, "Captions")
    if measured is not None:
        loc["measured_value"] = measured
    if expected is not None:
        loc["expected_value"] = expected
    if unit.get("role"):
        loc["element"] = unit.get("role")
    # Prefer a caption-specific excerpt (label + title) so later Figure N issues
    # do not collapse onto the first matching "Figure" / line estimate.
    hint = " ".join(str(excerpt or "").split()).strip()
    if hint:
        loc["excerpt"] = hint[:140]
    collector.add(
        issue_type,
        "minor",
        title,
        "This table or figure does not follow the layout saved in format mechanics.",
        detail,
        fix,
        loc,
    )
'''


def main() -> None:
    global ml
    if "_CAPTION_NARRATIVE_VERB_RE" not in ml:
        anchor = (
            "PROSE_REFERENCE_RE = re.compile(\n"
            '    r"^\\s*(?:[Tt]able|[Ff]igure|TABLE|FIGURE)\\s+\\d+(?:\\.\\d+)*\\s*(?:[:.\\-\\u2013]\\s*)?(?=[a-z])"\n'
            ")\n"
        )
        if anchor not in ml:
            raise SystemExit("PROSE_REFERENCE_RE anchor not found")
        ml = ml.replace(anchor, anchor + PROSE_INSERT, 1)
        print("inserted prose helpers")

    if "def rule_unset(" not in ml:
        if "TABLE_LABEL_RE = re.compile" not in ml:
            raise SystemExit("TABLE_LABEL_RE not found")
        ml = ml.replace("TABLE_LABEL_RE = re.compile", RULE_UNSET + "TABLE_LABEL_RE = re.compile", 1)
        print("inserted rule_unset")

    start = API.find('CAPTION_LINE_ONE = "one_line"')
    end = API.find("\ndef _expected_citation_families(")
    if start < 0 or end < 0:
        raise SystemExit(f"api block markers missing {start} {end}")
    api_block = API[start:end]
    if OLD_FLAG not in api_block:
        raise SystemExit("API _flag_caption block not found for ML adaptation")
    api_block = api_block.replace(OLD_FLAG, NEW_FLAG)

    ml_start = ml.find("def _layout_expectations(")
    ml_end = ml.find("\ndef _expected_citation_families(")
    if ml_start < 0 or ml_end < 0:
        raise SystemExit(f"ml block markers missing {ml_start} {ml_end}")

    # Drop duplicate helpers that already live above TABLE_LABEL_RE in the API block path.
    # api_block starts at CAPTION_LINE_ONE and includes _layout_expectations…_check_captions.
    ml = ml[:ml_start] + "\n\n" + api_block + ml[ml_end:]
    ML_PATH.write_text(ml, encoding="utf-8")
    print("wrote", ML_PATH)
    for name in (
        "CAPTION_LINE_ONE",
        "_parse_caption_line_structure",
        "_caption_nearby_title",
        "_detect_caption_line_structure",
        "_is_caption_prose_reference",
    ):
        print(name, name in ml)


if __name__ == "__main__":
    main()
