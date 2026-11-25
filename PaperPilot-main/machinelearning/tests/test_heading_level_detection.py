"""Heading level detection: style / outline / basedOn / size-rank without off-by-one."""

from __future__ import annotations

import unittest

from app.compliance import _annotate_roles


def _unit(
    text: str,
    *,
    size=12.0,
    style="",
    heading_level=None,
    heading_level_source=None,
    outline_level=None,
    style_based_on=None,
    page_index=0,
):
    return {
        "text": text,
        "dominant_size": size,
        "style": style,
        "source": "body",
        "page_index": page_index,
        "formatting": {"alignment": "left"},
        "spans": [{"text": text, "size": size, "font": "Times New Roman"}],
        "heading_level": heading_level,
        "heading_level_source": heading_level_source,
        "outline_level": outline_level,
        "style_based_on": style_based_on,
    }


def _rules(*, h4=False):
    font = {
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
    if h4:
        font["heading4_size"] = 11
        font["heading_styles"]["heading4"] = {"bold": "Yes"}
    return {"font": font}


class HeadingLevelDetectionTests(unittest.TestCase):
    def test_word_styles_map_h1_h2_h3_h4_exactly(self):
        units = [
            _unit("Introduction", size=16, style="Heading 1", heading_level=1, heading_level_source="style"),
            _unit("Background", size=14, style="Heading 2", heading_level=2, heading_level_source="style"),
            _unit("Prior Work", size=12, style="Heading 3", heading_level=3, heading_level_source="style"),
            _unit("Detail Note", size=11, style="Heading 4", heading_level=4, heading_level_source="style"),
            _unit("Body prose continues with enough words to stay body text here.", size=12),
        ]
        _annotate_roles(units, _rules(h4=True))
        self.assertEqual(units[0]["role"], "heading1")
        self.assertEqual(units[1]["role"], "heading2")
        self.assertEqual(units[2]["role"], "heading3")
        self.assertEqual(units[3]["role"], "heading4")
        self.assertEqual(units[4]["role"], "body")
        self.assertEqual(units[0]["heading_level_source"], "style")

    def test_outline_level_zero_is_heading1(self):
        """OOXML outlineLvl is 0-based; stored outline_level is already 1-based."""
        units = [
            _unit("Main Title", size=16, style="Normal", outline_level=1, heading_level=1, heading_level_source="outline"),
            _unit("Section Title", size=14, style="Normal", outline_level=2, heading_level=2, heading_level_source="outline"),
            _unit("Body prose continues with enough words to stay body text here.", size=12),
        ]
        _annotate_roles(units, _rules())
        self.assertEqual(units[0]["role"], "heading1")
        self.assertEqual(units[1]["role"], "heading2")
        self.assertEqual(units[0]["heading_level_source"], "outline")

    def test_based_on_heading_style_resolves_level(self):
        units = [
            _unit(
                "Chapter Title",
                size=16,
                style="ChapterTitle",
                heading_level=1,
                heading_level_source="basedOn",
                style_based_on="Heading 1",
            ),
            _unit(
                "Section Title",
                size=14,
                style="SectionTitle",
                heading_level=2,
                heading_level_source="basedOn",
                style_based_on="Heading 2",
            ),
            _unit("Body prose continues with enough words to stay body text here.", size=12),
        ]
        _annotate_roles(units, _rules())
        self.assertEqual(units[0]["role"], "heading1")
        self.assertEqual(units[1]["role"], "heading2")
        self.assertEqual(units[0]["heading_level_source"], "basedOn")

    def test_size_rank_starts_at_h1_when_no_structural_h1(self):
        """Without CHAPTER/H1, largest unstyled title must be H1 — not shifted to H2."""
        units = [
            _unit("INTRODUCTION", size=16),
            _unit("Rationale of the Study", size=14),
            _unit("Theoretical Framework", size=12),
            _unit("Body prose continues with enough words to stay body text here.", size=12),
        ]
        _annotate_roles(units, _rules())
        self.assertEqual(units[0]["role"], "heading1")
        self.assertEqual(units[1]["role"], "heading2")
        self.assertEqual(units[2]["role"], "heading3")
        self.assertEqual(units[3]["role"], "body")
        self.assertEqual(units[0].get("heading_level_source"), "inferred")

    def test_size_rank_keeps_h2_when_structural_h1_present(self):
        units = [
            _unit("CHAPTER I", size=16),
            _unit("INTRODUCTION", size=14),
            _unit("Rationale of the Study", size=12),
            _unit("Body prose continues with enough words to stay body text here.", size=12),
        ]
        _annotate_roles(units, _rules())
        self.assertEqual(units[0]["role"], "heading1")
        self.assertEqual(units[1]["role"], "heading2")
        self.assertEqual(units[2]["role"], "heading3")


if __name__ == "__main__":
    unittest.main()
