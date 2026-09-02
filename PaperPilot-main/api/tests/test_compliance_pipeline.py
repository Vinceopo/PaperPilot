import tempfile
import unittest
from pathlib import Path

from app import compliance_db
from app.compliance import run_compliance_scan
from app.documents import DocumentError, derive_mechanics_rules, validate_document


class MechanicsExtractionTests(unittest.TestCase):
    def test_extracts_only_present_rules(self):
        rules = derive_mechanics_rules(
            "Use Times New Roman at 12 pt. Pages must use letter paper with 1 inch margins. "
            "Use double line spacing and APA citation style."
        )
        self.assertEqual(rules["font"]["families"], ["Times New Roman"])
        self.assertEqual(rules["font"]["sizes_points"], [12.0])
        self.assertEqual(rules["paper_size"]["name"], "LETTER")
        self.assertEqual(rules["line_spacing"], 2.0)
        self.assertEqual(rules["citation_style"], "APA")
        self.assertNotIn("first_line_indent_inches", rules)

    def test_rejects_extension_signature_mismatch(self):
        with self.assertRaises(DocumentError):
            validate_document("paper.pdf", b"not a pdf", 100)

    def test_wrong_font_is_grouped_as_critical(self):
        parsed = {
            "text": "Example line",
            "metadata": {"format": "pdf", "pagination_fidelity": "fixed_source_pages"},
            "pages": [
                {
                    "page_index": 1,
                    "width_points": 612,
                    "height_points": 792,
                    "lines": [
                        {
                            "line_index": 4,
                            "text": "Example line",
                            "spans": [{"text": "Example line", "font": "Arial", "size": 12, "bold": False}],
                        }
                    ],
                }
            ],
        }
        result = run_compliance_scan(
            parsed, {"font": {"families": ["Times New Roman"], "sizes_points": [12]}}, "free"
        )
        self.assertEqual(result["issues"][0]["severity"], "critical")
        self.assertEqual(result["issues"][0]["locations"], [{"page": 2, "line": 5, "section": "General"}])


class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_path = compliance_db.DB_PATH
        compliance_db.DB_PATH = Path(self.temp_dir.name) / "paperpilot.db"
        compliance_db.init_db()

    def tearDown(self):
        compliance_db.DB_PATH = self.original_path
        self.temp_dir.cleanup()

    def test_relationships_and_transactional_scan_usage(self):
        parsed = {
            "text": "Example manuscript text.",
            "metadata": {"format": "docx", "pagination_fidelity": "explicit_breaks_only_no_static_layout"},
            "paragraphs": [],
            "sections": [],
        }
        mechanics = compliance_db.create_mechanics(
            "owner", "Guide", "guide.docx", "docx", "Use Arial.", parsed, {"font": {"families": ["Arial"]}}
        )
        version, created_parent = compliance_db.create_version(
            "owner", "Paper", mechanics["id"], "paper.docx", "docx", parsed["text"], parsed, None
        )
        self.assertTrue(created_parent)
        scan = compliance_db.persist_scan(
            "owner", version["manuscript_id"], version["id"], mechanics["id"], 100.0, [],
            [{"section": "General", "formatting_score": 100.0, "issue_count": 0, "issues": []}],
        )
        self.assertEqual(scan["manuscript_version_id"], version["id"])
        self.assertEqual(compliance_db.subscription_snapshot("owner")["used"], 1)

    def test_mechanics_names_are_unique_case_insensitively(self):
        parsed = {
            "text": "Use Arial.",
            "metadata": {"format": "docx"},
            "paragraphs": [],
            "sections": [],
        }
        first = compliance_db.create_mechanics(
            "owner", "Graduate Guide", "guide.docx", "docx", parsed["text"], parsed, {}
        )
        with self.assertRaises(compliance_db.MechanicsNameConflict):
            compliance_db.create_mechanics(
                "owner", "graduate guide", "other.docx", "docx", parsed["text"], parsed, {}
            )
        renamed = compliance_db.rename_mechanics("owner", first["id"], "Thesis Guide")
        self.assertEqual(renamed["name"], "Thesis Guide")
        self.assertEqual(renamed["source_filename"], "Thesis Guide.docx")
        self.assertEqual(
            compliance_db.list_mechanics("owner")[0]["source_filename"],
            "Thesis Guide.docx",
        )
        self.assertTrue(compliance_db.delete_mechanics("owner", first["id"]))

    def test_mechanics_used_by_a_version_cannot_be_deleted(self):
        parsed = {
            "text": "Use Arial.",
            "metadata": {"format": "docx"},
            "paragraphs": [],
            "sections": [],
        }
        mechanics = compliance_db.create_mechanics(
            "owner", "Guide", "guide.docx", "docx", parsed["text"], parsed, {}
        )
        compliance_db.create_version(
            "owner", "Paper", mechanics["id"], "paper.docx", "docx", "Text", parsed, None
        )
        with self.assertRaises(compliance_db.MechanicsInUse):
            compliance_db.delete_mechanics("owner", mechanics["id"])


if __name__ == "__main__":
    unittest.main()
