"""Line spacing must check every in-scope paragraph, with full evidence on flags."""

from __future__ import annotations

import unittest

from app.compliance import CategoryStats, IssueCollector, _check_spacing


def _para(text: str, *, spacing: float, page=0, line=0, paragraph_index=0, role="body"):
    return {
        "text": text,
        "role": role,
        "paragraph_type": role,
        "source": "body",
        "page_index": page,
        "line_index": line,
        "paragraph_index": paragraph_index,
        "dominant_size": 12.0,
        "formatting": {"line_spacing": spacing},
        "spans": [{"text": text, "size": 12.0, "font": "Times New Roman"}],
    }


class LineSpacingExhaustiveTests(unittest.TestCase):
    def test_one_wrong_paragraph_produces_exactly_one_flag(self):
        units = [
            _para("First compliant body paragraph on page one with enough words here.", spacing=1.5, paragraph_index=0),
            _para(
                "Second body paragraph deliberately uses double spacing instead of one point five.",
                spacing=2.0,
                line=1,
                paragraph_index=1,
            ),
            _para(
                "Third compliant body paragraph continues on the same page with correct spacing.",
                spacing=1.5,
                line=2,
                paragraph_index=2,
            ),
            _para(
                "Fourth compliant body paragraph on page two still matches the required spacing.",
                spacing=1.5,
                page=1,
                line=0,
                paragraph_index=3,
            ),
        ]
        collector = IssueCollector()
        _check_spacing(units, {"line_spacing": 1.5}, CategoryStats(), collector)
        self.assertIn("line_spacing", collector.items)
        issue = collector.items["line_spacing"]
        self.assertEqual(len(issue["locations"]), 1)
        loc = issue["locations"][0]
        self.assertEqual(loc.get("paragraph_index"), 1)
        self.assertEqual(loc.get("rule_id"), "line_spacing")
        self.assertTrue(loc.get("rule_source"))
        self.assertEqual(loc.get("measured_value"), "2")
        self.assertEqual(loc.get("expected_value"), "1.5")
        self.assertTrue(loc.get("excerpt"))
        self.assertTrue(loc.get("paragraph_type"))

    def test_fully_compliant_document_produces_zero_flags(self):
        units = [
            _para("Compliant paragraph one with the required spacing for this test case.", spacing=1.5, paragraph_index=0),
            _para("Compliant paragraph two also uses the same required spacing value.", spacing=1.5, line=1, paragraph_index=1),
            _para(
                "Compliant paragraph three on another page remains within the spacing rule.",
                spacing=1.5,
                page=1,
                line=0,
                paragraph_index=2,
            ),
        ]
        collector = IssueCollector()
        _check_spacing(units, {"line_spacing": 1.5}, CategoryStats(), collector)
        self.assertNotIn("line_spacing", collector.items)

    def test_every_paragraph_on_every_page_is_checked(self):
        """A wrong spacing on the last page is still flagged (not sampled away)."""
        units = [
            _para("Page one paragraph remains compliant with the required line spacing.", spacing=1.5, paragraph_index=0),
            _para(
                "Page two paragraph is the only violation and must still be detected here.",
                spacing=1.0,
                page=1,
                line=0,
                paragraph_index=1,
            ),
        ]
        collector = IssueCollector()
        _check_spacing(units, {"line_spacing": 1.5}, CategoryStats(), collector)
        self.assertIn("line_spacing", collector.items)
        self.assertEqual(len(collector.items["line_spacing"]["locations"]), 1)
        self.assertEqual(collector.items["line_spacing"]["locations"][0].get("page"), 2)


if __name__ == "__main__":
    unittest.main()
