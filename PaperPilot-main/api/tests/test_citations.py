"""Unit tests for deterministic citation marker checks."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from app.compliance import (
    IN_TEXT_MLA_RE,
    IssueCollector,
    _check_citations,
    _citation_marker_families,
    _expected_citation_families,
)


def _unit(text: str, page_index: int = 0, line_index: int = 0, role: str = "body") -> dict:
    return {
        "text": text,
        "page_index": page_index,
        "line_index": line_index,
        "role": role,
        "source": "body",
    }


def _run(units: list[dict], style: str | None) -> list[dict]:
    collector = IssueCollector()
    text = "\n".join(unit["text"] for unit in units)
    rules = {"citation_style": style} if style else {}
    with patch("app.citation_ml.classify_citation", return_value=None):
        _check_citations(units, text, rules, collector)
    return collector.result()


class CitationFamilyHelpersTests(unittest.TestCase):
    def test_expected_families(self):
        self.assertEqual(_expected_citation_families("APA"), {"apa"})
        self.assertEqual(_expected_citation_families("MLA"), {"mla"})
        self.assertEqual(_expected_citation_families("IEEE"), {"numeric"})
        self.assertEqual(_expected_citation_families("VANCOUVER"), {"numeric"})
        self.assertEqual(_expected_citation_families(""), set())

    def test_marker_families(self):
        self.assertEqual(_citation_marker_families("See (Smith, 2020)."), {"apa"})
        self.assertEqual(_citation_marker_families("See (Smith 45)."), {"mla"})
        self.assertEqual(_citation_marker_families("See [1] and [2-3]."), {"numeric"})
        self.assertEqual(
            _citation_marker_families("Mix (Smith, 2020) and [1]."),
            {"apa", "numeric"},
        )

    def test_tech_label_is_not_mla(self):
        """Short tech tokens like (Gen 2) must not count as MLA author-page citations."""
        self.assertFalse(IN_TEXT_MLA_RE.search("(Gen 2)"))
        self.assertFalse(IN_TEXT_MLA_RE.search("(GEN 2)"))
        self.assertTrue(IN_TEXT_MLA_RE.search("(Smith 45)"))
        self.assertTrue(IN_TEXT_MLA_RE.search("(Lee 12)"))
        self.assertEqual(_citation_marker_families("Chipset row (Gen 2) only."), set())
        self.assertEqual(_citation_marker_families("See (Smith 45)."), {"mla"})
        self.assertEqual(_citation_marker_families("See (Smith, 2020)."), {"apa"})


class CitationCheckTests(unittest.TestCase):
    def test_skips_when_style_unset(self):
        units = [
            _unit("Mostly fine (Smith, 2020)."),
            _unit("But also wrong [1].", line_index=1),
        ]
        issues = _run(units, None)
        self.assertEqual(issues, [])

    def test_clean_apa_stays_clean(self):
        units = [
            _unit("Prior work shows gains (Smith, 2020)."),
            _unit("Others agree (Lee & Park, 2019).", line_index=1),
            _unit("Recent surveys are clear (Ng et al., 2021).", line_index=2),
        ]
        issues = _run(units, "APA")
        self.assertEqual(issues, [])

    def test_minority_ieee_in_apa_doc_flags(self):
        units = [
            _unit("Prior work shows gains (Smith, 2020)."),
            _unit("Others agree (Lee & Park, 2019).", line_index=1),
            _unit("One line uses brackets [1].", line_index=2),
        ]
        issues = _run(units, "APA")
        citation = [item for item in issues if item["issue_type"] == "citation_format"]
        self.assertEqual(len(citation), 1)
        self.assertEqual(citation[0]["count"], 1)
        self.assertEqual(citation[0]["locations"][0]["line"], 3)

    def test_mla_only_vs_apa_flags(self):
        units = [
            _unit("Shakespeare noted this early (Smith 45)."),
            _unit("Later critics disagree (Lee 12).", line_index=1),
        ]
        issues = _run(units, "APA")
        citation = [item for item in issues if item["issue_type"] == "citation_format"]
        self.assertEqual(len(citation), 1)
        self.assertEqual(citation[0]["count"], 2)

    def test_apa_markers_in_mla_doc_flags(self):
        units = [
            _unit("Correct MLA appears here (Smith 45)."),
            _unit("Wrong APA slips in (Lee, 2019).", line_index=1),
        ]
        issues = _run(units, "MLA")
        citation = [item for item in issues if item["issue_type"] == "citation_format"]
        self.assertEqual(len(citation), 1)
        self.assertEqual(citation[0]["count"], 1)
        self.assertEqual(citation[0]["locations"][0]["line"], 2)

    def test_apa_markers_in_ieee_doc_flags(self):
        units = [
            _unit("Numeric markers are expected [1]."),
            _unit("Author year is wrong here (Smith, 2020).", line_index=1),
        ]
        issues = _run(units, "IEEE")
        citation = [item for item in issues if item["issue_type"] == "citation_format"]
        self.assertEqual(len(citation), 1)
        self.assertEqual(citation[0]["count"], 1)

    def test_clean_ieee_stays_clean(self):
        units = [
            _unit("Earlier results appear in [1]."),
            _unit("Follow-on work is in [2-4].", line_index=1),
        ]
        issues = _run(units, "IEEE")
        self.assertEqual(issues, [])

    def test_table_tech_label_ignored_under_apa(self):
        """Table cells with (Gen 2)-like text must not raise citation_format under APA."""
        units = [
            _unit("Prior work shows gains (Smith, 2020)."),
            {
                **_unit("Accelerator family (Gen 2) in the matrix.", line_index=1, role="table"),
                "source": "table",
                "table_row": True,
            },
        ]
        issues = _run(units, "APA")
        self.assertEqual([item for item in issues if item["issue_type"] == "citation_format"], [])


if __name__ == "__main__":
    unittest.main()
