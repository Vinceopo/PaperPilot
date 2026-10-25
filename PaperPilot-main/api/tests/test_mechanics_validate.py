"""Tests for format-mechanics document schema validation."""

from __future__ import annotations

import unittest

from app.documents import build_sample_mechanics_docx, derive_mechanics_rules, parse_document
from app.mechanics_validate import (
    apply_ignored_fields_to_rules,
    filter_issues_for_rules,
    validate_mechanics_document,
)


def _sample_text() -> str:
    return parse_document(build_sample_mechanics_docx(), "docx")["text"]


class MechanicsValidateTests(unittest.TestCase):
    def test_sample_guide_validates_ok(self):
        text = _sample_text()
        result = validate_mechanics_document(text)
        self.assertTrue(result["ok"], result["issues"])
        self.assertEqual(result["issues"], [])

    def test_missing_category(self):
        text = (
            "Paper\n"
            "Size:\t8.5 x 11\n"
            "Orientation:\tPortrait\n"
            "Substance:\t20\n"
            "Spacing:\tDouble\n"
            "Word spacing:\tOne space between words and after periods\n"
            "Indention:\t0.5 inch\n"
            "Alignment:\tLeft\n"
            "Landscape pages:\tAllowed for tables and figures\n"
        )
        result = validate_mechanics_document(text)
        self.assertFalse(result["ok"])
        codes = {issue["code"] for issue in result["issues"]}
        self.assertIn("missing_category", codes)
        messages = " ".join(issue["message"] for issue in result["issues"])
        self.assertIn("Margins", messages)

    def test_missing_label(self):
        text = (
            "Margins (in inches)\n"
            "Top:\t1\n"
            "Left:\t1\n"
            "Bottom:\t1\n"
            "Right:\t1\n"
            "Header:\t0.5\n"
            "Footer:\t0.5\n"
        )
        result = validate_mechanics_document(text)
        gutter = [issue for issue in result["issues"] if issue.get("field") == "gutter"]
        self.assertTrue(gutter)
        self.assertEqual(gutter[0]["code"], "missing_label")
        self.assertIn('Missing label: "Gutter"', gutter[0]["message"])

    def test_missing_value_and_na_fail(self):
        text = (
            "Margins (in inches)\n"
            "Top:\t\n"
            "Left:\tN/A\n"
            "Bottom:\t1\n"
            "Right:\t1\n"
            "Gutter:\t0\n"
            "Header:\t0.5\n"
            "Footer:\t0.5\n"
        )
        result = validate_mechanics_document(text)
        by_field = {issue["field"]: issue for issue in result["issues"] if issue["category"] == "margins"}
        self.assertEqual(by_field["top"]["code"], "missing_value")
        self.assertIn("Value is missing", by_field["top"]["message"])
        self.assertEqual(by_field["left"]["code"], "missing_value")

    def test_ignore_value_passes_field(self):
        text = (
            "Margins (in inches)\n"
            "Top:\tIGNORE\n"
            "Left:\t1\n"
            "Bottom:\t1\n"
            "Right:\t1\n"
            "Gutter:\t0\n"
            "Header:\t0.5\n"
            "Footer:\t0.5\n"
        )
        result = validate_mechanics_document(text)
        margin_fields = {
            issue["field"] for issue in result["issues"] if issue["category"] == "margins"
        }
        self.assertNotIn("top", margin_fields)

    def test_ignore_whole_category(self):
        text = "Margins (in inches)\nIGNORE\n"
        result = validate_mechanics_document(text)
        margin_issues = [issue for issue in result["issues"] if issue["category"] == "margins"]
        self.assertEqual(margin_issues, [])

    def test_extra_sections_ok(self):
        text = _sample_text() + "\n\nAppendix Notes\nSome extra school policy.\n"
        result = validate_mechanics_document(text)
        self.assertTrue(result["ok"], result["issues"])

    def test_filter_ignored_fields(self):
        text = (
            "Margins (in inches)\n"
            "Top:\t\n"
            "Left:\t1\n"
            "Bottom:\t1\n"
            "Right:\t1\n"
            "Gutter:\t0\n"
            "Header:\t0.5\n"
            "Footer:\t0.5\n"
        )
        raw = validate_mechanics_document(text)
        self.assertFalse(raw["ok"])
        filtered = filter_issues_for_rules(raw, rules={}, ignored_fields=["margins:top"])
        top_left = [
            issue
            for issue in filtered["issues"]
            if issue["category"] == "margins" and issue["field"] in {"top", "left"}
        ]
        self.assertFalse(any(issue["field"] == "top" for issue in top_left))

    def test_rules_cover_issue(self):
        text = (
            "Margins (in inches)\n"
            "Top:\t\n"
            "Left:\t1\n"
            "Bottom:\t1\n"
            "Right:\t1\n"
            "Gutter:\t0\n"
            "Header:\t0.5\n"
            "Footer:\t0.5\n"
        )
        raw = validate_mechanics_document(text)
        filtered = filter_issues_for_rules(
            raw,
            rules={"margins_inches": {"top": 1.0}},
        )
        self.assertFalse(
            any(issue["field"] == "top" for issue in filtered["issues"] if issue["category"] == "margins")
        )

    def test_sample_extract_still_works(self):
        text = _sample_text()
        rules = derive_mechanics_rules(text)
        self.assertIn("margins_inches", rules)
        self.assertEqual(validate_mechanics_document(text, rules=rules)["ok"], True)

    def test_outline_pagination_heading_is_recognized(self):
        text = (
            "Capstone Project Manuscript Mechanics\n"
            "f. Pagination\n"
            "i. Top Right (no extra characters)\n"
            "ii. No page shown on first page of every chapter\n"
            "g. Page Breaks\n"
            "Do page break only when starting a new chapter.\n"
        )
        result = validate_mechanics_document(text)
        pagination_missing = [
            issue
            for issue in result["issues"]
            if issue.get("category") == "pagination" and issue.get("code") == "missing_category"
        ]
        self.assertEqual(pagination_missing, [])

    def test_filter_category_issue_with_mixed_rules_and_ignore(self):
        raw = {
            "ok": False,
            "issues": [
                {
                    "id": "pagination::missing_category",
                    "category": "pagination",
                    "field": "",
                    "code": "missing_category",
                    "message": 'Missing label: "Pagination"',
                }
            ],
        }
        filtered = filter_issues_for_rules(
            raw,
            rules={"pagination": {"position": "Top right"}},
            ignored_fields=[
                "pagination:title_page",
                "pagination:first_page_of_chapter",
                "pagination:body_numbering",
                "pagination:chapter_starts",
            ],
        )
        self.assertTrue(filtered["ok"], filtered["issues"])

    def test_heading_styles_optional_when_heading_sizes_set(self):
        raw = {
            "ok": False,
            "issues": [
                {
                    "id": "heading_styles::missing_category",
                    "category": "heading_styles",
                    "field": "",
                    "code": "missing_category",
                    "message": 'Missing label: "Heading Styles"',
                }
            ],
        }
        filtered = filter_issues_for_rules(
            raw,
            rules={"font": {"heading1_size": 14.0, "heading2_size": 12.0, "heading3_size": 11.0}},
            ignored_fields=[],
        )
        self.assertTrue(filtered["ok"], filtered["issues"])

    def test_typeface_outline_recognized_as_font(self):
        text = (
            "Standard Format for Thesis\n"
            "A. Typeface - Arial/Times New Roman font, size 12 must be used throughout.\n"
            "B. Spacing - Double spacing throughout.\n"
            "C. Margins (in inches)\n"
            "Top:\t1\n"
            "Left:\t1.5\n"
            "Bottom:\t1\n"
            "Right:\t1\n"
            "Gutter:\t0\n"
            "Header:\t0.5\n"
            "Footer:\t0.5\n"
        )
        result = validate_mechanics_document(text)
        font_missing = [
            issue
            for issue in result["issues"]
            if issue.get("category") == "font" and issue.get("code") == "missing_category"
        ]
        self.assertEqual(font_missing, [], result["issues"])

    def test_font_category_clears_without_heading_sizes(self):
        """Body/type/color alone resolve Missing label: Font; headings stay optional."""
        raw = {
            "ok": False,
            "issues": [
                {
                    "id": "font::missing_category",
                    "category": "font",
                    "field": "",
                    "code": "missing_category",
                    "message": 'Missing label: "Font"',
                }
            ],
        }
        filtered = filter_issues_for_rules(
            raw,
            rules={"font": {"body_size": 12.0, "type": "Arial", "color": "Automatic"}},
            ignored_fields=[],
        )
        self.assertTrue(filtered["ok"], filtered["issues"])

    def test_font_rules_cover_missing_category_at_validate(self):
        text = "Paper\nSize:\t8.5 x 11\n"
        result = validate_mechanics_document(
            text,
            rules={"font": {"body_size": 12.0, "type": "Arial", "color": "Black"}},
        )
        font_missing = [
            issue
            for issue in result["issues"]
            if issue.get("category") == "font" and issue.get("code") == "missing_category"
        ]
        self.assertEqual(font_missing, [])

    def test_apply_ignored_fields_strips_heading_sizes(self):
        rules = {
            "font": {
                "body_size": 12.0,
                "type": "Arial",
                "heading1_size": 11.0,
                "heading2_size": 12.0,
                "heading_styles": {"heading1": {"bold": True}},
            }
        }
        cleaned = apply_ignored_fields_to_rules(
            rules,
            ["font:heading1_size", "font:heading2_size", "heading_styles:heading1_style"],
        )
        font = cleaned.get("font") or {}
        self.assertEqual(font.get("body_size"), 12.0)
        self.assertNotIn("heading1_size", font)
        self.assertNotIn("heading2_size", font)
        self.assertNotIn("heading_styles", font)


if __name__ == "__main__":
    unittest.main()
