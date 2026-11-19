"""Regression: year-range lines must not crash scans (YEAR_RANGE_HEADING_RE)."""

from __future__ import annotations

import unittest

from app.compliance import run_compliance_scan


class YearRangeHeadingTests(unittest.TestCase):
    def test_year_range_and_numbered_heading_scan_succeeds(self):
        parsed = {
            "text": "2020 - 2022 Senior High School\n1 Introduction\nBody text here.\n",
            "metadata": {"format": "docx"},
            "paragraphs": [
                {
                    "text": "2020 - 2022 Senior High School",
                    "style": "Normal",
                    "formatting": {"font_size": 12, "font_name": "Arial"},
                    "page_index": 0,
                    "line_index": 0,
                    "runs": [{"text": "2020 - 2022 Senior High School", "font": "Arial", "size": 12}],
                },
                {
                    "text": "1 Introduction",
                    "style": "Heading 1",
                    "formatting": {"font_size": 14, "font_name": "Arial", "bold": True},
                    "page_index": 0,
                    "line_index": 1,
                    "runs": [{"text": "1 Introduction", "font": "Arial", "size": 14, "bold": True}],
                },
                {
                    "text": "Body text here.",
                    "style": "Normal",
                    "formatting": {"font_size": 12, "font_name": "Arial"},
                    "page_index": 0,
                    "line_index": 2,
                    "runs": [{"text": "Body text here.", "font": "Arial", "size": 12}],
                },
            ],
            "pages": [],
        }
        rules = {
            "font": {
                "type": "Arial",
                "families": ["Arial"],
                "body_size": 12,
                "heading1_size": 14,
            },
            "margins_inches": {"top": 1, "bottom": 1, "left": 1, "right": 1},
        }
        result = run_compliance_scan(parsed, rules, "free")
        self.assertIn("overall_score", result)
        self.assertIsInstance(result.get("issues"), list)

    def test_non_dict_mechanics_does_not_crash(self):
        parsed = {"text": "Hello", "metadata": {"format": "docx"}, "paragraphs": [], "pages": []}
        for bad in (None, [], "Arial", 12):
            with self.subTest(bad=type(bad).__name__):
                result = run_compliance_scan(parsed, bad, "free")  # type: ignore[arg-type]
                self.assertIn("issues", result)


if __name__ == "__main__":
    unittest.main()
