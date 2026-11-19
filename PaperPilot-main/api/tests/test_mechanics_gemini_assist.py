"""v10.0.1 Dynamic Mechanics + Gemini assist — mocked Gemini paths."""

from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

from app.compliance import run_compliance_scan
from app.documents import (
    assert_mechanics_guide,
    derive_mechanics_rules,
    normalize_mechanics_rules,
    parse_document,
)
from app.mechanics_gemini import (
    assist_visual_mechanics,
    harvest_assist_items_from_guide,
    understand_mechanics_with_gemini,
)

# Fixture only — never used as ACM-specific product branching.
_ACM_TEMPLATE = Path(__file__).resolve().parents[2] / "docs" / "acm_template.docx"


class FakeGeminiResponse:
    def __init__(self, text: str):
        self.text = text


class MechanicsGeminiAssistTests(unittest.TestCase):
    def test_understand_fills_schema_and_assist_items(self):
        seed = normalize_mechanics_rules(
            {"font": {"type": "Arial", "body_size": 12}, "margins_inches": {"top": 1.0}}
        )
        payload = {
            "rules": {
                "font": {"type": "Times New Roman", "body_size": 12, "heading1_size": 14},
                "citation_style": "APA",
            },
            "assist_items": [
                {
                    "id": "assist_figure_alt_text",
                    "category": "figure_layout",
                    "requirement_text": "Every figure must have alt-text / figure description",
                    "kind": "image",
                    "assist_required": True,
                }
            ],
            "confidence": 0.82,
            "guide_kind": "hybrid",
        }

        with (
            patch("app.mechanics_gemini._gemini_ready", return_value=True),
            patch("app.mechanics_gemini.genai") as genai,
        ):
            model = genai.GenerativeModel.return_value
            model.generate_content.return_value = FakeGeminiResponse(
                __import__("json").dumps(payload)
            )
            result = understand_mechanics_with_gemini(
                "Margins 1 inch. Figures need alt text. Font Times New Roman 12 pt.",
                seed,
            )

        # Seed Arial kept; Gemini fills missing heading size + citation.
        self.assertEqual(result["rules"]["font"]["type"], "Arial")
        self.assertEqual(result["rules"]["font"].get("heading1_size"), 14)
        self.assertEqual(result["rules"].get("citation_style"), "APA")
        self.assertEqual(len(result["assist_items"]), 1)
        self.assertEqual(result["assist_items"][0]["kind"], "image")
        self.assertTrue(result["assist_items"][0]["assist_required"])
        self.assertTrue(result["gemini_used"])
        self.assertEqual(result["guide_kind"], "hybrid")

    def test_understand_degrades_when_gemini_off(self):
        seed = {"font": {"type": "Arial"}}
        with patch("app.mechanics_gemini._gemini_ready", return_value=False):
            result = understand_mechanics_with_gemini("Any guide text", seed)
        self.assertEqual(result["rules"], seed)
        self.assertEqual(result["assist_items"], [])
        self.assertFalse(result["gemini_used"])
        self.assertFalse(result["gemini_available"])

    def test_harvest_runs_when_gemini_off(self):
        text = (
            "Every figure should have a figure description unless it is purely decorative. "
            "Provide alt-text for images. Tables must have a caption above them."
        )
        with patch("app.mechanics_gemini._gemini_ready", return_value=False):
            result = understand_mechanics_with_gemini(text, {})
        ids = {item["id"] for item in result["assist_items"]}
        self.assertIn("assist_figure_alt_text", ids)
        self.assertFalse(result["gemini_used"])

    def test_scan_assist_findings_do_not_change_score(self):
        parsed = {
            "text": "Figure 1: Sample chart\nBody text here.",
            "metadata": {"format": "docx"},
            "pages": [],
        }
        rules = normalize_mechanics_rules(
            {
                "font": {"type": "Arial", "body_size": 12, "families": ["Arial"]},
                "margins_inches": {"top": 1, "bottom": 1, "left": 1, "right": 1},
            }
        )
        assist_items = [
            {
                "id": "assist_figure_alt_text",
                "category": "figure_layout",
                "requirement_text": "Every figure must have alt-text",
                "kind": "image",
                "assist_required": True,
            }
        ]
        fake_findings = [
            {
                "assist_item_id": "assist_figure_alt_text",
                "kind": "image",
                "title": "Missing alt-text",
                "summary": "No figure description found near Figure 1.",
                "recommendation": "Add alt-text for each figure.",
                "confidence": 0.7,
                "status": "possible_issue",
            }
        ]

        with patch(
            "app.mechanics_gemini.assist_visual_mechanics", return_value=fake_findings
        ):
            baseline = run_compliance_scan(parsed, rules, "free", assist_items=None)
            assisted = run_compliance_scan(parsed, rules, "free", assist_items=assist_items)

        self.assertEqual(baseline["overall_score"], assisted["overall_score"])
        self.assertEqual(baseline.get("units_checked"), assisted.get("units_checked"))
        self.assertEqual(baseline.get("units_failed"), assisted.get("units_failed"))
        self.assertEqual(len(baseline["issues"]), len(assisted["issues"]))
        self.assertEqual(assisted["assist_findings"], fake_findings)
        self.assertEqual(baseline.get("assist_findings") or [], [])

    def test_assist_unavailable_when_gemini_off(self):
        items = [
            {
                "id": "assist_x",
                "requirement_text": "Figures must be centered",
                "kind": "visual",
                "assist_required": True,
            }
        ]
        with patch("app.mechanics_gemini._gemini_ready", return_value=False):
            findings = assist_visual_mechanics(items, {"text": "Figure 1: x"}, {})
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["status"], "unavailable")

    def test_template_as_guide_vocabulary_is_accepted(self):
        """Long template-shaped guides with instruction vocabulary should not be rejected."""
        guide = (
            "Author guidelines and manuscript template for submissions.\n"
            "Prepare your manuscript using the document styles below.\n"
            "Formatting requirements: figure caption above each figure; "
            "table caption above each table; provide alt-text / figure description "
            "for accessibility. Submission template includes styles gallery entries "
            "for Heading 1, body text, and captions.\n"
            "Margins: 1 inch on all sides. Font size for body: 10 pt.\n"
            "Line spacing: single. Paper size: letter.\n"
            "Camera-ready formatting instructions continue with pagination rules "
            "and layout for tables and figures throughout this template document.\n"
        ) * 3
        rules = derive_mechanics_rules(guide)
        # Should not raise DocumentError for template-as-guide shape.
        assert_mechanics_guide(guide, rules)

    @unittest.skipUnless(_ACM_TEMPLATE.exists(), "docs/acm_template.docx fixture missing")
    def test_template_fixture_accepted_without_false_schema_noise(self):
        """Real template-as-guide fixture: accept, don't invent IEEE/color/indent noise."""
        parsed = parse_document(_ACM_TEMPLATE.read_bytes(), "docx")
        text = parsed.get("text") or ""
        rules = derive_mechanics_rules(text)
        assert_mechanics_guide(text, rules)
        normalized = normalize_mechanics_rules(rules)

        # Sample bibliography lines mention IEEE as a publisher — not citation_style.
        self.assertNotIn("citation_style", normalized)
        font = normalized.get("font") if isinstance(normalized.get("font"), dict) else {}
        color = str(font.get("color") or "").lower()
        self.assertNotIn("vision", color)
        self.assertNotIn("first_line_indent_inches", normalized)
        # Body alignment must not come from DisplayFormula "flush left" style notes.
        self.assertNotIn("alignment", normalized)

        assist = harvest_assist_items_from_guide(text)
        ids = {item["id"] for item in assist}
        self.assertIn("assist_figure_alt_text", ids)
        self.assertTrue(ids & {"assist_table_caption_placement", "assist_figure_caption_placement"})

        styles = sorted(
            {
                str(para.get("style") or "")
                for para in (parsed.get("paragraphs") or [])
                if isinstance(para, dict) and para.get("style")
            }
        )
        with patch("app.mechanics_gemini._gemini_ready", return_value=False):
            understood = understand_mechanics_with_gemini(text, rules, style_names=styles)
        self.assertEqual(understood["guide_kind"], "template_as_guide")
        self.assertGreaterEqual(len(understood["assist_items"]), 3)
        self.assertFalse(understood["gemini_used"])


if __name__ == "__main__":
    unittest.main()
