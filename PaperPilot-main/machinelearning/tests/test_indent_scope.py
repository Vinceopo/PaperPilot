"""Body first-line indent applies only to in-scope body paragraphs."""

from __future__ import annotations

import unittest

from app.compliance import (
    CategoryStats,
    IssueCollector,
    _annotate_roles,
    _check_indentation,
)


def _body_unit(text: str, *, indent=0.0, page=0, line=0, paragraph_index=0):
    return {
        "text": text,
        "role": "body",
        "source": "body",
        "page_index": page,
        "line_index": line,
        "paragraph_index": paragraph_index,
        "dominant_size": 12.0,
        "formatting": {
            "first_line_indent_inches": indent,
            "left_indent_inches": 0.0,
            "alignment": "left",
        },
        "spans": [{"text": text, "size": 12.0, "font": "Times New Roman"}],
    }


class IndentScopeTests(unittest.TestCase):
    def test_references_never_flagged_for_body_indent(self):
        units = [
            {
                "text": "REFERENCES",
                "role": "heading1",
                "source": "body",
                "page_index": 0,
                "line_index": 0,
                "paragraph_index": 0,
                "dominant_size": 14.0,
                "formatting": {"first_line_indent_inches": 0.0, "left_indent_inches": 0.0},
                "spans": [{"text": "REFERENCES", "size": 14.0, "font": "Times New Roman"}],
                "style": "Heading 1",
                "heading_level": 1,
                "heading_level_source": "style",
            },
            _body_unit(
                "Smith, J. (2020). A study of formatting rules in academic writing journals.",
                indent=0.0,
                line=1,
                paragraph_index=1,
            ),
            _body_unit(
                "Doe, A. (2019). Another reference entry without a first-line indent applied.",
                indent=0.0,
                line=2,
                paragraph_index=2,
            ),
        ]
        rules = {
            "first_line_indent_inches": 0.5,
            "font": {
                "body_size": 12,
                "heading1_size": 14,
                "heading_styles": {"heading1": {"bold": "Yes"}},
            },
        }
        _annotate_roles(units, rules)
        collector = IssueCollector()
        _check_indentation(units, rules, CategoryStats(), collector)
        self.assertNotIn("first_line_indent", collector.items)

    def test_front_matter_personal_info_never_flagged(self):
        units = [
            {
                "text": "ACKNOWLEDGEMENT",
                "role": "heading1",
                "source": "body",
                "page_index": 0,
                "line_index": 0,
                "paragraph_index": 0,
                "dominant_size": 14.0,
                "formatting": {"first_line_indent_inches": 0.0, "left_indent_inches": 0.0},
                "spans": [{"text": "ACKNOWLEDGEMENT", "size": 14.0, "font": "Times New Roman"}],
                "style": "Heading 1",
                "heading_level": 1,
                "heading_level_source": "style",
            },
            _body_unit(
                "The author wishes to thank everyone who supported this research project throughout.",
                indent=0.0,
                line=1,
                paragraph_index=1,
            ),
            _body_unit("Email Address: student@example.com", indent=0.0, line=2, paragraph_index=2),
            _body_unit("Personal Information", indent=0.0, line=3, paragraph_index=3),
        ]
        rules = {
            "first_line_indent_inches": 0.5,
            "font": {
                "body_size": 12,
                "heading1_size": 14,
                "heading_styles": {"heading1": {"bold": "Yes"}},
            },
        }
        _annotate_roles(units, rules)
        collector = IssueCollector()
        _check_indentation(units, rules, CategoryStats(), collector)
        self.assertNotIn("first_line_indent", collector.items)

    def test_body_paragraph_still_flagged_when_wrong(self):
        units = [
            {
                "text": "CHAPTER I",
                "role": "heading1",
                "source": "body",
                "page_index": 0,
                "line_index": 0,
                "paragraph_index": 0,
                "dominant_size": 16.0,
                "formatting": {"first_line_indent_inches": 0.0, "left_indent_inches": 0.0},
                "spans": [{"text": "CHAPTER I", "size": 16.0, "font": "Times New Roman"}],
            },
            _body_unit(
                "This body paragraph deliberately lacks the required first-line indentation for the check.",
                indent=0.0,
                line=1,
                paragraph_index=1,
            ),
        ]
        rules = {
            "first_line_indent_inches": 0.5,
            "font": {
                "body_size": 12,
                "heading1_size": 16,
                "heading_styles": {"heading1": {"bold": "Yes"}},
            },
        }
        _annotate_roles(units, rules)
        collector = IssueCollector()
        _check_indentation(units, rules, CategoryStats(), collector)
        self.assertIn("first_line_indent", collector.items)
        loc = collector.items["first_line_indent"]["locations"][0]
        self.assertEqual(loc.get("rule_id"), "first_line_indent")
        self.assertTrue(loc.get("rule_source"))
        self.assertTrue(loc.get("excerpt"))
        self.assertIsNotNone(loc.get("measured_value"))
        self.assertIsNotNone(loc.get("expected_value"))
        self.assertTrue(loc.get("paragraph_type"))


if __name__ == "__main__":
    unittest.main()
