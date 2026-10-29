"""Gemini must not contradict engine classification labels."""

from __future__ import annotations

import unittest

from app.gemini_client import (
    _apply_gemini_wording,
    _engine_role_label,
    _strip_location_role_fields,
    _wording_contradicts_engine,
)


class GeminiRoleGuardTests(unittest.TestCase):
    def test_engine_role_label_from_issue_type(self):
        self.assertEqual(_engine_role_label({"issue_type": "font_size"}), "body text")
        self.assertEqual(_engine_role_label({"issue_type": "font_size_heading2"}), "Heading 2")

    def test_body_wording_with_heading_is_conflict(self):
        self.assertTrue(
            _wording_contradicts_engine(
                "This Heading 2 is 11 pt", "body text", "font_size"
            )
        )
        self.assertFalse(
            _wording_contradicts_engine(
                "This body text is 11 pt", "body text", "font_size"
            )
        )

    def test_apply_rejects_conflicting_explanation(self):
        issue = {
            "issue_type": "font_size",
            "explanation": "Measured 11 pt for body text.",
            "recommendation": "Set body text to 12 pt.",
        }
        _apply_gemini_wording(
            issue,
            {
                "explanation": "This Heading 2 does not use 12 pt.",
                "recommendation": "Fix Heading 2 size.",
            },
        )
        self.assertIn("role_conflict", issue.get("gemini_wording_rejected") or "")
        self.assertEqual(issue["explanation"], "Measured 11 pt for body text.")
        self.assertEqual(issue["recommendation"], "Set body text to 12 pt.")

    def test_locations_sent_to_gemini_omit_roles(self):
        safe = _strip_location_role_fields(
            [
                {
                    "page": 18,
                    "line": 8,
                    "excerpt": "APA",
                    "element_role": "heading2",
                    "role_rule": "x",
                    "measured": 11,
                }
            ]
        )
        self.assertNotIn("element_role", safe[0])
        self.assertEqual(safe[0]["excerpt"], "APA")


if __name__ == "__main__":
    unittest.main()
