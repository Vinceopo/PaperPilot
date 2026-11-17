"""Task 1: varied mechanics wording — no defaults, multi-element, needs review."""

from __future__ import annotations

import unittest

from app.documents import derive_mechanics_rules, parse_document


class VariedMechanicsExtractionTests(unittest.TestCase):
    def test_multi_element_heading_and_contents_same_value(self):
        rules = derive_mechanics_rules("Heading 3 and Contents = 11 pt. Font type: Arial.")
        font = rules["font"]
        self.assertEqual(font.get("heading3_size"), 11.0)
        self.assertEqual(font.get("body_size"), 11.0)

    def test_contradictory_contents_and_body_needs_review(self):
        rules = derive_mechanics_rules(
            "Heading 3 and Contents = 11 pt. Body text is 12 pt."
        )
        font = rules.get("font") or {}
        self.assertEqual(font.get("heading3_size"), 11.0)
        self.assertNotIn("body_size", font)
        review = rules.get("needs_review") or []
        self.assertTrue(any("body_size" in (row.get("fields") or []) for row in review))

    def test_paragraph_spacing_and_half_inch_indent(self):
        rules = derive_mechanics_rules(
            "All body paragraphs must be double spaced with a half-inch first-line indent. "
            "Paper is Letter size in portrait orientation."
        )
        self.assertEqual(rules.get("spacing"), "2")
        self.assertEqual(rules.get("indention"), "0.5 inch")
        self.assertEqual((rules.get("paper") or {}).get("orientation"), "Portrait")

    def test_unstated_fields_stay_empty_no_default_orientation(self):
        rules = derive_mechanics_rules(
            "This guide only discusses plagiarism rules and submission deadlines."
        )
        self.assertNotIn("font", rules)
        self.assertNotIn("spacing", rules)
        self.assertNotIn("indention", rules)
        self.assertFalse((rules.get("paper") or {}).get("orientation"))

    def test_ambiguous_or_range_needs_review(self):
        rules = derive_mechanics_rules(
            "Headings should be 14 or 16 points depending on the chapter. Font type: Arial."
        )
        font = rules.get("font") or {}
        self.assertEqual(font.get("type"), "Arial")
        self.assertNotIn("heading1_size", font)
        self.assertNotIn("body_size", font)
        self.assertTrue(rules.get("needs_review"))

    def test_running_text_and_inset_synonyms(self):
        rules = derive_mechanics_rules(
            "Typeface: Arial. Point size for running text: 11. "
            "Line space: single. First line inset: 1.27 cm."
        )
        self.assertEqual((rules.get("font") or {}).get("body_size"), 11.0)
        self.assertEqual(rules.get("spacing"), "1")
        self.assertEqual(rules.get("indention"), "0.5 inch")

    def test_pdf_and_docx_fixture_agree_on_core_sizes(self):
        from pathlib import Path

        root = Path(__file__).resolve().parents[2]
        docx_path = root / "testdata/ml-fixtures/mechanics/apa_format_mechanics_guide.docx"
        pdf_path = root / "testdata/ml-fixtures/mechanics/apa_format_mechanics_guide.pdf"
        with open(docx_path, "rb") as handle:
            docx = parse_document(handle.read(), "docx")
        with open(pdf_path, "rb") as handle:
            pdf = parse_document(handle.read(), "pdf")
        docx_rules = derive_mechanics_rules(docx.get("text") or "")
        pdf_rules = derive_mechanics_rules(pdf.get("text") or "")
        for key in ("heading1_size", "heading2_size", "heading3_size", "body_size"):
            self.assertEqual(
                (docx_rules.get("font") or {}).get(key),
                (pdf_rules.get("font") or {}).get(key),
                msg=key,
            )
        self.assertEqual(docx_rules.get("spacing"), pdf_rules.get("spacing"))
        self.assertEqual(docx_rules.get("indention"), pdf_rules.get("indention"))


if __name__ == "__main__":
    unittest.main()
