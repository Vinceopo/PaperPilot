"""Caption line-structure A/B/C checks (any manuscript wording)."""

from __future__ import annotations

import unittest

from app.compliance import (
    CAPTION_LINE_LABEL_TITLE,
    CAPTION_LINE_ONE,
    CAPTION_LINE_TITLE_LABEL,
    CategoryStats,
    IssueCollector,
    _check_captions,
    _parse_caption_line_structure,
)


def _unit(text: str, **kw) -> dict:
    return {
        "text": text,
        "page_index": kw.get("page_index", 0),
        "line_index": kw.get("line_index", 0),
        "source": kw.get("source", "body"),
        "role": kw.get("role", "caption"),
        "spans": kw.get("spans")
        or [{"text": text, "font": "TimesNewRoman", "size": 12, "bold": False, "italic": False}],
        "bbox": [72, 72 + 20 * kw.get("line_index", 0), 500, 90 + 20 * kw.get("line_index", 0)],
    }


class CaptionLineStructureParseTests(unittest.TestCase):
    def test_parse_one_line(self):
        self.assertEqual(
            _parse_caption_line_structure("Table number and title on one line, above the table"),
            CAPTION_LINE_ONE,
        )

    def test_parse_label_then_title(self):
        self.assertEqual(
            _parse_caption_line_structure(
                "Table number in bold, with the title in italic title case on the next line"
            ),
            CAPTION_LINE_LABEL_TITLE,
        )

    def test_parse_title_first(self):
        self.assertEqual(
            _parse_caption_line_structure("Title on the first line, Table number on the next line"),
            CAPTION_LINE_TITLE_LABEL,
        )

    def test_unset_when_structure_not_mentioned(self):
        self.assertIsNone(
            _parse_caption_line_structure("Each table must be labeled Table number above the table.")
        )

    def test_template_one_line_glued_title(self):
        self.assertEqual(
            _parse_caption_line_structure("Table <name[1..n]>TABLE TITLE"),
            CAPTION_LINE_ONE,
        )

    def test_template_two_line_newline(self):
        self.assertEqual(
            _parse_caption_line_structure("Table <name[1..n]>\nTABLE TITLE"),
            CAPTION_LINE_LABEL_TITLE,
        )

    def test_template_two_line_list(self):
        self.assertEqual(
            _parse_caption_line_structure(["Table <name[1..n]>", "TABLE TITLE"]),
            CAPTION_LINE_LABEL_TITLE,
        )

    def test_template_title_then_label_list(self):
        self.assertEqual(
            _parse_caption_line_structure(["TABLE TITLE", "Figure <n>"]),
            CAPTION_LINE_TITLE_LABEL,
        )

    def test_schema_unclosed_number_tag_still_one_line_for_figures_and_tables(self):
        """Format-field schemas often omit '>' before ': Title <bold…>' — still one_line."""
        for wording in (
            "Figure <number[1..n] : Figure Title <bold, underlined>",
            "Figure <number[1..n]> : Figure Title <bold, underlined>",
            "Table <number[1..n] : Table Title <bold>",
            "Table <name[1..n]>TABLE TITLE",
        ):
            self.assertEqual(
                _parse_caption_line_structure(wording),
                CAPTION_LINE_ONE,
                wording,
            )

    def test_schema_two_line_figure_template(self):
        self.assertEqual(
            _parse_caption_line_structure(
                "Figure <number[1..n]>\nFigure Title <bold, underlined>"
            ),
            CAPTION_LINE_LABEL_TITLE,
        )


class CaptionLineStructureCheckTests(unittest.TestCase):
    def test_one_line_rule_flags_two_line_caption(self):
        rules = {
            "table_layout_requirements": [
                "Table number and title on one line, both placed above the table."
            ]
        }
        units = [
            _unit("Table 1", line_index=0),
            _unit("Measured Results", line_index=1),
        ]
        collector = IssueCollector()
        stats = CategoryStats()
        _check_captions(units, rules, collector, stats)
        types = {issue["issue_type"] for issue in collector.result()}
        self.assertIn("table_caption_line_structure", types)
        self.assertGreaterEqual(stats.failed, 1)
        self.assertGreaterEqual(stats.checked, 1)
        loc = collector.result()[0]["locations"][0]
        self.assertIn("measured_value", loc)
        self.assertIn("expected_value", loc)

    def test_two_line_rule_flags_one_line_caption(self):
        rules = {
            "table_layout_requirements": [
                "Table number on one line, title on the next line, placed above the table."
            ]
        }
        units = [_unit("Table 1 Measured Results", line_index=0)]
        collector = IssueCollector()
        stats = CategoryStats()
        _check_captions(units, rules, collector, stats)
        types = {issue["issue_type"] for issue in collector.result()}
        self.assertIn("table_caption_line_structure", types)

    def test_title_first_match_passes(self):
        rules = {
            "figure_layout_requirements": [
                "Title on the first line, Figure number on the next line, below the figure."
            ]
        }
        units = [
            _unit("System Overview", line_index=0),
            _unit("Figure 2", line_index=1),
        ]
        collector = IssueCollector()
        stats = CategoryStats()
        _check_captions(units, rules, collector, stats)
        types = {issue["issue_type"] for issue in collector.result()}
        self.assertNotIn("figure_caption_line_structure", types)
        self.assertGreaterEqual(stats.checked, 1)
        self.assertEqual(stats.failed, 0)

    def test_template_one_line_flags_two_line_caption(self):
        rules = {"table_layout_requirements": ["Table <name[1..n]>TABLE TITLE"]}
        units = [
            _unit("Table 1", line_index=0),
            _unit("Measured Results", line_index=1),
        ]
        collector = IssueCollector()
        stats = CategoryStats()
        _check_captions(units, rules, collector, stats)
        types = {issue["issue_type"] for issue in collector.result()}
        self.assertIn("table_caption_line_structure", types)

    def test_figure_schema_one_line_flags_two_line_caption(self):
        """Same structure technique as tables — driven by the user's figure rule text."""
        rules = {
            "figure_layout_requirements": [
                "Figure <number[1..n] : Figure Title <bold, underlined>"
            ]
        }
        units = [
            _unit("Figure 1", line_index=0),
            _unit("System Overview", line_index=1),
        ]
        collector = IssueCollector()
        stats = CategoryStats()
        _check_captions(units, rules, collector, stats)
        types = {issue["issue_type"] for issue in collector.result()}
        self.assertIn("figure_caption_line_structure", types)
        self.assertGreaterEqual(stats.failed, 1)

    def test_figure_schema_one_line_passes_one_line_caption(self):
        rules = {
            "figure_layout_requirements": [
                "Figure <number[1..n] : Figure Title <bold, underlined>"
            ]
        }
        units = [
            _unit(
                "Figure 1 System Overview",
                line_index=0,
                spans=[
                    {"text": "Figure 1 ", "bold": False, "underline": False},
                    {"text": "System Overview", "bold": True, "underline": True},
                ],
            )
        ]
        collector = IssueCollector()
        stats = CategoryStats()
        _check_captions(units, rules, collector, stats)
        types = {issue["issue_type"] for issue in collector.result()}
        self.assertNotIn("figure_caption_line_structure", types)
        self.assertNotIn("figure_caption_style", types)
        self.assertEqual(stats.failed, 0)
        self.assertGreaterEqual(stats.checked, 1)

    def test_figure_title_style_flags_when_mechanics_require_bold_and_underline(self):
        """Only when the user's figure rule asks for title bold/underline — not hardcoded."""
        rules = {
            "figure_layout_requirements": [
                "Figure <number[1..n] : Figure Title <bold, underlined>"
            ]
        }
        units = [
            _unit(
                "Figure 2 Plain title text here",
                line_index=0,
                spans=[
                    {"text": "Figure 2 ", "bold": False, "underline": False},
                    {"text": "Plain title text here", "bold": False, "underline": False},
                ],
            )
        ]
        collector = IssueCollector()
        stats = CategoryStats()
        _check_captions(units, rules, collector, stats)
        self.assertIn("figure_caption_style", {i["issue_type"] for i in collector.result()})
        expecteds = {
            str(loc.get("expected_value") or loc.get("expected") or "").lower()
            for issue in collector.result()
            for loc in issue.get("locations") or []
        }
        self.assertIn("bold", expecteds)
        self.assertIn("underline", expecteds)
        self.assertGreaterEqual(stats.failed, 1)

    def test_figure_without_title_style_requirement_does_not_invent_bold_flags(self):
        rules = {
            "figure_layout_requirements": [
                "Figure number and title on one line, below the figure."
            ]
        }
        units = [
            _unit(
                "Figure 3 Plain title without styles",
                line_index=0,
                spans=[
                    {"text": "Figure 3 ", "bold": False, "underline": False},
                    {"text": "Plain title without styles", "bold": False, "underline": False},
                ],
            )
        ]
        collector = IssueCollector()
        stats = CategoryStats()
        _check_captions(units, rules, collector, stats)
        types = {issue["issue_type"] for issue in collector.result()}
        self.assertNotIn("figure_caption_style", types)
        self.assertEqual(stats.failed, 0)

    def test_template_two_line_passes_two_line_caption(self):
        rules = {"table_layout_requirements": ["Table <name[1..n]>\nTABLE TITLE"]}
        units = [
            _unit("Table 1", line_index=0),
            _unit("Measured Results", line_index=1),
        ]
        collector = IssueCollector()
        stats = CategoryStats()
        _check_captions(units, rules, collector, stats)
        types = {issue["issue_type"] for issue in collector.result()}
        self.assertNotIn("table_caption_line_structure", types)
        self.assertEqual(stats.failed, 0)

    def test_label_then_title_not_fooled_by_prior_short_line(self):
        """A short heading above Table N must not flip label-then-title into title-then-label."""
        rules = {"table_layout_requirements": ["Table <name[1..n]>\nTABLE TITLE"]}
        units = [
            _unit("Comparative Matrix.", line_index=0),
            _unit("Table 1", line_index=1),
            _unit("COMPARATIVE MATRIX", line_index=2),
        ]
        collector = IssueCollector()
        stats = CategoryStats()
        _check_captions(units, rules, collector, stats)
        types = {issue["issue_type"] for issue in collector.result()}
        self.assertNotIn("table_caption_line_structure", types)
        self.assertEqual(stats.failed, 0)

    def test_label_then_title_skips_blank_spacing_units(self):
        """Word space-after blanks between Table N and title must not hide the title."""
        rules = {"table_layout_requirements": ["Table <name[1..n]>\nTABLE TITLE"]}
        units = [
            _unit("Comparative Matrix.", line_index=0),
            _unit("Table 1", line_index=1),
            _unit("", line_index=2),
            _unit("", line_index=3),
            _unit("COMPARATIVE MATRIX", line_index=4),
        ]
        collector = IssueCollector()
        stats = CategoryStats()
        _check_captions(units, rules, collector, stats)
        types = {issue["issue_type"] for issue in collector.result()}
        self.assertNotIn("table_caption_line_structure", types)
        self.assertEqual(stats.failed, 0)

    def test_label_then_title_uses_bbox_when_reading_order_flips(self):
        """PDF stream order title→label with title drawn below still counts as label-then-title."""
        rules = {"table_layout_requirements": ["Table <name[1..n]>\nTABLE TITLE"]}
        units = [
            {
                **_unit("COMPARATIVE MATRIX", line_index=0),
                "bbox": [72, 140, 400, 158],
            },
            {
                **_unit("Table 1", line_index=1),
                "bbox": [72, 100, 200, 118],
            },
        ]
        collector = IssueCollector()
        stats = CategoryStats()
        _check_captions(units, rules, collector, stats)
        types = {issue["issue_type"] for issue in collector.result()}
        self.assertNotIn("table_caption_line_structure", types)
        self.assertEqual(stats.failed, 0)

    def test_label_then_title_rule_still_flags_true_title_first(self):
        rules = {"table_layout_requirements": ["Table <name[1..n]>\nTABLE TITLE"]}
        units = [
            _unit("COMPARATIVE MATRIX", line_index=0),
            _unit("Table 1", line_index=1),
        ]
        collector = IssueCollector()
        stats = CategoryStats()
        _check_captions(units, rules, collector, stats)
        types = {issue["issue_type"] for issue in collector.result()}
        self.assertIn("table_caption_line_structure", types)
        self.assertGreaterEqual(stats.failed, 1)

    def test_user_template_table_name_placeholder(self):
        """Format Fields template ``Table <name[1..n]>\\nTABLE TITLE`` is label-then-title."""
        rules = {"table_layout_requirements": ["Table <name[1..n]>\nTABLE TITLE"]}
        self.assertEqual(
            _parse_caption_line_structure(rules["table_layout_requirements"][0]),
            CAPTION_LINE_LABEL_TITLE,
        )

    def test_caption_excerpt_includes_title_for_locate(self):
        rules = {"figure_layout_requirements": ["Figure <n>TITLE"]}
        units = [
            _unit("Figure 3", line_index=0),
            _unit("System Overview Diagram", line_index=1),
        ]
        collector = IssueCollector()
        _check_captions(units, rules, collector, CategoryStats())
        issues = collector.result()
        self.assertTrue(issues)
        excerpt = issues[0]["locations"][0].get("excerpt") or ""
        self.assertIn("Figure 3", excerpt)
        self.assertIn("System Overview Diagram", excerpt)


class EmbodiedTemplateFillTests(unittest.TestCase):
    def test_embodied_styles_fill_unset_fields(self):
        from app.documents import apply_template_extract_guards

        paragraphs = []
        for i in range(6):
            paragraphs.append(
                {
                    "style": "Normal",
                    "source": "body",
                    "text": f"Body paragraph number {i} with enough words.",
                    "formatting": {
                        "line_spacing": 2.0,
                        "alignment": "justify",
                        "first_line_indent_inches": 0.5,
                    },
                    "runs": [{"text": f"Body {i}", "font": "Times New Roman", "size": 12, "bold": False}],
                }
            )
        paragraphs.append(
            {
                "style": "Heading 1",
                "source": "body",
                "text": "Introduction",
                "formatting": {"alignment": "left"},
                "runs": [{"text": "Introduction", "font": "Times New Roman", "size": 14, "bold": True}],
            }
        )
        paragraphs.append(
            {
                "style": "Caption",
                "source": "body",
                "text": "Table 1 Sample Counts",
                "formatting": {"line_spacing": 1.0},
                "runs": [{"text": "Table 1 Sample Counts", "font": "Times New Roman", "size": 10}],
            }
        )
        sections = [
            {
                "page_width_inches": 8.5,
                "page_height_inches": 11.0,
                "top_margin_inches": 1.0,
                "bottom_margin_inches": 1.0,
                "left_margin_inches": 1.25,
                "right_margin_inches": 1.25,
            }
        ]
        guarded = apply_template_extract_guards({}, "", paragraphs, sections)
        self.assertEqual(guarded.get("line_spacing"), 2.0)
        self.assertEqual(guarded.get("alignment"), "justify")
        self.assertEqual(guarded.get("first_line_indent_inches"), 0.5)
        self.assertEqual((guarded.get("font") or {}).get("body_size"), 12.0)
        self.assertEqual((guarded.get("font") or {}).get("heading1_size"), 14.0)
        self.assertIn("margins_inches", guarded)
        self.assertTrue((guarded.get("table_layout_requirements") or [""])[0])
        self.assertIn("field_sources", guarded)
        # Unknown citation stays unset
        self.assertNotIn("citation_style", guarded)

    def test_existing_rules_not_overwritten(self):
        from app.documents import apply_template_extract_guards

        paragraphs = [
            {
                "style": "Normal",
                "source": "body",
                "text": f"Body {i}",
                "formatting": {"line_spacing": 2.0, "alignment": "justify"},
                "runs": [{"text": "x", "font": "Arial", "size": 11}],
            }
            for i in range(5)
        ]
        existing = {"line_spacing": 1.5, "spacing": "1.5", "alignment": "left"}
        guarded = apply_template_extract_guards(existing, "Alignment: left.", paragraphs, [])
        # Embodied justify may still beat narrative left via existing guard.
        self.assertEqual(guarded.get("line_spacing"), 1.5)

    def test_publisher_head_styles_and_section_pagination(self):
        """ACM-like Head1/Para templates fill heading sizes + footer page numbers."""
        from app.documents import apply_template_extract_guards

        paragraphs = [
            {
                "style": "Para",
                "source": "body",
                "text": f"Body paragraph {i} for the submission template.",
                "formatting": {
                    "line_spacing": 1.3,
                    "alignment": "justify",
                    "first_line_indent_inches": 0.17,
                },
                "runs": [{"text": f"Body {i}", "font": "Linux Libertine O", "size": 9, "bold": False}],
            }
            for i in range(6)
        ]
        for label, style, size, bold, align in (
            ("Introduction", "Head1", 9.0, True, "left"),
            ("Tables", "Head2", 9.0, True, "left"),
            ("Half Width", "Head3", 9.0, False, "justify"),
        ):
            paragraphs.append(
                {
                    "style": style,
                    "source": "body",
                    "text": label,
                    "formatting": {"alignment": align},
                    "runs": [{"text": label, "font": "Linux Biolinum O", "size": size, "bold": bold}],
                }
            )
        paragraphs.append(
            {
                "style": "FigureCaption",
                "source": "body",
                "text": "Figure 1: Example roadster photograph",
                "formatting": {"alignment": "center"},
                "runs": [{"text": "Figure 1: Example roadster photograph", "size": 8}],
            }
        )
        sections = [
            {
                "page_width_inches": 8.5,
                "page_height_inches": 11.0,
                "top_margin_inches": 1.2,
                "bottom_margin_inches": 2.0,
                "left_margin_inches": 1.0,
                "right_margin_inches": 1.4,
                "page_number": {
                    "where": "footer",
                    "align": "center",
                    "shown": True,
                    "first_page_hidden": True,
                },
            }
        ]
        existing = {
            "figure_layout_requirements": [
                'figure caption, apply the style “FigureCaption'
            ]
        }
        guarded = apply_template_extract_guards(existing, "submission template", paragraphs, sections)
        font = guarded.get("font") or {}
        self.assertEqual(font.get("type"), "Linux Libertine O")
        self.assertEqual(font.get("body_size"), 9.0)
        self.assertEqual(font.get("heading1_size"), 9.0)
        self.assertEqual(font.get("heading2_size"), 9.0)
        self.assertEqual(font.get("heading3_size"), 9.0)
        self.assertTrue((font.get("heading_styles") or {}).get("heading1", {}).get("bold"))
        pagination = guarded.get("pagination") or {}
        self.assertEqual(pagination.get("position"), "Bottom center")
        self.assertTrue(str(pagination.get("title_page") or ""))
        self.assertEqual(
            (guarded.get("figure_layout_requirements") or [""])[0],
            "Figure number and title on one line",
        )

    def test_labeled_guide_ignores_builtin_heading_outline_styles(self):
        """School mechanics DOCX Heading 1/2 outline must not become heading sizes."""
        from app.documents import apply_template_extract_guards

        guide = (
            "Font type: Cambria\nFont size: 11\nTop margin: 1 inch\n"
            "Line spacing: Double\nOrientation: Portrait\nFirst-line indentation: 0.5 inch\n"
        )
        paragraphs = [
            {
                "style": "Heading 1",
                "source": "body",
                "text": "Capstone Project Formatting Guide",
                "formatting": {"alignment": "left"},
                "runs": [{"text": "Capstone", "size": 16, "bold": True}],
            },
            {
                "style": "Heading 2",
                "source": "body",
                "text": "1. Page Setup",
                "formatting": {"alignment": "left"},
                "runs": [{"text": "1. Page Setup", "size": 13, "bold": True}],
            },
            {
                "style": "Normal",
                "source": "body",
                "text": "Font type: Cambria",
                "formatting": {"line_spacing": 1.0, "alignment": "left"},
                "runs": [{"text": "Font type: Cambria", "font": "Calibri", "size": 11}],
            },
        ]
        guarded = apply_template_extract_guards(
            {"font": {"type": "Cambria", "body_size": 11.0}},
            guide,
            paragraphs,
            [],
        )
        font = guarded.get("font") or {}
        self.assertNotIn("heading1_size", font)
        self.assertNotIn("heading2_size", font)
        self.assertEqual(font.get("type"), "Cambria")
        self.assertEqual(font.get("body_size"), 11.0)


if __name__ == "__main__":
    unittest.main()
