import unittest
from pathlib import Path

from test_compliance_pipeline import FirebaseTestCase

from app import compliance_db
from app.compliance import run_compliance_scan

API_SCORING = Path(__file__).resolve().parents[1] / "app" / "scoring.py"
ML_SCORING = Path(__file__).resolve().parents[2] / "machinelearning" / "app" / "scoring.py"

LONG = "This body sentence is long enough to count as a measured line of prose text"
RULES = {
    "font": {"families": ["Times New Roman"], "sizes_points": [12]},
    "margins_inches": {"top": 1, "bottom": 1, "left": 1, "right": 1},
    "alignment": "justify",
}


def parsed_doc(font="Times New Roman", paragraphs=3):
    items = []
    for index in range(paragraphs):
        text = " ".join([LONG] * 3)
        items.append({
            "paragraph_index": index,
            "style": "Normal",
            "text": text,
            "lines": [{"line_index": index * 3 + k, "text": LONG} for k in range(3)],
            "runs": [{"text": text, "font": font, "size": 12}],
            "formatting": {"line_spacing": 2.0, "alignment": "justify", "first_line_indent_inches": 0.5},
        })
    return {
        "text": "\n".join(item["text"] for item in items),
        "metadata": {"format": "docx"},
        "paragraphs": items,
        "sections": [{
            "page_width_inches": 8.5, "page_height_inches": 11,
            "top_margin_inches": 1, "bottom_margin_inches": 1,
            "left_margin_inches": 1, "right_margin_inches": 1,
        }],
    }


class SharedScoringModuleTests(unittest.TestCase):
    @unittest.skipUnless(ML_SCORING.exists(), "machinelearning service is not checked out")
    def test_api_and_ml_service_use_identical_scoring_code(self):
        self.assertEqual(API_SCORING.read_bytes(), ML_SCORING.read_bytes())

    def test_fallback_analyzer_returns_the_full_scoring_payload(self):
        result = run_compliance_scan(parsed_doc(font="Arial"), RULES, "free")
        scoring = result["scoring"]
        self.assertTrue(scoring["consistency"]["ok"], scoring["consistency"]["errors"])
        self.assertEqual(result["units_checked"], result["units_passed"] + result["units_failed"])
        self.assertAlmostEqual(result["right_pct"] + result["wrong_pct"], 100.0, places=9)
        fonts = next(item for item in result["sections"] if item["section"] == "Fonts")
        self.assertEqual(fonts["status"], "fail")
        self.assertEqual(fonts["formatting_score"], 0.0)
        spacing = next(item for item in result["sections"] if item["section"] == "Spacing")
        self.assertEqual(spacing["status"], "not_applicable")
        self.assertIsNone(spacing["formatting_score"])


class ScanIsolationTests(FirebaseTestCase):
    def setup_user(self, uid, title="Paper"):
        mechanics = compliance_db.create_mechanics(
            uid, "Guide", "guide.docx", "docx", "Use Times New Roman.", parsed_doc(), RULES,
        )
        version, _ = compliance_db.create_version(
            uid, title, mechanics["id"], "paper.docx", "docx", "text", parsed_doc(), None,
        )
        return mechanics, version

    def persist(self, uid, mechanics, version, parsed):
        result = run_compliance_scan(parsed, RULES, "free")
        extra = {key: result[key] for key in compliance_db.SCAN_RESULT_FIELDS if key in result}
        return result, compliance_db.persist_scan(
            uid, version["manuscript_id"], version["id"], mechanics["id"],
            result["overall_score"], result["issues"], result["sections"], extra=extra,
        )

    def test_stored_scan_matches_analyzer_without_rounding(self):
        mechanics, version = self.setup_user("alice")
        paragraphs = parsed_doc()
        paragraphs["paragraphs"][0]["runs"][0]["font"] = "Arial"
        result, scan = self.persist("alice", mechanics, version, paragraphs)
        stored = compliance_db.get_scan("alice", scan["id"])
        self.assertEqual(stored["scoring"], result["scoring"])
        self.assertEqual(stored["right_pct"], result["right_pct"])
        self.assertEqual(stored["overall_score"], result["overall_score"])
        self.assertEqual(stored["units_passed"], result["units_passed"])
        self.assertEqual(
            [row.get("units_checked") for row in stored["sections"]],
            [row["units_checked"] for row in result["sections"]],
        )
        spacing = next(row for row in stored["sections"] if row["section"] == "Spacing")
        self.assertIsNone(spacing["formatting_score"])
        self.assertEqual(spacing["status"], "not_applicable")

    def test_users_versions_and_reanalysis_are_independent(self):
        a_mech, a_v1 = self.setup_user("alice")
        b_mech, b_v1 = self.setup_user("bob")
        _, first = self.persist("alice", a_mech, a_v1, parsed_doc(font="Arial"))
        _, again = self.persist("alice", a_mech, a_v1, parsed_doc(font="Arial"))
        _, bob = self.persist("bob", b_mech, b_v1, parsed_doc())
        a_v2, _ = compliance_db.create_version(
            "alice", "Paper", a_mech["id"], "paper.docx", "docx", "text", parsed_doc(), a_v1["manuscript_id"],
        )
        _, second_version = self.persist("alice", a_mech, a_v2, parsed_doc())

        self.assertNotEqual(first["id"], again["id"])
        self.assertEqual(first["scoring"], again["scoring"])
        self.assertEqual(first["units_failed"], again["units_failed"])
        self.assertIsNone(compliance_db.get_scan("bob", first["id"]))
        self.assertEqual(bob["units_failed"], 0)
        self.assertEqual(second_version["manuscript_version_id"], a_v2["id"])
        self.assertEqual(second_version["units_failed"], 0)
        self.assertGreater(compliance_db.get_scan("alice", first["id"])["units_failed"], 0)

    def test_ml_result_is_stored_with_null_score_when_nothing_was_measured(self):
        mechanics, version = self.setup_user("carol")
        pending = compliance_db.create_pending_scan("carol", version["manuscript_id"], version["id"], mechanics["id"])
        empty = run_compliance_scan({"text": "", "metadata": {"format": "pdf"}, "pages": []}, RULES, "free")
        done = compliance_db.finalize_scan_from_ml("carol", pending["id"], empty)
        self.assertEqual(done["status"], "done")
        self.assertIsNone(done["overall_score"])
        self.assertEqual(done["scoring"]["overall"]["status"], "not_evaluated")
        repeat = compliance_db.finalize_scan_from_ml("carol", pending["id"], run_compliance_scan(parsed_doc(), RULES))
        self.assertEqual(repeat["scoring"], done["scoring"])


if __name__ == "__main__":
    unittest.main()
