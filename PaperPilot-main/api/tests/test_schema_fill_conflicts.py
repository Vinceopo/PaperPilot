"""Schema fill + later-wins conflicts for /mechanics/extract."""

from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from app.documents import (
    apply_template_extract_guards,
    derive_mechanics_rules,
    normalize_mechanics_rules,
)
from app.mechanics_gemini import (
    assist_visual_mechanics,
    expand_sideless_margins,
    finalize_understood_mechanics,
    harvest_assist_items_from_guide,
    resolve_guide_conflicts,
    understand_mechanics_with_gemini,
)


class FakeGeminiResponse:
    def __init__(self, text: str):
        self.text = text


class AllSidesMarginFillTests(unittest.TestCase):
    def test_sideless_margins_fill_all_four_sides(self):
        for guide in (
            "Margins 1 inch.",
            "Margins: 1 inch",
            "Margins should be 1 inch.",
            "Set margins to 1.25 inches.",
            "Use 1 inch margins.",
        ):
            with self.subTest(guide=guide):
                rules = derive_mechanics_rules(guide)
                margins = rules.get("margins_inches") or {}
                self.assertEqual(
                    {side: margins.get(side) for side in ("top", "bottom", "left", "right")},
                    {
                        "top": margins["top"],
                        "bottom": margins["bottom"],
                        "left": margins["left"],
                        "right": margins["right"],
                    },
                )
                self.assertEqual(len({margins[s] for s in ("top", "bottom", "left", "right")}), 1)
                self.assertIsNotNone(margins.get("top"))

    def test_expand_scalar_margins_inches(self):
        expanded = expand_sideless_margins({"margins_inches": 1})
        self.assertEqual(
            expanded["margins_inches"],
            {"top": 1.0, "bottom": 1.0, "left": 1.0, "right": 1.0},
        )

    def test_expand_value_key_margins(self):
        expanded = expand_sideless_margins({"margins_inches": {"value": 1.25}})
        self.assertEqual(
            expanded["margins_inches"],
            {"top": 1.25, "bottom": 1.25, "left": 1.25, "right": 1.25},
        )

    def test_named_single_side_not_expanded_without_uniform_cue(self):
        expanded = expand_sideless_margins(
            {"margins_inches": {"left": 1.25}},
            text="Left margin: 1.25 inches for binding.",
        )
        self.assertEqual(expanded["margins_inches"], {"left": 1.25})
        self.assertNotIn("top", expanded["margins_inches"])


class UnmentionedStayEmptyTests(unittest.TestCase):
    def test_unmentioned_schema_fields_stay_empty(self):
        guide = "Margins should be 1 inch. Font type: Arial. Body size: 12 pt."
        rules = derive_mechanics_rules(guide)
        with patch("app.mechanics_gemini._gemini_ready", return_value=False):
            understood = understand_mechanics_with_gemini(guide, rules)
        out = understood["rules"]
        self.assertEqual(
            out["margins_inches"],
            {"top": 1.0, "bottom": 1.0, "left": 1.0, "right": 1.0},
        )
        self.assertEqual(out["font"]["type"], "Arial")
        # Not mentioned → empty so fillEmptyFieldsWithIgnore can mark Ignore.
        self.assertNotIn("alignment", out)
        self.assertNotIn("citation_style", out)
        self.assertNotIn("first_line_indent_inches", out)
        self.assertNotIn("indention", out)
        self.assertNotIn("pagination", out)


class LaterWinsConflictTests(unittest.TestCase):
    def test_later_uniform_margin_wins_with_friendly_conflict(self):
        guide = (
            "Margins: 1.25 inches. "
            "Later in this guide, margins must be 1 inch on all sides."
        )
        rules = derive_mechanics_rules(guide)
        with patch("app.mechanics_gemini._gemini_ready", return_value=False):
            understood = understand_mechanics_with_gemini(guide, rules)

        margins = understood["rules"]["margins_inches"]
        self.assertEqual(
            {side: margins[side] for side in ("top", "bottom", "left", "right")},
            {"top": 1.0, "bottom": 1.0, "left": 1.0, "right": 1.0},
        )
        conflicts = understood["conflicts"]
        self.assertEqual(len(conflicts), 1)
        conflict = conflicts[0]
        self.assertEqual(conflict["field"], "margins_inches")
        self.assertEqual(
            conflict["chosen"],
            {"top": 1.0, "bottom": 1.0, "left": 1.0, "right": 1.0},
        )
        self.assertEqual(
            conflict["rejected"],
            {"top": 1.25, "bottom": 1.25, "left": 1.25, "right": 1.25},
        )
        message = conflict["message"]
        self.assertIn("later one", message.lower())
        self.assertIn("1 inch on all sides", message.lower())
        self.assertNotIn("SOT", message)
        self.assertNotIn("SOC", message)
        self.assertIn("change this before saving", message.lower())

    def test_resolve_guide_conflicts_payload_shape(self):
        guide = "Set margins to 1.25 inches. Margins should be 1 inch."
        rules, conflicts = resolve_guide_conflicts(guide, {})
        self.assertEqual(
            rules["margins_inches"],
            {"top": 1.0, "bottom": 1.0, "left": 1.0, "right": 1.0},
        )
        self.assertEqual(conflicts[0]["field"], "margins_inches")
        self.assertIn("chosen", conflicts[0])
        self.assertIn("rejected", conflicts[0])
        self.assertIn("message", conflicts[0])


class AssistRoutingTests(unittest.TestCase):
    def test_unknown_and_visual_go_to_assist_not_schema(self):
        guide = (
            "Margins: 1 inch on all sides. "
            "Every figure should include alt-text / a figure description. "
            "Tables must have a caption above them."
        )
        seed = derive_mechanics_rules(guide)
        payload = {
            "rules": {
                "margins_inches": {"top": 1, "bottom": 1, "left": 1, "right": 1},
                "mystery_publisher_layout": "Use the ACM two-column camera-ready look",
                "visual_watermark": "Do not cover the logo watermark",
            },
            "assist_items": [
                {
                    "id": "assist_custom_style",
                    "category": "style",
                    "requirement_text": "Body text must look airy and elegant",
                    "kind": "style",
                    "assist_required": True,
                }
            ],
            "confidence": 0.7,
            "guide_kind": "hybrid",
        }
        with (
            patch("app.mechanics_gemini._gemini_ready", return_value=True),
            patch("app.mechanics_gemini.genai") as genai,
        ):
            model = genai.GenerativeModel.return_value
            model.generate_content.return_value = FakeGeminiResponse(json.dumps(payload))
            result = understand_mechanics_with_gemini(guide, seed)

        rules = result["rules"]
        self.assertNotIn("mystery_publisher_layout", rules)
        self.assertNotIn("visual_watermark", rules)
        self.assertIn("margins_inches", rules)

        assist_ids = {item["id"] for item in result["assist_items"]}
        assist_texts = " ".join(item["requirement_text"] for item in result["assist_items"])
        self.assertTrue(
            assist_ids & {"assist_figure_alt_text", "assist_table_caption_placement"}
            or "alt-text" in assist_texts.lower()
            or "caption" in assist_texts.lower()
        )
        self.assertTrue(
            any("watermark" in item["requirement_text"].lower() for item in result["assist_items"])
            or any("mystery" in item["id"] for item in result["assist_items"])
            or any(
                "camera-ready" in item["requirement_text"].lower()
                for item in result["assist_items"]
            )
        )
        self.assertTrue(all(item.get("assist_required") is True for item in result["assist_items"]))
        for item in result["assist_items"]:
            self.assertIn(item.get("kind"), {"visual", "image", "style", "other"})

    def test_finalize_routes_non_schema_keys(self):
        rules, assist, conflicts = finalize_understood_mechanics(
            "Margins should be 1 inch.",
            {
                "margins_inches": {"all": 1},
                "odd_rule": "Keep figures in grayscale for accessibility",
            },
            [],
        )
        self.assertEqual(
            rules["margins_inches"],
            {"top": 1.0, "bottom": 1.0, "left": 1.0, "right": 1.0},
        )
        self.assertNotIn("odd_rule", rules)
        self.assertTrue(any("grayscale" in item["requirement_text"].lower() for item in assist))
        self.assertEqual(conflicts, [])

    def test_harvest_visual_stays_assist_only(self):
        text = (
            "Every figure should have a figure description unless decorative. "
            "Figures should remain usable when printed in grayscale."
        )
        items = harvest_assist_items_from_guide(text)
        ids = {item["id"] for item in items}
        self.assertIn("assist_figure_alt_text", ids)
        self.assertIn("assist_figure_grayscale_usable", ids)
        normalized = normalize_mechanics_rules({"assist_items": items})
        self.assertNotIn("assist_items", normalized)


class TemplateExtractGuardTests(unittest.TestCase):
    def test_ieee_venue_does_not_set_citation_style(self):
        guide = (
            "Author guidelines / manuscript template.\n"
            "Sample reference: Smith, IEEE 802.11 wireless networks, IEEE Transactions on X, 2020.\n"
            "Margins: 1 inch on all sides.\n"
        )
        rules = derive_mechanics_rules(guide)
        guarded = apply_template_extract_guards(rules, guide, [])
        self.assertNotIn("citation_style", guarded)

    def test_explicit_citation_style_is_kept(self):
        guide = "Citation style: APA. Margins: 1 inch on all sides."
        rules = derive_mechanics_rules(guide)
        guarded = apply_template_extract_guards(rules, guide, [])
        self.assertEqual(guarded.get("citation_style"), "APA")

    def test_embodied_para_justify_beats_narrative_left(self):
        guide = "Flush left for display formulas. Alignment: left."
        paragraphs = [
            {
                "style": "Para",
                "formatting": {"alignment": "justify"},
                "text": "Body paragraph " + str(i),
            }
            for i in range(8)
        ]
        rules = {"alignment": "left", "citation_style": "IEEE"}
        guarded = apply_template_extract_guards(rules, guide, paragraphs)
        self.assertEqual(guarded.get("alignment"), "justify")
        self.assertNotIn("citation_style", guarded)

    def test_assist_findings_never_silent_when_items_exist(self):
        items = [
            {
                "id": "assist_figure_alt_text",
                "kind": "image",
                "requirement_text": "Provide alt-text for figures",
                "assist_required": True,
            }
        ]
        with patch("app.mechanics_gemini._gemini_ready", return_value=False):
            findings = assist_visual_mechanics(items, {"text": "Figure 1: x"}, {})
        self.assertGreaterEqual(len(findings), 1)
        self.assertEqual(findings[0]["status"], "unavailable")


if __name__ == "__main__":
    unittest.main()
