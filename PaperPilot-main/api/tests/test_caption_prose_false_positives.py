"""Caption checks must ignore body Table/Figure references (any manuscript).

Rule #1: fixtures use generic wording only — no Capstone/PaperPilot-specific titles.
"""

from __future__ import annotations

import unittest

from app.compliance import IssueCollector, _check_captions, _is_caption_prose_reference
from app.compliance import run_compliance_scan


def _unit(text: str, **kw) -> dict:
    return {
        "text": text,
        "page_index": kw.get("page_index", 0),
        "line_index": kw.get("line_index", 0),
        "source": kw.get("source", "body"),
        "role": kw.get("role", "body"),
        "spans": kw.get("spans")
        or [{"text": text, "font": "TimesNewRoman", "size": 12, "bold": False, "italic": False}],
        "bbox": [72, 72, 500, 90],
    }


TABLE_RULES = {
    "table_layout_requirements": [
        "Each table must be labeled Table number with its title in capital letters, "
        "both placed above the table."
    ],
    "figure_layout_requirements": [
        "Each figure must be labeled Figure number with its title placed below the figure. "
        "Figure number in bold."
    ],
}


class CaptionProseReferenceTests(unittest.TestCase):
    def test_narrative_verbs_are_prose_for_any_numbering(self):
        samples = [
            "Table 3 presents the summary of measured values for each group.",
            "Table 12 Shows the distribution across categories in this study.",
            "Figure 2.1 shows the architecture of the proposed system.",
            "Figure 4 Illustrates the workflow from upload to results.",
            "Fig. 7 depicts the sequence of validation steps used here.",
            # Compound table refs must stay prose (not caption line-structure flags).
            "Table 7 & 7.1 presents the data dictionary for the SUBSCRIPTIONS entity, which",
            "Table 7 and 7.1 present the data dictionary for the entity under review.",
            "Tables 7 and 8 show the measured attributes used during validation.",
            "Figure 3/3.1 illustrates the workflow from upload to scored results.",
        ]
        for text in samples:
            with self.subTest(text=text):
                self.assertTrue(_is_caption_prose_reference(text))

    def test_compound_table_prose_not_flagged_as_caption_structure(self):
        units = [
            _unit(
                "Table 7 & 7.1 presents the data dictionary for the SUBSCRIPTIONS entity, which "
                "stores plan and billing details for each account."
            )
        ]
        rules = {
            "table_layout_requirements": [
                "Table <number[1..n]>\nTABLE TITLE"
            ]
        }
        collector = IssueCollector()
        _check_captions(units, rules, collector)
        types = {issue["issue_type"] for issue in collector.result()}
        self.assertNotIn("table_caption_line_structure", types)
        self.assertFalse(any("presents the data dictionary" in str(issue) for issue in collector.result()))

    def test_real_caption_labels_are_not_prose(self):
        samples = [
            "Table 3. SUMMARY OF RESULTS",
            "Table 12: Participant Demographics",
            "Table 9 ENTITY_FIELDS",
            "Figure 2.1: System Architecture",
            "Figure 4 Mobile Upload Screen",
            "Fig. 7. Validation Sequence",
        ]
        for text in samples:
            with self.subTest(text=text):
                self.assertFalse(_is_caption_prose_reference(text))

    def test_check_captions_skips_prose_and_table_cells(self):
        units = [
            _unit("Table 3 presents the summary of measured values for each group in detail."),
            _unit("Table 3", source="table", role="table"),  # in-grid — must not score
            _unit("Year Value", source="table", role="table"),
            _unit("Table 4. SUMMARY OF RESULTS"),
            _unit("col a", source="table", role="table"),
            _unit("Figure 2.1 shows the architecture of the proposed system used here."),
            _unit(
                "Figure 2.1: System Architecture",
                spans=[
                    {"text": "Figure 2.1: ", "font": "TimesNewRoman", "size": 12, "bold": True, "italic": False},
                    {
                        "text": "System Architecture",
                        "font": "TimesNewRoman",
                        "size": 12,
                        "bold": False,
                        "italic": False,
                    },
                ],
            ),
            _unit("", drawing=True),  # figure object for placement
        ]
        # Mark drawing unit
        units[-1]["has_drawing"] = True
        units[-1]["bbox"] = [72, 200, 400, 420]

        collector = IssueCollector()
        _check_captions(units, TABLE_RULES, collector)
        types = set(collector.items)
        excerpts = []
        for item in collector.items.values():
            for loc in item.get("locations") or []:
                excerpts.append(loc.get("excerpt") or "")

        # Prose references must never appear as caption findings.
        joined = " ".join(excerpts).lower()
        self.assertNotIn("presents the summary", joined)
        self.assertNotIn("shows the architecture", joined)
        # In-grid bare "Table 3" must not be treated as a caption line.
        self.assertFalse(any(ex.strip() == "Table 3" for ex in excerpts))

    def test_scan_keeps_real_caption_case_flags_without_prose_hits(self):
        from tests.test_compliance_pipeline import _mechanics_paragraph

        paragraphs = [
            _mechanics_paragraph(
                0,
                "Table 8 presents the measured attributes used during validation of the sample set.",
            ),
            _mechanics_paragraph(1, "Table 9. sensor readings"),  # title not all-caps → flag
            _mechanics_paragraph(2, "Year Value", source="table", size=10),
            _mechanics_paragraph(
                3,
                "Figure 3.2 shows the mobile upload screen of the sample application in use.",
            ),
            _mechanics_paragraph(4, "Figure 3.2: Sample Upload Screen"),
            _mechanics_paragraph(5, "", drawing=True),
        ]
        result = run_compliance_scan(
            {
                "text": "\n".join(p["text"] for p in paragraphs),
                "metadata": {"format": "docx"},
                "paragraphs": paragraphs,
                "sections": [
                    {
                        "page_width_inches": 8.5,
                        "page_height_inches": 11,
                        "top_margin_inches": 1,
                        "bottom_margin_inches": 1,
                        "left_margin_inches": 1,
                        "right_margin_inches": 1,
                    }
                ],
            },
            {
                "font": {"families": ["Times New Roman"], "body_size": 12},
                **TABLE_RULES,
            },
            "free",
        )
        caption_excerpts = []
        for issue in result["issues"]:
            if str(issue.get("issue_type") or "").startswith(("table_caption", "figure_caption")):
                for loc in issue.get("locations") or []:
                    caption_excerpts.append(str(loc.get("excerpt") or ""))
        blob = " ".join(caption_excerpts).lower()
        self.assertNotIn("presents the measured", blob)
        self.assertNotIn("shows the mobile", blob)
        # Real caption with wrong case still flagged.
        self.assertTrue(any("sensor readings" in ex.lower() for ex in caption_excerpts))


if __name__ == "__main__":
    unittest.main()
