"""Indentation checker tests using real PDF bytes (PyMuPDF), not only synthetic units.

Fixtures are generated at known geometry so exporters differ only by how we place
text — clean set must produce zero indent issues; dirty set must flag known misses.
"""

from __future__ import annotations

import unittest
from io import BytesIO

import fitz

from app.compliance import CategoryStats, IssueCollector, _check_indentation, _check_margins, _check_pagination
from app.documents import normalize_mechanics_rules, parse_document
from app.indent_check import (
    INDENT_DEFAULT_TOLERANCE_IN,
    INDENT_SAFETY_MARGIN_IN,
    check_pdf_indentation,
    indent_prose_paragraphs,
    resolve_indent_rule,
)
from app.scoring import build_scoring_payload


PT = 72.0
PAGE_W, PAGE_H = 612.0, 792.0
BODY_LEFT = 72.0  # 1" left margin body edge


def _pdf_with_paragraphs(paragraphs, *, indent_in=0.5, page_label=None):
    """Build a one-page PDF. paragraphs: list of list[str] (lines of each para)."""
    doc = fitz.open()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = 100.0
    fontsize = 11
    for lines in paragraphs:
        for index, text in enumerate(lines):
            x = BODY_LEFT + (indent_in * PT if index == 0 else 0.0)
            page.insert_text((x, y), text, fontsize=fontsize, fontname="helv")
            y += 16
        y += 10  # paragraph gap
    if page_label is not None:
        page.insert_text((PAGE_W / 2 - 10, PAGE_H - 36), str(page_label), fontsize=10, fontname="helv")
    data = doc.tobytes()
    doc.close()
    return data


def _pdf_list_and_body():
    doc = fitz.open()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = 100.0
    # Numbered list with wrap
    page.insert_text((BODY_LEFT + 36, y), "1. Students will submit the research proposal before the deadline.", fontsize=11, fontname="helv")
    y += 16
    page.insert_text((BODY_LEFT + 54, y), "and include the signed ethics form with the packet.", fontsize=11, fontname="helv")
    y += 28
    # Proper body paragraph with 0.5" indent
    page.insert_text((BODY_LEFT + 36, y), "Body paragraph opening that follows the list and should be checked.", fontsize=11, fontname="helv")
    y += 16
    page.insert_text((BODY_LEFT, y), "Continuation of the body paragraph sits flush on the body edge here.", fontsize=11, fontname="helv")
    data = doc.tobytes()
    doc.close()
    return data


def _pdf_flush_continuation_after_fullwidth():
    """Dense lines then a flush-left line after a full-width line (must NOT flag)."""
    doc = fitz.open()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = 80.0
    page.insert_text((BODY_LEFT + 36, y), "Opening indented line for a long paragraph that fills the measure.", fontsize=11, fontname="helv")
    y += 16
    for i in range(6):
        page.insert_text(
            (BODY_LEFT, y),
            f"Full width continuation line {i} that reaches near the right margin edge xx.",
            fontsize=11,
            fontname="helv",
        )
        y += 16
    # Larger gap, still flush-left continuation after full-width prior line
    y += 12
    page.insert_text(
        (BODY_LEFT, y),
        "Flush left continuation after full-width prior line must stay one paragraph.",
        fontsize=11,
        fontname="helv",
    )
    data = doc.tobytes()
    doc.close()
    return data


def _parse(data: bytes) -> dict:
    return parse_document(data, "pdf")


def _run_indent(parsed, rules):
    from app.compliance import _document_units, _annotate_roles

    units = _document_units(parsed, rules)
    _annotate_roles(units, rules)
    stats = CategoryStats()
    collector = IssueCollector()
    _check_indentation(units, rules, stats, collector)
    return stats, collector, units


class IndentRuleResolveTests(unittest.TestCase):
    def test_rule_matrix(self):
        cases = [
            ({"first_line_indent_inches": 0.5}, "first_line", 0.5),
            ({"indention": "0.5 inch"}, "first_line", 0.5),
            ({"indention": "1.27 cm"}, "first_line", unittest.mock.ANY),
            ({"indention": "36 pt"}, "first_line", 0.5),
            ({"indention": "0.5 inch TAB"}, "first_line", 0.5),
            ({"indention": "one tab"}, None, None),  # IGNORE
            ({"indention": "IGNORE"}, None, None),
            ({}, None, None),
            ({"indent_type": "hanging", "first_line_indent_inches": 0.5}, "hanging", 0.5),
            ({"indent_type": "none", "first_line_indent_inches": 0}, "none", 0.0),
            ({"first_line_indent_inches": 0.5, "indent_tolerance_inches": 0.05}, "first_line", 0.5),
        ]
        for rules, expected_type, expected_val in cases:
            with self.subTest(rules=rules):
                resolved = resolve_indent_rule(rules)
                if expected_type is None:
                    self.assertIsNone(resolved)
                else:
                    self.assertIsNotNone(resolved)
                    self.assertEqual(resolved["indent_type"], expected_type)
                    if expected_val is not unittest.mock.ANY:
                        self.assertAlmostEqual(resolved["value_in"], float(expected_val), places=2)

    def test_normalize_bare_tab_is_ignore(self):
        rules = normalize_mechanics_rules({"indention": "one tab"})
        self.assertNotIn("first_line_indent_inches", rules)
        self.assertIsNone(resolve_indent_rule(rules))

    def test_normalize_tab_with_equivalent(self):
        rules = normalize_mechanics_rules({"indention": "0.5 inch TAB"})
        self.assertAlmostEqual(rules["first_line_indent_inches"], 0.5, places=2)


class IndentPdfCleanDirtyTests(unittest.TestCase):
    def test_clean_half_inch_zero_issues(self):
        data = _pdf_with_paragraphs(
            [
                [
                    "First paragraph opens with a half inch indent on this line of text.",
                    "Its continuation stays on the body edge for the rest of the paragraph.",
                ],
                [
                    "Second paragraph also opens with a half inch indent as required here.",
                    "Continuation remains flush left at the block baseline edge tonight.",
                ],
            ],
            indent_in=0.5,
        )
        parsed = _parse(data)
        stats, collector, _units = _run_indent(parsed, {"first_line_indent_inches": 0.5})
        self.assertEqual(collector.result(), [])
        self.assertEqual(stats.failed, 0)
        self.assertGreater(stats.checked, 0)

    def test_dirty_zero_indent_flags_correct_bbox(self):
        data = _pdf_with_paragraphs(
            [
                [
                    "Bad paragraph opens flush left instead of the required half inch indent.",
                    "Continuation stays on the body edge so measurement uses following lines.",
                ],
            ],
            indent_in=0.0,
            page_label="7",
        )
        parsed = _parse(data)
        stats, collector, _units = _run_indent(parsed, {"first_line_indent_inches": 0.5, "indention": "0.5 inch"})
        issues = collector.result()
        self.assertEqual(len(issues), 1)
        self.assertEqual(stats.failed, 1)
        self.assertEqual(stats.failed, issues[0]["count"])
        loc = issues[0]["locations"][0]
        self.assertIn("paragraph_id", loc)
        self.assertIn("measured_x0", loc)
        self.assertIn("baseline_x0", loc)
        self.assertIn("rule_snapshot", loc)
        self.assertEqual(loc.get("highlight_from"), "stored_bbox")
        self.assertEqual(loc.get("printed_page_label"), "7")
        self.assertLess(abs(loc["bbox"][0] - BODY_LEFT), 2.0)

    def test_list_wrap_not_flagged(self):
        parsed = _parse(_pdf_list_and_body())
        stats, collector, _units = _run_indent(parsed, {"first_line_indent_inches": 0.5})
        locs = [loc for iss in collector.result() for loc in iss["locations"]]
        for loc in locs:
            self.assertNotIn("signed ethics form", (loc.get("excerpt") or "").lower())

    def test_flush_after_fullwidth_not_new_paragraph(self):
        parsed = _parse(_pdf_flush_continuation_after_fullwidth())
        from app.compliance import _document_units, _annotate_roles

        units = _document_units(parsed, {"first_line_indent_inches": 0.5})
        _annotate_roles(units, {"first_line_indent_inches": 0.5})
        paras = indent_prose_paragraphs(units)
        # Should be a single body paragraph (plus maybe nothing else).
        body = [p for p in paras if len(p["lines"]) >= 2]
        self.assertTrue(body)
        joined = " ".join(line.get("text") or "" for line in body[0]["lines"])
        self.assertIn("Flush left continuation", joined)

    def test_ignore_rule_zero_units(self):
        data = _pdf_with_paragraphs(
            [
                [
                    "Paragraph text that would otherwise be checked for indentation rules.",
                    "Continuation line of the same paragraph on the body edge tonight.",
                ],
            ],
            indent_in=0.0,
        )
        parsed = _parse(data)
        stats, collector, _units = _run_indent(parsed, {})
        self.assertEqual(stats.checked, 0)
        self.assertEqual(stats.failed, 0)
        self.assertFalse(stats.applicable)
        self.assertEqual(collector.result(), [])

    def test_count_consistency_one_issue_per_failed_unit(self):
        data = _pdf_with_paragraphs(
            [
                [
                    "Alpha paragraph missing indent and long enough to form two visual lines.",
                    "Alpha continuation stays on the body edge of the column block here.",
                ],
                [
                    "Beta paragraph also missing indent with a second line for measurement.",
                    "Beta continuation remains flush at the shared block baseline edge.",
                ],
            ],
            indent_in=0.0,
        )
        parsed = _parse(data)
        stats, collector, _units = _run_indent(parsed, {"first_line_indent_inches": 0.5})
        issues = collector.result()
        total_locs = sum(iss["count"] for iss in issues)
        self.assertEqual(stats.failed, total_locs)
        payload = build_scoring_payload({"Indentation": stats, **{
            name: CategoryStats() for name in ("Fonts", "Margins", "Spacing", "Alignment", "Pagination", "Citations")
        }}, issues)
        indent = next(c for c in payload["scoring"]["categories"] if c["category"] == "Indentation")
        self.assertEqual(indent["units_failed"], indent["issue_occurrences"])

    def test_consistently_unindented_emits_real_issues_not_unreliable(self):
        """Many flush-left paragraphs vs a 0.5 inch rule are real fails, not unreliable."""
        from app.compliance import _unit_location
        from app.indent_check import INDENT_RELIABILITY_MIN_ELIGIBLE, check_pdf_indentation

        units = []
        y = 72.0
        n = INDENT_RELIABILITY_MIN_ELIGIBLE + 2
        for i in range(n):
            for j, text in enumerate(
                (
                    f"Unindented paragraph {i} opens flush left instead of the required half inch indent.",
                    f"Continuation {i} of that paragraph stays on the body edge for measurement work.",
                )
            ):
                units.append(
                    {
                        "page_index": 0,
                        "line_index": len(units),
                        "text": text,
                        "bbox": [BODY_LEFT, y, PAGE_W - 72, y + 12],
                        "page_width": PAGE_W,
                        "page_height": PAGE_H,
                        "column": (BODY_LEFT, PAGE_W - 72),
                        "formatting": {},
                        "source": "body",
                        "role": "body",
                        "spans": [{"size": 11, "text": text}],
                        "dominant_size": 11,
                    }
                )
                y += 16
            y += 40  # clear flush-paragraph blank (> 2× line pitch)
        stats = CategoryStats()
        collector = IssueCollector()
        check_pdf_indentation(
            units,
            {"first_line_indent_inches": 0.5},
            stats,
            collector,
            unit_location_fn=_unit_location,
        )
        self.assertFalse(getattr(stats, "unreliable", False))
        self.assertGreaterEqual(stats.failed, INDENT_RELIABILITY_MIN_ELIGIBLE)
        self.assertEqual(stats.failed, sum(iss["count"] for iss in collector.result()))

    def test_unreliable_category_excluded_from_overall_mean(self):
        fonts = CategoryStats()
        for _ in range(4):
            fonts.observe(True)
        fonts.applicable = True
        indent = CategoryStats()
        indent.applicable = True
        indent.unreliable = True
        indent.notice = "Could not check reliably: test notice."
        payload = build_scoring_payload(
            {
                "Fonts": fonts,
                "Margins": CategoryStats(),
                "Indentation": indent,
                "Spacing": CategoryStats(),
                "Alignment": CategoryStats(),
                "Pagination": CategoryStats(),
                "Citations": CategoryStats(),
            },
            [],
        )
        scoring = payload["scoring"]
        indent_row = next(c for c in scoring["categories"] if c["category"] == "Indentation")
        self.assertEqual(indent_row["status"], "could_not_check_reliably")
        self.assertEqual(indent_row["units_checked"], 0)
        self.assertEqual(indent_row["notice"], "Could not check reliably: test notice.")
        self.assertEqual(scoring["overall"]["categories"], ["Fonts"])
        self.assertAlmostEqual(scoring["overall"]["value"], 100.0, places=5)

    def test_scanned_empty_text_unreliable(self):
        doc = fitz.open()
        page = doc.new_page(width=PAGE_W, height=PAGE_H)
        # Image-only page: no text layer
        page.insert_image(fitz.Rect(72, 72, 300, 300), stream=_tiny_png())
        data = doc.tobytes()
        doc.close()
        # parse may still yield empty lines
        parsed = {
            "text": "",
            "metadata": {"format": "pdf"},
            "pages": [{"page_index": 0, "width_points": PAGE_W, "height_points": PAGE_H, "lines": [], "images": []}],
        }
        stats = CategoryStats()
        collector = IssueCollector()
        from app.compliance import _unit_location

        meta = check_pdf_indentation(
            [],
            {"first_line_indent_inches": 0.5},
            stats,
            collector,
            unit_location_fn=_unit_location,
        )
        # empty units → no text → unreliable
        self.assertEqual(meta["status"], "unreliable")
        self.assertEqual(collector.result(), [])
        self.assertEqual(stats.checked, 0)


def _tiny_png() -> bytes:
    # 1x1 PNG
    import base64

    return base64.b64decode(
        b"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )


class IndentDoesNotChangeMarginsPagination(unittest.TestCase):
    def test_margins_pagination_untouched_on_same_pdf(self):
        data = _pdf_with_paragraphs(
            [
                [
                    "Margin and pagination control paragraph with half inch first line indent.",
                    "Continuation line used only so indentation has something to measure against.",
                ],
            ],
            indent_in=0.5,
            page_label="3",
        )
        parsed = _parse(data)
        rules = {
            "first_line_indent_inches": 0.5,
            "margins_inches": {"top": 1.0, "bottom": 1.0, "left": 1.0, "right": 1.0},
            "pagination": {"position": "bottom center"},
        }
        from app.compliance import _document_units, _annotate_roles

        units = _document_units(parsed, rules)
        _annotate_roles(units, rules)

        margin_a, margin_b = CategoryStats(), CategoryStats()
        page_a, page_b = CategoryStats(), CategoryStats()
        ca, cb = IssueCollector(), IssueCollector()
        _check_margins(parsed, units, rules, margin_a, ca)
        _check_margins(parsed, units, rules, margin_b, cb)
        _check_pagination(units, rules, page_a, ca, parsed)
        _check_pagination(units, rules, page_b, cb, parsed)
        self.assertEqual(margin_a.checked, margin_b.checked)
        self.assertEqual(margin_a.failed, margin_b.failed)
        self.assertEqual(page_a.checked, page_b.checked)
        self.assertEqual(page_a.failed, page_b.failed)


class IndentMechanicsPdfDocxParity(unittest.TestCase):
    def test_same_rule_wording_pdf_and_docx_mechanics(self):
        from app.documents import derive_mechanics_rules
        from docx import Document

        wording = "Indention: 0.5 inch first-line indent for body paragraphs."
        # PDF mechanics → extract text then derive
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((72, 72), wording, fontsize=12, fontname="helv")
        pdf_bytes = doc.tobytes()
        doc.close()
        pdf_parsed = parse_document(pdf_bytes, "pdf")
        pdf_rules = derive_mechanics_rules(pdf_parsed.get("text") or wording)

        # DOCX mechanics
        word = Document()
        word.add_paragraph(wording)
        buf = BytesIO()
        word.save(buf)
        docx_parsed = parse_document(buf.getvalue(), "docx")
        docx_rules = derive_mechanics_rules(docx_parsed.get("text") or wording)

        self.assertAlmostEqual(
            float(pdf_rules.get("first_line_indent_inches")),
            float(docx_rules.get("first_line_indent_inches")),
            places=2,
        )


# Allow unittest.mock.ANY without importing mock at top for the matrix sentinel
import unittest.mock  # noqa: E402


if __name__ == "__main__":
    unittest.main()
