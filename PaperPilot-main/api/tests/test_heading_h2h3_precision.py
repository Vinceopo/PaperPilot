"""Task 3: H2/H3 precision — chrome rejected; real section titles kept; H1 untouched."""

from __future__ import annotations

import unittest

from app.compliance import (
    _annotate_roles,
    _is_section_heading_title,
    _looks_like_field_or_chrome_label,
)


def _unit(text: str, *, size=12.0, style="", role=None, page_index=0):
    return {
        "text": text,
        "dominant_size": size,
        "style": style,
        "source": "body",
        "page_index": page_index,
        "formatting": {"alignment": "left"},
        **({"role": role} if role else {}),
    }


class HeadingPrecisionTests(unittest.TestCase):
    def test_chrome_labels_rejected(self):
        for text in (
            "Email Address:",
            "Civil Status: Single",
            "Personal Information",
            "High School",
            "Gov. M. Cuenco Ave, Cebu City, 6000 Cebu",
            "Size",
            "USER",
        ):
            self.assertTrue(_looks_like_field_or_chrome_label(text), text)
            self.assertFalse(_is_section_heading_title(text), text)

    def test_real_section_titles_accepted(self):
        for text in (
            "INTRODUCTION",
            "Rationale of the Study",
            "Review of Related Literature",
            "Software Engineering Methodology",
        ):
            self.assertTrue(_is_section_heading_title(text), text)

    def test_annotate_keeps_h2_and_uncertain_for_chrome(self):
        units = [
            _unit("CHAPTER I", size=16),
            _unit("INTRODUCTION", size=14),
            _unit("Rationale of the Study", size=14),
            _unit("Email Address: vince@example.com", size=12),
            _unit("Personal Information", size=12),
            _unit("Body prose continues with enough words here.", size=12),
        ]
        rules = {
            "font": {
                "body_size": 12,
                "heading1_size": 16,
                "heading2_size": 14,
                "heading3_size": 12,
                "heading_styles": {
                    "heading1": {"bold": "Yes"},
                    "heading2": {"bold": "Yes"},
                    "heading3": {"bold": "Yes"},
                },
            }
        }
        _annotate_roles(units, rules)
        roles = [u["role"] for u in units]
        self.assertEqual(roles[0], "heading1")
        self.assertIn(roles[1], {"heading2", "section_title_pending", "heading3"})
        self.assertIn(roles[2], {"heading2", "heading3"})
        self.assertIn(roles[3], {"body", "heading_uncertain"})
        self.assertIn(roles[4], {"body", "heading_uncertain"})
        self.assertEqual(roles[5], "body")

    def test_h1_structural_unchanged_when_h2_rules_present(self):
        units = [
            _unit("CHAPTER I", size=16),
            _unit("ACKNOWLEDGEMENT", size=16),
            _unit("Rationale of the Study", size=14),
        ]
        rules = {
            "font": {
                "body_size": 12,
                "heading1_size": 16,
                "heading2_size": 14,
                "heading_styles": {"heading1": {"bold": "Yes"}, "heading2": {"bold": "Yes"}},
            }
        }
        _annotate_roles(units, rules)
        self.assertEqual(units[0]["role"], "heading1")
        self.assertEqual(units[1]["role"], "heading1")


if __name__ == "__main__":
    unittest.main()
