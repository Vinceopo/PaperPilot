import copy
import unittest
from unittest.mock import patch

from app import compliance_db, otp, profiles
from app.compliance import run_compliance_scan
from app.documents import DocumentError, derive_mechanics_rules, validate_document


class FakeReference:
    def __init__(self, store, path="/"):
        self.store = store
        self.parts = [part for part in path.split("/") if part]

    def _parent(self, create=False):
        node = self.store
        for part in self.parts[:-1]:
            if create:
                node = node.setdefault(part, {})
            else:
                node = node.get(part, {})
        return node

    def get(self):
        node = self.store
        for part in self.parts:
            if not isinstance(node, dict) or part not in node:
                return None
            node = node[part]
        return copy.deepcopy(node)

    def set(self, value):
        if not self.parts:
            self.store.clear()
            if isinstance(value, dict):
                self.store.update(copy.deepcopy(value))
            return
        parent = self._parent(create=True)
        parent[self.parts[-1]] = copy.deepcopy(value)

    def delete(self):
        if self.parts:
            self._parent().pop(self.parts[-1], None)

    def update(self, updates):
        for relative, value in updates.items():
            path = "/" + "/".join([*self.parts, *relative.split("/")])
            ref = FakeReference(self.store, path)
            ref.delete() if value is None else ref.set(value)

    def transaction(self, callback):
        current = self.get()
        updated = callback(current)
        if updated is None:
            self.delete()
        else:
            self.set(updated)
        return copy.deepcopy(updated)


class FirebaseTestCase(unittest.TestCase):
    def setUp(self):
        self.store = {}
        factory = lambda path: FakeReference(self.store, path)
        self.patchers = [
            patch.object(compliance_db, "_reference", side_effect=factory),
            patch.object(otp, "_reference", side_effect=factory),
            patch.object(profiles, "_reference", side_effect=factory),
        ]
        for patcher in self.patchers:
            patcher.start()
        otp._secret_cache = None
        self.old_secret = otp.settings.otp_secret
        otp.settings.otp_secret = "unit-test-secret"

    def tearDown(self):
        otp.settings.otp_secret = self.old_secret
        otp._secret_cache = None
        for patcher in reversed(self.patchers):
            patcher.stop()


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
            "pages": [{
                "page_index": 1,
                "width_points": 612,
                "height_points": 792,
                "lines": [{
                    "line_index": 4,
                    "text": "Example line",
                    "spans": [{"text": "Example line", "font": "Arial", "size": 12, "bold": False}],
                }],
            }],
        }
        result = run_compliance_scan(
            parsed, {"font": {"families": ["Times New Roman"], "sizes_points": [12]}}, "free"
        )
        self.assertEqual(result["issues"][0]["severity"], "critical")
        self.assertEqual(
            result["issues"][0]["locations"],
            [{"page": 2, "line": 5, "section": "General"}],
        )


class PersistenceTests(FirebaseTestCase):
    def parsed(self):
        return {
            "text": "Example manuscript text.",
            "metadata": {"format": "docx", "pagination_fidelity": "explicit_breaks_only_no_static_layout"},
            "paragraphs": [],
            "sections": [],
        }

    def mechanics(self, name="Guide"):
        parsed = self.parsed()
        return compliance_db.create_mechanics(
            "owner", name, "guide.docx", "docx", "Use Arial.", parsed,
            {"font": {"families": ["Arial"]}},
        )

    def test_relationships_and_transactional_scan_usage(self):
        parsed = self.parsed()
        mechanics = self.mechanics()
        version, created_parent = compliance_db.create_version(
            "owner", "Paper", mechanics["id"], "paper.docx", "docx",
            parsed["text"], parsed, None,
        )
        self.assertTrue(created_parent)
        with self.assertRaises(LookupError):
            compliance_db.persist_scan(
                "owner", version["manuscript_id"], "missing", mechanics["id"],
                100.0, [], [],
            )
        self.assertEqual(compliance_db.subscription_snapshot("owner")["used"], 0)
        scan = compliance_db.persist_scan(
            "owner", version["manuscript_id"], version["id"], mechanics["id"], 100.0, [],
            [{"section": "General", "formatting_score": 100.0, "issue_count": 0, "issues": []}],
        )
        self.assertEqual(scan["manuscript_version_id"], version["id"])
        self.assertEqual(compliance_db.subscription_snapshot("owner")["used"], 1)

    def test_mechanics_names_are_unique_and_rename_persists_filename(self):
        first = self.mechanics("Graduate Guide")
        with self.assertRaises(compliance_db.MechanicsNameConflict):
            self.mechanics("graduate guide")
        renamed = compliance_db.rename_mechanics("owner", first["id"], "Thesis Guide")
        self.assertEqual(renamed["source_filename"], "Thesis Guide.docx")
        self.assertEqual(
            compliance_db.list_mechanics("owner")[0]["source_filename"],
            "Thesis Guide.docx",
        )
        self.assertTrue(compliance_db.delete_mechanics("owner", first["id"]))

    def test_mechanics_used_by_version_can_still_be_deleted(self):
        parsed, mechanics = self.parsed(), self.mechanics()
        version, _ = compliance_db.create_version(
            "owner", "Paper", mechanics["id"], "paper.docx", "docx", "Text", parsed, None
        )
        self.assertEqual(
            compliance_db.get_version("owner", version["manuscript_id"], version["id"])["mechanics_id"],
            mechanics["id"],
        )
        # Deletion is now always allowed regardless of whether the mechanics is in use.
        self.assertTrue(compliance_db.delete_mechanics("owner", mechanics["id"]))

    def test_username_reservation_is_case_insensitive(self):
        self.assertTrue(profiles.reserve_username("Pilot.User", "one"))
        self.assertTrue(profiles.username_taken("pilot.user"))
        self.assertFalse(profiles.reserve_username("PILOT.USER", "two"))


class OtpTests(FirebaseTestCase):
    def test_new_code_invalidates_old_and_challenge_is_single_use(self):
        with patch.object(otp.time, "time", return_value=1000):
            otp.store_otp("USER@example.com", "verify_email", "111111")
        with patch.object(otp.time, "time", return_value=1061):
            otp.store_otp("user@example.com", "verify_email", "222222")
            with self.assertRaisesRegex(ValueError, "Incorrect code"):
                otp.verify_otp("user@example.com", "verify_email", "111111")
            token = otp.verify_otp("user@example.com", "verify_email", "222222")
            otp.consume_challenge(token, "USER@example.com", "verify_email")
            with self.assertRaisesRegex(ValueError, "Verification expired"):
                otp.consume_challenge(token, "user@example.com", "verify_email")

    def test_attempt_limit_removes_challenge(self):
        with patch.object(otp.time, "time", return_value=2000):
            otp.store_otp("user@example.com", "reset_password", "123456")
            for remaining in (4, 3, 2, 1):
                with self.assertRaisesRegex(ValueError, f"{remaining} attempt"):
                    otp.verify_otp("user@example.com", "reset_password", "000000")
            with self.assertRaisesRegex(ValueError, "Too many incorrect attempts"):
                otp.verify_otp("user@example.com", "reset_password", "000000")
            with self.assertRaisesRegex(ValueError, "No active code"):
                otp.verify_otp("user@example.com", "reset_password", "123456")


if __name__ == "__main__":
    unittest.main()
