"""Regression: table-cell exemptions, caption underline, body after tables/figures.

All cases use varied rule values — nothing is tied to a single sample file.
"""

from __future__ import annotations

import unittest

from app.compliance import (
    CategoryStats,
    IssueCollector,
    _check_indentation,
    _check_one_caption,
    _check_spacing,
    _layout_expectations,
    _promote_pdf_table_cells,
    FIGURE_LABEL_RE,
)


def _body(text: str, **kwargs):
    styled = kwargs.get("line_runs") or kwargs.get("runs")
    unit = {
        "text": text,
        "role": "body",
        "source": "body",
        "page_index": kwargs.get("page", 0),
        "line_index": kwargs.get("line", 0),
        "paragraph_index": kwargs.get("paragraph_index", 0),
        "formatting": kwargs.get("formatting", {}),
        # Prefer caller-provided styled runs; empty spans so _caption_pieces uses them.
        "spans": kwargs.get("spans", [] if styled else [{"text": text, "size": 12.0}]),
        "runs": kwargs.get("runs"),
        "line_runs": kwargs.get("line_runs") or styled,
        "bbox": kwargs.get("bbox"),
        "page_width": kwargs.get("page_width", 612),
        "page_height": kwargs.get("page_height", 792),
        "table_row": kwargs.get("table_row", False),
        "has_drawing": kwargs.get("has_drawing", False),
    }
    if unit["runs"] is None and unit["line_runs"] is None:
        unit["runs"] = list(unit["spans"])
    return unit


class TableCellExemptionTests(unittest.TestCase):
    def test_table_cells_skip_spacing_and_indent_for_any_rule(self):
        for spacing in (1.0, 1.5, 2.0):
            for indent in (0.5, 1.0, 2.0):
                cells = [
                    _body(
                        "TEAM COMPOSITION cell text that must never be scored as body.",
                        paragraph_index=0,
                        formatting={"line_spacing": 1.0, "first_line_indent_inches": 0.0},
                    ),
                    _body(
                        "RESEARCHER DETAILS another cell with different content entirely.",
                        paragraph_index=1,
                        line=1,
                        formatting={"line_spacing": 1.0, "first_line_indent_inches": 0.0},
                    ),
                ]
                for unit in cells:
                    unit["source"] = "table"
                    unit["table_row"] = True
                spacing_c = IssueCollector()
                indent_c = IssueCollector()
                _check_spacing(cells, {"line_spacing": spacing}, CategoryStats(), spacing_c)
                _check_indentation(cells, {"first_line_indent_inches": indent}, CategoryStats(), indent_c)
                self.assertNotIn("line_spacing", spacing_c.items, msg=f"spacing={spacing}")
                self.assertNotIn("first_line_indent", indent_c.items, msg=f"indent={indent}")

    def test_body_after_table_still_flagged_for_spacing_and_indent(self):
        units = [
            _body(
                "Name inside a table cell",
                paragraph_index=0,
                formatting={"line_spacing": 1.0, "first_line_indent_inches": 0.0},
            ),
            _body(
                "This body paragraph after the table deliberately uses wrong spacing and zero indent.",
                paragraph_index=1,
                line=1,
                formatting={"line_spacing": 1.0, "first_line_indent_inches": 0.0},
            ),
        ]
        units[0]["source"] = "table"
        units[0]["table_row"] = True
        for spacing in (1.5, 2.0):
            collector = IssueCollector()
            _check_spacing(units, {"line_spacing": spacing}, CategoryStats(), collector)
            self.assertIn("line_spacing", collector.items, msg=f"spacing={spacing}")
            self.assertEqual(len(collector.items["line_spacing"]["locations"]), 1)
        for indent in (0.5, 1.0, 2.0):
            collector = IssueCollector()
            _check_indentation(units, {"first_line_indent_inches": indent}, CategoryStats(), collector)
            self.assertIn("first_line_indent", collector.items, msg=f"indent={indent}")
            self.assertEqual(len(collector.items["first_line_indent"]["locations"]), 1)


class CaptionStyleUnderlineTests(unittest.TestCase):
    def test_layout_expectations_read_underline_variants(self):
        only_underline = _layout_expectations("Figure title underlined below the image")
        self.assertTrue(only_underline["title_underline"] or only_underline["underline"])
        self.assertFalse(only_underline["bold"])

        bold_only = _layout_expectations("Figure captions in bold above the figure")
        self.assertTrue(bold_only["bold"])
        self.assertFalse(bold_only["underline"])
        self.assertFalse(bold_only["title_underline"])

        both = _layout_expectations(
            "Figure number in bold with the title underlined below the image"
        )
        self.assertTrue(both["number_bold"])
        self.assertTrue(both["title_underline"])

    def test_title_bold_and_underline_scope_not_stolen_by_number_token(self):
        """Schema-like wording still scopes bold+underline to the title, for figures and tables."""
        for wording in (
            "Figure <number[1..n] : Figure Title <bold, underlined>",
            "Figure number[1..n] : Figure Title bold, underlined",
            "Figure captions: title in bold and underlined below the figure",
            "Table <number[1..n] : Table Title <bold, underlined>",
            "Table Title <bold, underlined>",
        ):
            expect = _layout_expectations(wording)
            self.assertTrue(expect["title_bold"], wording)
            self.assertTrue(expect["title_underline"], wording)
            self.assertFalse(expect["number_bold"], wording)
            self.assertFalse(expect["bold"], wording)
            self.assertFalse(expect["underline"], wording)

    def test_figure_title_bold_underline_only_checks_title_runs(self):
        """Same title-only measurement used for tables: label may stay plain."""
        text = "Figure 2 System overview diagram"
        match = FIGURE_LABEL_RE.match(text)
        expect = _layout_expectations(
            "Figure <number[1..n] : Figure Title <bold, underlined>"
        )
        self.assertTrue(expect["title_bold"] and expect["title_underline"])
        ok_unit = _body(
            text,
            runs=[
                {"text": "Figure 2 ", "bold": False, "underline": False},
                {"text": "System overview diagram", "bold": True, "underline": True},
            ],
        )
        ok_collector = IssueCollector()
        _check_one_caption(ok_unit, "figure", match, expect, ok_collector)
        self.assertNotIn("figure_caption_style", ok_collector.items)

        bad_unit = _body(
            text,
            runs=[
                {"text": "Figure 2 ", "bold": True, "underline": True},
                {"text": "System overview diagram", "bold": False, "underline": False},
            ],
        )
        bad_collector = IssueCollector()
        _check_one_caption(bad_unit, "figure", match, expect, bad_collector)
        self.assertIn("figure_caption_style", bad_collector.items)
        detail = " ".join(
            loc.get("explanation") or ""
            for loc in bad_collector.items["figure_caption_style"]["locations"]
        ).lower()
        self.assertIn("title", detail)

    def test_missing_underline_flagged_independently_of_bold(self):
        text = "Figure 1 Sample study workflow overview"
        match = FIGURE_LABEL_RE.match(text)
        unit = _body(
            text,
            runs=[
                {"text": "Figure 1 ", "bold": True, "underline": False},
                {"text": "Sample study workflow overview", "bold": True, "underline": False},
            ],
        )
        expect = _layout_expectations(
            "Figure number in bold with the title underlined below the image"
        )
        collector = IssueCollector()
        _check_one_caption(unit, "figure", match, expect, collector)
        self.assertIn("figure_caption_style", collector.items)
        detail = " ".join(
            loc.get("explanation") or "" for loc in collector.items["figure_caption_style"]["locations"]
        ).lower()
        self.assertIn("underline", detail)
        self.assertIn("title", detail)

    def test_title_underline_only_checks_title_not_whole_caption(self):
        """Label may stay plain; only the title must match a title-underline rule."""
        text = "Figure 4 Adaptive title underline check"
        match = FIGURE_LABEL_RE.match(text)
        # Only the title run is underlined — must pass a title-underline rule.
        ok_unit = _body(
            text,
            runs=[
                {"text": "Figure 4 ", "bold": True, "underline": False},
                {"text": "Adaptive title underline check", "bold": False, "underline": True},
            ],
        )
        expect = _layout_expectations(
            "Figure number in bold with the title underlined below the image"
        )
        self.assertTrue(expect["title_underline"])
        self.assertFalse(expect["underline"])
        ok_collector = IssueCollector()
        _check_one_caption(ok_unit, "figure", match, expect, ok_collector)
        detail = " ".join(
            loc.get("explanation") or ""
            for issue in ok_collector.items.values()
            for loc in issue.get("locations") or []
        ).lower()
        self.assertNotIn("underlin", detail)

        # Title plain while label underlined — must still flag missing title underline.
        bad_unit = _body(
            text,
            runs=[
                {"text": "Figure 4 ", "bold": True, "underline": True},
                {"text": "Adaptive title underline check", "bold": False, "underline": False},
            ],
        )
        bad_collector = IssueCollector()
        _check_one_caption(bad_unit, "figure", match, expect, bad_collector)
        self.assertIn("figure_caption_style", bad_collector.items)
        bad_detail = " ".join(
            loc.get("explanation") or ""
            for loc in bad_collector.items["figure_caption_style"]["locations"]
        ).lower()
        self.assertIn("title", bad_detail)
        self.assertIn("underlin", bad_detail)

    def test_bold_only_rule_does_not_require_underline(self):
        text = "Figure 2 Another caption missing weight only"
        match = FIGURE_LABEL_RE.match(text)
        unit = _body(
            text,
            runs=[
                {"text": text, "bold": False, "underline": False},
            ],
        )
        expect = _layout_expectations("Figure captions in bold above the figure")
        self.assertFalse(expect.get("underline"))
        self.assertFalse(expect.get("title_underline"))
        collector = IssueCollector()
        _check_one_caption(unit, "figure", match, expect, collector)
        self.assertIn("figure_caption_style", collector.items)
        detail = " ".join(
            loc.get("explanation") or "" for loc in collector.items["figure_caption_style"]["locations"]
        ).lower()
        self.assertIn("bold", detail)
        self.assertNotIn("underlin", detail)

    def test_bold_and_underline_both_required(self):
        text = "Figure 3 Needs both styles"
        match = FIGURE_LABEL_RE.match(text)
        unit = _body(
            text,
            runs=[{"text": text, "bold": False, "underline": False}],
        )
        expect = _layout_expectations("Figure title bold and underlined below the image")
        collector = IssueCollector()
        _check_one_caption(unit, "figure", match, expect, collector)
        locs = collector.items.get("figure_caption_style", {}).get("locations") or []
        # Dedup is by page/line/section/excerpt — both style misses share location key,
        # so at least one style flag must fire; expectations must enable both attrs.
        self.assertTrue(expect.get("bold") or expect.get("title_bold") or expect.get("number_bold"))
        self.assertTrue(expect.get("underline") or expect.get("title_underline"))
        self.assertGreaterEqual(len(locs), 1)


class BodyAfterObjectsTests(unittest.TestCase):
    def test_single_line_docx_spacing_is_checked(self):
        for spacing in (1.0, 1.5, 2.0):
            wrong = 2.0 if spacing != 2.0 else 1.0
            units = [
                _body(
                    "Body paragraph immediately after a figure must still be spacing-checked.",
                    paragraph_index=0,
                    formatting={"line_spacing": wrong},
                )
            ]
            collector = IssueCollector()
            _check_spacing(units, {"line_spacing": spacing}, CategoryStats(), collector)
            self.assertIn("line_spacing", collector.items, msg=f"rule={spacing}")

    def test_pdf_table_grow_does_not_swallow_body_below(self):
        units = [
            {
                "text": "Col A   Col B",
                "role": "body",
                "source": "body",
                "table_row": True,
                "page_index": 0,
                "line_index": 0,
                "bbox": [72, 100, 400, 114],
                "page_width": 612,
                "page_height": 792,
                "spans": [{"text": "x", "size": 11}],
            },
            {
                "text": "Wrapped cell line under header",
                "role": "body",
                "source": "body",
                "table_row": False,
                "page_index": 0,
                "line_index": 1,
                "bbox": [72, 118, 220, 132],
                "page_width": 612,
                "page_height": 792,
                "spans": [{"text": "x", "size": 11}],
            },
            {
                # Full-ish width body well below the table — must stay body.
                "text": "This concluding body paragraph sits clearly under the table and must stay eligible.",
                "role": "body",
                "source": "body",
                "table_row": False,
                "page_index": 0,
                "line_index": 2,
                "bbox": [72, 280, 500, 294],
                "page_width": 612,
                "page_height": 792,
                "spans": [{"text": "x", "size": 11}],
                "formatting": {"line_spacing": 1.0, "first_line_indent_inches": 0.0},
            },
        ]
        _promote_pdf_table_cells(units)
        self.assertEqual(units[2].get("source"), "body")
        self.assertFalse(units[2].get("table_row"))
        spacing_c = IssueCollector()
        _check_spacing(units, {"line_spacing": 1.5}, CategoryStats(), spacing_c)
        self.assertIn("line_spacing", spacing_c.items)
        # Indent after a table (DOCX-style formatting, no PDF geometry path).
        after = [
            _body("cell", paragraph_index=0, formatting={"first_line_indent_inches": 0.0}),
            _body(
                "Body paragraph after the table must still be indentation-checked for any rule value.",
                paragraph_index=1,
                line=1,
                formatting={"first_line_indent_inches": 0.0, "left_indent_inches": 0.0},
            ),
        ]
        after[0]["source"] = "table"
        after[0]["table_row"] = True
        for indent in (0.5, 1.0, 2.0):
            indent_c = IssueCollector()
            _check_indentation(after, {"first_line_indent_inches": indent}, CategoryStats(), indent_c)
            self.assertIn("first_line_indent", indent_c.items, msg=f"indent={indent}")

    def test_no_duplicate_spacing_issue_for_same_paragraph(self):
        units = [
            _body(
                "Same paragraph must not produce duplicate spacing locations.",
                paragraph_index=0,
                formatting={"line_spacing": 1.0},
            )
        ]
        collector = IssueCollector()
        _check_spacing(units, {"line_spacing": 1.5}, CategoryStats(), collector)
        self.assertEqual(len(collector.items["line_spacing"]["locations"]), 1)


if __name__ == "__main__":
    unittest.main()
