"""Regression: stats keys must match BREAKDOWN_ORDER ('Spacing', not 'Line Spacing')."""

from __future__ import annotations

import unittest

from app.compliance import CategoryStats, run_compliance_scan
from app.scoring import BREAKDOWN_ORDER, build_scoring_payload


class SpacingBreakdownKeyTests(unittest.TestCase):
    def test_breakdown_uses_spacing_not_line_spacing(self):
        self.assertIn("Spacing", BREAKDOWN_ORDER)
        self.assertNotIn("Line Spacing", BREAKDOWN_ORDER)
        self.assertIn("Captions", BREAKDOWN_ORDER)

    def test_run_compliance_scan_does_not_keyerror_on_spacing(self):
        parsed = {
            "text": "Hello world body paragraph for spacing.",
            "metadata": {"format": "docx"},
            "paragraphs": [
                {
                    "text": "Hello world body paragraph for spacing.",
                    "page_index": 0,
                    "formatting": {
                        "line_spacing": 2.0,
                        "first_line_indent_inches": 0.5,
                        "font_name": "Times New Roman",
                        "font_size_pt": 12,
                    },
                }
            ],
            "sections": [
                {
                    "page_width_inches": 8.5,
                    "page_height_inches": 11.0,
                    "top_margin_inches": 1.0,
                    "bottom_margin_inches": 1.0,
                    "left_margin_inches": 1.0,
                    "right_margin_inches": 1.0,
                }
            ],
        }
        rules = {
            "line_spacing": 1.5,
            "first_line_indent_inches": 0.5,
            "font_name": "Times New Roman",
            "font_size_pt": 12,
            "margins_inches": {"top": 1, "bottom": 1, "left": 1, "right": 1},
        }
        result = run_compliance_scan(parsed, rules, tier="free")
        self.assertIn("overall_score", result)
        self.assertIn("scoring", result)
        categories = [c["category"] for c in result["scoring"]["categories"]]
        self.assertIn("Spacing", categories)
        self.assertNotIn("Line Spacing", categories)

    def test_build_scoring_payload_with_spacing_stats(self):
        stats = {name: CategoryStats() for name in BREAKDOWN_ORDER}
        stats["Spacing"].observe(True)
        stats["Spacing"].observe(False)
        payload = build_scoring_payload(stats, [])
        self.assertIsNotNone(payload["overall_score"])
        spacing = next(c for c in payload["scoring"]["categories"] if c["category"] == "Spacing")
        self.assertEqual(spacing["units_checked"], 2)
        self.assertEqual(spacing["units_failed"], 1)


if __name__ == "__main__":
    unittest.main()
