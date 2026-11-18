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
        "spans": [{"text": text, "size": size, "font": "Times New Roman"}],
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

    def test_size_rank_does_not_dump_h2_or_body_onto_h3(self):
        """H2 and body-sized titles must not become Heading 3 via leftover rank."""
        units = [
            _unit("CHAPTER I", size=16),
            _unit("Rationale of the Study", size=14),  # real H2
            _unit("Software Engineering Methodology", size=14),  # also H2
            _unit("Data Gathering Procedure", size=12),  # real H3
            _unit("Short Body Label", size=11),  # body-sized, not H3
        ]
        rules = {
            "font": {
                "body_size": 11,
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
        self.assertEqual(units[0]["role"], "heading1")
        self.assertEqual(units[1]["role"], "heading2")
        self.assertEqual(units[2]["role"], "heading2")
        self.assertEqual(units[3]["role"], "heading3")
        self.assertNotEqual(units[4]["role"], "heading3")
        self.assertIn(units[4]["role"], {"body", "heading_uncertain", "heading_other"})

    def test_h3_same_as_body_size_still_detected_from_user_rules(self):
        """When Heading 3 size equals body size in the user's rules, still detect H3."""
        units = [
            _unit("CHAPTER I", size=16),
            _unit("INTRODUCTION", size=14),
            _unit("Rationale of the Study", size=14),
            _unit("Theoretical Framework", size=12),
            _unit("Conceptual Framework", size=12),
            _unit("Body prose continues with enough words to stay body text here.", size=12),
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
        self.assertEqual(units[0]["role"], "heading1")
        self.assertEqual(units[1]["role"], "heading2")
        self.assertEqual(units[2]["role"], "heading2")
        self.assertEqual(units[3]["role"], "heading3")
        self.assertEqual(units[4]["role"], "heading3")
        self.assertEqual(units[5]["role"], "body")

    def test_h4_h5_detected_from_user_heading_sizes(self):
        """Heading 4/5 follow the user's configured sizes, not only H2."""
        units = [
            _unit("CHAPTER I", size=16),
            _unit("Major Section", size=14),
            _unit("Sub Section", size=12),
            _unit("Detail Heading", size=11),
            _unit("Fine Heading", size=10),
            _unit("Body prose continues with enough words to stay body text here.", size=12),
        ]
        rules = {
            "font": {
                "body_size": 12,
                "heading1_size": 16,
                "heading2_size": 14,
                "heading3_size": 12,
                "heading4_size": 11,
                "heading5_size": 10,
                "heading_styles": {
                    "heading1": {"bold": "Yes"},
                    "heading2": {"bold": "Yes"},
                    "heading3": {"bold": "Yes"},
                    "heading4": {"bold": "Yes"},
                    "heading5": {"bold": "Yes"},
                },
            }
        }
        _annotate_roles(units, rules)
        self.assertEqual(units[1]["role"], "heading2")
        self.assertEqual(units[2]["role"], "heading3")
        self.assertEqual(units[3]["role"], "heading4")
        self.assertEqual(units[4]["role"], "heading5")
        self.assertEqual(units[5]["role"], "body")

    def test_changed_heading_size_rules_still_detect_headings(self):
        """Rule #1: when H2/H3 point sizes change, headings must still be roles + flagged."""
        from app.compliance import CategoryStats, IssueCollector, _check_fonts

        units = [
            _unit("CHAPTER I", size=16),
            _unit("Rationale of the Study", size=14),  # measured 14, rule now 16
            _unit("Data Gathering Procedure", size=12),  # measured 12, rule now 11
            _unit("Body prose continues with enough words to stay body text here.", size=11),
        ]
        # User changed H2/H3 rules away from the document's measured sizes.
        rules = {
            "font": {
                "body_size": 11,
                "heading1_size": 16,
                "heading2_size": 16,
                "heading3_size": 11,
                "heading_styles": {
                    "heading1": {"bold": "Yes"},
                    "heading2": {"bold": "Yes"},
                    "heading3": {"bold": "Yes"},
                },
            }
        }
        _annotate_roles(units, rules)
        self.assertEqual(units[1]["role"], "heading2", units[1])
        self.assertEqual(units[2]["role"], "heading3", units[2])
        self.assertEqual(units[3]["role"], "body")

        stats = CategoryStats()
        collector = IssueCollector()
        _check_fonts(units, rules, stats, collector)
        types = {issue.get("issue_type") for issue in collector.result()}
        self.assertIn("font_size_heading2", types)
        self.assertIn("font_size_heading3", types)

    def test_h3_still_detected_when_rule_size_differs_from_measured(self):
        """H3 keeps its level when the user changes heading3_size away from the PDF."""
        from app.compliance import CategoryStats, IssueCollector, _check_fonts

        units = [
            _unit("CHAPTER I", size=16),
            _unit("INTRODUCTION", size=14),
            _unit("Rationale of the Study", size=14),
            _unit("Data Gathering Procedure", size=12),
            _unit("Body prose continues with enough words to stay body text here.", size=11),
        ]
        rules = {
            "font": {
                "body_size": 11,
                "heading1_size": 16,
                "heading2_size": 14,
                "heading3_size": 10,  # measured H3 is 12 — must still detect + flag
                "heading_styles": {
                    "heading1": {"bold": "Yes"},
                    "heading2": {"bold": "Yes"},
                    "heading3": {"bold": "Yes"},
                },
            }
        }
        _annotate_roles(units, rules)
        self.assertEqual(units[1]["role"], "heading2")
        self.assertEqual(units[2]["role"], "heading2")
        self.assertEqual(units[3]["role"], "heading3", units[3])
        stats = CategoryStats()
        collector = IssueCollector()
        _check_fonts(units, rules, stats, collector)
        issues = collector.result()
        types = {issue.get("issue_type") for issue in issues}
        self.assertIn("font_size_heading3", types)
        self.assertTrue(
            any(
                "Heading 3" in str(issue.get("title") or issue.get("message") or issue.get("explanation") or "")
                for issue in issues
            )
        )

    def test_unset_heading3_rule_is_ignored(self):
        """No heading3 size/style → no heading3 role checks / no H3 issues."""
        from app.compliance import CategoryStats, IssueCollector, _check_fonts

        units = [
            _unit("CHAPTER I", size=16),
            _unit("Rationale of the Study", size=14),
            _unit("Data Gathering Procedure", size=12),
            _unit("Body prose continues with enough words to stay body text here.", size=11),
        ]
        rules = {
            "font": {
                "body_size": 11,
                "heading1_size": 16,
                "heading2_size": 14,
                "heading_styles": {
                    "heading1": {"bold": "Yes"},
                    "heading2": {"bold": "Yes"},
                },
            }
        }
        _annotate_roles(units, rules)
        self.assertEqual(units[1]["role"], "heading2")
        self.assertNotEqual(units[2]["role"], "heading3")
        stats = CategoryStats()
        collector = IssueCollector()
        _check_fonts(units, rules, stats, collector)
        types = {issue.get("issue_type") for issue in collector.result()}
        self.assertNotIn("font_size_heading3", types)

    def test_table_cell_never_becomes_heading(self):
        units = [
            _unit("CHAPTER I", size=16),
            {
                **_unit("Email Address: vince@example.com", size=12),
                "table_row": True,
                "source": "table",
            },
            _unit("Rationale of the Study", size=14),
        ]
        rules = {
            "font": {
                "body_size": 11,
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
        self.assertEqual(units[1]["role"], "table")
        self.assertEqual(units[2]["role"], "heading2")

    def test_all_caps_colon_title_is_not_chrome_or_body(self):
        """Thesis titles with a colon must not be treated as form chrome / body."""
        title = "PAPERPILOT: AN AI-POWERED ACADEMIC DOCUMENT"
        self.assertFalse(_looks_like_field_or_chrome_label(title), title)
        self.assertTrue(_is_section_heading_title(title), title)

        units = [
            _unit(title, size=14.05),
            _unit("A Research Project", size=12),
            _unit("Body prose continues with enough words to stay body text here.", size=11),
        ]
        rules = {
            "font": {
                "body_size": 11,
                "heading1_size": 14,
                "heading2_size": 12,
                "heading_styles": {
                    "heading1": {"bold": "Yes"},
                    "heading2": {"bold": "Yes"},
                },
            }
        }
        from app.compliance import CategoryStats, IssueCollector, _check_fonts

        _annotate_roles(units, rules)
        self.assertNotEqual(units[0]["role"], "body")
        self.assertIn(units[0]["role"], {"heading_other", "heading1", "heading2"})
        self.assertEqual(units[2]["role"], "body")

        stats = CategoryStats()
        collector = IssueCollector()
        _check_fonts(units, rules, stats, collector)
        body_size_hits = [
            issue
            for issue in collector.result()
            if issue.get("issue_type") == "font_size"
            and "body text" in str(issue.get("message") or "").lower()
        ]
        self.assertEqual(body_size_hits, [])


if __name__ == "__main__":
    unittest.main()
