"""Cover/thesis titles must not be scored as Heading 2/3."""

from __future__ import annotations

import unittest

from app.compliance import _annotate_roles, _mark_title_page


def _unit(text: str, *, size=14.0, page_index=0, alignment="center", soft=False):
    return {
        "text": text,
        "dominant_size": size,
        "style": "",
        "source": "body",
        "page_index": page_index,
        "formatting": {"alignment": alignment},
        "spans": [{"text": text, "size": size, "font": "Times New Roman"}],
        "soft_wrap_continuation": soft,
    }


class CoverTitleNotHeadingTests(unittest.TestCase):
    def test_paperpilot_cover_title_is_title_page_not_heading2(self):
        units = [
            _unit("PAPERPILOT: AN AI-POWERED ACADEMIC DOCUMENT"),
            _unit("ANALYSIS AND COMPLIANCE CHECKING SYSTEM", soft=True),
            _unit("CHAPTER I", size=16, page_index=1, alignment="left"),
            _unit("INTRODUCTION", size=14, page_index=1, alignment="left"),
            _unit("Body prose continues with enough words to stay body text here.", size=12, page_index=1),
        ]
        rules = {
            "font": {
                "body_size": 12,
                "heading1_size": 16,
                "heading2_size": 12,
                "heading3_size": 11,
                "heading_styles": {
                    "heading1": {"bold": "Yes"},
                    "heading2": {"bold": "Yes"},
                    "heading3": {"bold": "Yes"},
                },
            },
            "pagination": {"title_page": "Hidden but counted"},
        }
        _annotate_roles(units, rules)
        _mark_title_page(units, rules)
        self.assertEqual(units[0]["role"], "title_page")
        self.assertEqual(units[1]["role"], "title_page")
        self.assertNotEqual(units[0]["role"], "heading2")
        self.assertEqual(units[2]["role"], "heading1")
        self.assertEqual(units[3]["role"], "heading2")

    def test_size_match_prefers_user_heading_sizes(self):
        units = [
            _unit("CHAPTER I", size=16, page_index=0, alignment="left"),
            _unit("Rationale of the Study", size=12, page_index=1, alignment="left"),
            _unit("Theoretical Framework", size=11, page_index=1, alignment="left"),
            _unit("Body prose continues with enough words to stay body text here.", size=12, page_index=1),
        ]
        rules = {
            "font": {
                "body_size": 12,
                "heading1_size": 16,
                "heading2_size": 12,
                "heading3_size": 11,
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
        self.assertEqual(units[2]["role"], "heading3")


if __name__ == "__main__":
    unittest.main()
