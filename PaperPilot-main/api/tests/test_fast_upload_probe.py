"""Create-time probe must stay fast and Analyse must re-parse deferred stubs."""

from __future__ import annotations

import unittest

import fitz

from app.documents import DocumentError, is_deferred_parse, parse_document, probe_document, validate_document


def _pdf_with_text(text: str = "Hello manuscript body text for probe.") -> bytes:
    document = fitz.open()
    page = document.new_page()
    page.insert_text((72, 72), text)
    data = document.tobytes()
    document.close()
    return data


class FastUploadProbeTests(unittest.TestCase):
    def test_probe_marks_deferred_and_keeps_text_sample(self):
        data = _pdf_with_text()
        file_type = validate_document("paper.pdf", data, 50_000_000)
        probed = probe_document(data, file_type)
        self.assertTrue(is_deferred_parse(probed))
        self.assertIn("Hello manuscript", probed["text"])
        self.assertEqual(probed["pages"], [])
        self.assertEqual(probed["metadata"]["parse_status"], "deferred")
        self.assertGreaterEqual(probed["metadata"]["page_count"], 1)

    def test_full_parse_is_not_deferred(self):
        data = _pdf_with_text()
        file_type = validate_document("paper.pdf", data, 50_000_000)
        parsed = parse_document(data, file_type)
        self.assertFalse(is_deferred_parse(parsed))
        self.assertTrue(parsed.get("pages"))

    def test_blank_pdf_probe_has_no_text(self):
        document = fitz.open()
        document.new_page()
        data = document.tobytes()
        document.close()
        probed = probe_document(data, "pdf")
        self.assertTrue(is_deferred_parse(probed))
        self.assertEqual((probed.get("text") or "").strip(), "")

    def test_password_pdf_is_rejected(self):
        document = fitz.open()
        document.new_page()
        document.authenticate("")  # ensure empty owner/user path for encrypt API
        # PyMuPDF encrypt: set a user password so needs_pass is true on reopen.
        data = document.tobytes(
            encryption=fitz.PDF_ENCRYPT_AES_256,
            user_pw="secret",
            owner_pw="owner-secret",
        )
        document.close()
        with self.assertRaises(DocumentError):
            probe_document(data, "pdf")


if __name__ == "__main__":
    unittest.main()
