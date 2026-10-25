"""Dedup and location accuracy for compliance issues."""

import unittest

from app.compliance import IssueCollector, _location, run_compliance_scan


def _para(i, text, style="Normal", size=12, bold=False):
    return {
        "paragraph_index": i,
        "source": "body",
        "style": style,
        "text": text,
        "lines": [{"line_index": i, "text": text}],
        "runs": [{"text": text, "font": "Arial", "size": size, "bold": bold}],
        "formatting": {"line_spacing": 1.5, "alignment": "left"},
    }


class IssueDedupLocationTests(unittest.TestCase):
    def test_location_omits_page_when_unknown(self):
        loc = _location(None, None, "Citations")
        self.assertEqual(loc, {"section": "Citations"})
        self.assertNotIn("page", loc)
        self.assertNotIn("line", loc)

    def test_collector_keeps_one_location_for_same_page_line_excerpt(self):
        collector = IssueCollector()
        pin = {"page": 2, "line": 3, "section": "Fonts", "excerpt": "CHAPTER 1"}
        collector.add("font_size_heading1", "critical", "t", "s", "e", "r", pin)
        collector.add("font_size_heading1", "critical", "t", "s", "e", "r", dict(pin))
        collector.add(
            "font_size_heading1",
            "critical",
            "t",
            "s",
            "e",
            "r",
            {"page": 2, "line": 4, "section": "Fonts", "excerpt": "Methods"},
        )
        issues = collector.result()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["count"], 2)
        self.assertEqual(len(issues[0]["locations"]), 2)

    def test_multiple_heading_failures_are_not_duplicated_per_line(self):
        paragraphs = [
            _para(0, "CHAPTER 1", style="Heading 1", size=12, bold=True),
            _para(1, "CHAPTER 2", style="Heading 1", size=12, bold=True),
            _para(2, "Body text long enough to count as ordinary prose for scanning.", size=12),
        ]
        parsed = {
            "text": " ".join(p["text"] for p in paragraphs),
            "metadata": {"format": "docx"},
            "paragraphs": paragraphs,
            "sections": [
                {
                    "section_index": 0,
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
            "font": {
                "families": ["Times New Roman"],
                "heading1_size": 14,
                "heading_levels": 1,
                "body_size": 12,
            }
        }
        result = run_compliance_scan(parsed, rules, "free")
        h1 = next(issue for issue in result["issues"] if issue["issue_type"] == "font_size_heading1")
        pages_lines = [(loc.get("page"), loc.get("line")) for loc in h1["locations"]]
        self.assertEqual(len(pages_lines), len(set(pages_lines)))
        self.assertGreaterEqual(len(pages_lines), 2)


if __name__ == "__main__":
    unittest.main()
