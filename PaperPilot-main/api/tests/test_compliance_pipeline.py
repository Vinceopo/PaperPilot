import copy
import unittest
from unittest.mock import patch

from app import compliance_db, otp, profiles
from app.compliance import run_compliance_scan
from app.documents import DocumentError, derive_mechanics_rules, parse_document, validate_document


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
            [{"page": 2, "line": 1, "section": "Fonts"}],
        )
        self.assertEqual([item["section"] for item in result["sections"]], [
            "Fonts", "Margins", "Indentation", "Spacing", "Alignment",
        ])
        fonts = next(item for item in result["sections"] if item["section"] == "Fonts")
        self.assertEqual(fonts["formatting_score"], 0)
        self.assertEqual(result["overall_score"], fonts["formatting_score"])

    def test_overall_score_averages_checked_breakdown_metrics(self):
        parsed = {
            "text": "Line one\nLine two",
            "metadata": {"format": "pdf", "pagination_fidelity": "fixed_source_pages"},
            "pages": [{
                "page_index": 0,
                "width_points": 612,
                "height_points": 792,
                "lines": [
                    {
                        "line_index": 0,
                        "text": "Line one uses Arial here",
                        "spans": [{"text": "Line one uses Arial here", "font": "Arial", "size": 12, "bold": False}],
                        "bbox": [72, 72, 500, 86],
                    },
                    {
                        "line_index": 1,
                        "text": "Line two uses Times New Roman",
                        "spans": [{"text": "Line two uses Times New Roman", "font": "TimesNewRoman", "size": 12, "bold": False}],
                        "bbox": [72, 90, 500, 104],
                    },
                ],
            }],
        }
        result = run_compliance_scan(
            parsed,
            {
                "font": {"families": ["Times New Roman"], "sizes_points": [12]},
                "margins_inches": {"top": 1, "bottom": 1, "left": 1, "right": 1},
            },
            "free",
        )
        scores = {item["section"]: item["formatting_score"] for item in result["sections"]}
        self.assertEqual(scores["Fonts"], 50)
        self.assertEqual(scores["Margins"], 100)
        self.assertEqual(result["overall_score"], 75.0)
        self.assertEqual(result["issues"][0]["locations"][0]["page"], 1)
        self.assertEqual(result["issues"][0]["locations"][0]["line"], 1)
        self.assertEqual(result["page_count"], 1)

    def test_docx_line_numbers_restart_each_page(self):
        paragraphs = []
        for index in range(45):
            paragraphs.append({
                "paragraph_index": index,
                "style": "Normal",
                "text": f"Body paragraph number {index + 1} with enough words.",
                "lines": [{"line_index": index, "text": f"Body paragraph number {index + 1} with enough words."}],
                "runs": [{"text": f"Body paragraph number {index + 1} with enough words.", "font": "Arial", "size": 11}],
                "formatting": {"line_spacing": 1.5, "alignment": "left", "first_line_indent_inches": 0.0},
            })
        parsed = {
            "text": "\n".join(item["text"] for item in paragraphs),
            "metadata": {"format": "docx"},
            "paragraphs": paragraphs,
            "sections": [{
                "section_index": 0,
                "page_width_inches": 8.5,
                "page_height_inches": 11.0,
                "top_margin_inches": 1.0,
                "bottom_margin_inches": 1.0,
                "left_margin_inches": 1.0,
                "right_margin_inches": 1.0,
            }],
        }
        result = run_compliance_scan(
            parsed,
            {"font": {"families": ["Times New Roman"], "sizes_points": [11]}, "line_spacing": 1.5},
            "free",
        )
        locations = result["issues"][0]["locations"]
        self.assertGreater(result["page_count"], 1)
        self.assertEqual(locations[0]["page"], 1)
        self.assertEqual(locations[0]["line"], 1)
        page_two = [loc for loc in locations if loc["page"] == 2]
        self.assertTrue(page_two)
        self.assertEqual(min(loc["line"] for loc in page_two), 1)

    def test_heading_and_body_use_distinct_mechanics_sizes(self):
        parsed = {
            "text": "CHAPTER 1 INTRODUCTION\nThis body paragraph is written in eleven point text for the study.",
            "metadata": {"format": "pdf", "pagination_fidelity": "fixed_source_pages"},
            "pages": [{
                "page_index": 0,
                "width_points": 612,
                "height_points": 792,
                "lines": [
                    {
                        "line_index": 0,
                        "text": "CHAPTER 1 INTRODUCTION",
                        "spans": [{"text": "CHAPTER 1 INTRODUCTION", "font": "TimesNewRoman", "size": 14, "bold": True}],
                    },
                    {
                        "line_index": 1,
                        "text": "This body paragraph is written in eleven point text for the study.",
                        "spans": [{"text": "This body paragraph is written in eleven point text for the study.", "font": "TimesNewRoman", "size": 14, "bold": False}],
                    },
                ],
            }],
        }
        result = run_compliance_scan(
            parsed,
            {
                "font": {
                    "families": ["Times New Roman"],
                    "heading1_size": 14,
                    "heading2_size": 12,
                    "heading3_content_size": 11,
                    "sizes_points": [14, 12, 11],
                }
            },
            "free",
        )
        size_issues = [issue for issue in result["issues"] if issue["issue_type"] == "font_size"]
        self.assertTrue(size_issues)
        self.assertEqual(size_issues[0]["locations"][0]["line"], 2)

    def test_segoe_ui_emoji_does_not_override_times_new_roman(self):
        parsed = {
            "text": "This paragraph is Times New Roman with an emoji glyph nearby.",
            "metadata": {"format": "docx"},
            "paragraphs": [{
                "paragraph_index": 0,
                "source": "body",
                "style": "Normal",
                "text": "This paragraph is Times New Roman with an emoji glyph nearby.",
                "lines": [{
                    "line_index": 0,
                    "text": "This paragraph is Times New Roman with an emoji glyph nearby.",
                }],
                "runs": [
                    {"text": "✅", "font": "Segoe UI Emoji", "size": 11},
                    {
                        "text": "This paragraph is Times New Roman with an emoji glyph nearby.",
                        "font": "Times New Roman",
                        "size": 11,
                    },
                ],
                "formatting": {"line_spacing": 1.5, "alignment": "left"},
            }],
            "sections": [{
                "section_index": 0,
                "page_width_inches": 8.5,
                "page_height_inches": 11.0,
                "top_margin_inches": 1.0,
                "bottom_margin_inches": 1.0,
                "left_margin_inches": 1.0,
                "right_margin_inches": 1.0,
            }],
        }
        result = run_compliance_scan(
            parsed,
            {"font": {"families": ["Times New Roman"], "sizes_points": [11]}},
            "free",
        )
        family_issues = [issue for issue in result["issues"] if issue["issue_type"] == "font_family"]
        self.assertEqual(family_issues, [])
        scores = {item["section"]: item["formatting_score"] for item in result["sections"]}
        self.assertEqual(scores["Fonts"], 100.0)

    def test_visual_typeable_lines_wrap_and_restart_each_page(self):
        from app.compliance import _document_units, _soft_wrap_visual_lines

        wrapped = _soft_wrap_visual_lines(
            "This is a long academic sentence that should wrap across multiple typeable lines on the manuscript page.",
            40,
        )
        self.assertGreater(len(wrapped), 1)
        self.assertTrue(all(len(line) <= 40 for line in wrapped))

        long_text = (
            "This chapter explains the complete methodology of the study including participants instruments "
            "procedures and the statistical treatment of data for the BSIT manuscript format compliance tool."
        )
        paragraphs = []
        for index in range(8):
            paragraphs.append({
                "paragraph_index": index,
                "source": "body",
                "style": "Normal",
                "text": long_text,
                "lines": [{"line_index": index, "text": long_text}],
                "runs": [{"text": long_text, "font": "Times New Roman", "size": 11}],
                "formatting": {"line_spacing": 1.5, "alignment": "left"},
            })
        parsed = {
            "text": "\n".join(p["text"] for p in paragraphs),
            "metadata": {"format": "docx"},
            "paragraphs": paragraphs,
            "sections": [{
                "section_index": 0,
                "page_width_inches": 8.5,
                "page_height_inches": 11.0,
                "top_margin_inches": 1.0,
                "bottom_margin_inches": 1.0,
                "left_margin_inches": 1.0,
                "right_margin_inches": 1.0,
            }],
        }
        rules = {
            "font": {"families": ["Times New Roman"], "heading3_content_size": 11, "sizes_points": [11]},
            "line_spacing": 1.5,
            "margins_inches": {"top": 1, "bottom": 1, "left": 1, "right": 1},
        }
        units = _document_units(parsed, rules)
        self.assertGreater(len(units), 8)  # wrapped into more visual lines than paragraphs
        by_page = {}
        for unit in units:
            if (unit.get("source") or "body") in {"header", "footer"}:
                continue
            by_page.setdefault(unit["page_index"], []).append(unit["line_index"])
        self.assertIn(0, by_page)
        self.assertEqual(min(by_page[0]), 0)  # page line 1 in UI
        if 1 in by_page:
            self.assertEqual(min(by_page[1]), 0)  # restarts on page 2
            self.assertEqual(sorted(by_page[1]), list(range(len(by_page[1]))))

    def test_blank_line_does_not_inherit_neighbor_font_size(self):
        """Empty typeable lines must not be flagged using another paragraph’s 12pt runs."""
        parsed = {
            "text": "TITLE LINE ONE\n\nA Research Proposal",
            "metadata": {"format": "docx"},
            "paragraphs": [
                {
                    "paragraph_index": 0,
                    "source": "body",
                    "style": "Normal",
                    "text": "TITLE LINE ONE",
                    "lines": [{"line_index": 0, "text": "TITLE LINE ONE"}],
                    "runs": [{"text": "TITLE LINE ONE", "font": "Times New Roman", "size": 12, "bold": True}],
                    "formatting": {
                        "line_spacing": 1.5,
                        "alignment": "center",
                        "space_after_points": 36,
                    },
                },
                {
                    "paragraph_index": 1,
                    "source": "body",
                    "style": "Normal",
                    "text": "",
                    "lines": [{"line_index": 1, "text": ""}],
                    "runs": [{"text": "", "font": "Times New Roman", "size": 11}],
                    "formatting": {"line_spacing": 1.5, "alignment": "center"},
                },
                {
                    "paragraph_index": 2,
                    "source": "body",
                    "style": "Normal",
                    "text": "A Research Proposal",
                    "lines": [{"line_index": 2, "text": "A Research Proposal"}],
                    "runs": [{"text": "A Research Proposal", "font": "Times New Roman", "size": 11}],
                    "formatting": {"line_spacing": 1.5, "alignment": "center"},
                },
            ],
            "sections": [{
                "section_index": 0,
                "page_width_inches": 8.5,
                "page_height_inches": 11.0,
                "top_margin_inches": 1.0,
                "bottom_margin_inches": 1.0,
                "left_margin_inches": 1.0,
                "right_margin_inches": 1.0,
            }],
        }
        result = run_compliance_scan(
            parsed,
            {
                "font": {
                    "families": ["Times New Roman"],
                    "heading1_size": 12,
                    "heading2_size": 12,
                    "heading3_content_size": 11,
                    "sizes_points": [12, 11],
                }
            },
            "free",
        )
        # No font_size issue should claim an empty line measured 12pt.
        for issue in result["issues"]:
            if issue["issue_type"] != "font_size":
                continue
            self.assertNotIn("Measured 12", issue["explanation"].replace("12.0", "12"))

    def test_correct_docx_margins_score_100(self):
        parsed = {
            "text": "Body paragraph with enough words for scanning.",
            "metadata": {"format": "docx"},
            "paragraphs": [{
                "paragraph_index": 0,
                "source": "body",
                "style": "Normal",
                "text": "Body paragraph with enough words for scanning.",
                "lines": [{"line_index": 0, "text": "Body paragraph with enough words for scanning."}],
                "runs": [{"text": "Body paragraph with enough words for scanning.", "font": "Times New Roman", "size": 11}],
                "formatting": {"line_spacing": 1.5, "alignment": "left"},
            }],
            "sections": [{
                "section_index": 0,
                "page_width_inches": 8.5,
                "page_height_inches": 11.0,
                "top_margin_inches": 1.0,
                "bottom_margin_inches": 1.0,
                "left_margin_inches": 1.0,
                "right_margin_inches": 1.0,
            }],
        }
        result = run_compliance_scan(
            parsed,
            {
                "font": {"families": ["Times New Roman"], "sizes_points": [11]},
                "margins_inches": {"top": 1, "bottom": 1, "left": 1, "right": 1},
                "paper_size": {"name": "LETTER", "width_inches": 8.5, "height_inches": 11.0},
            },
            "free",
        )
        scores = {item["section"]: item["formatting_score"] for item in result["sections"]}
        self.assertEqual(scores["Margins"], 100.0)
        self.assertFalse([i for i in result["issues"] if "margin" in i["issue_type"]])

    def test_one_wrong_margin_does_not_zero_score(self):
        parsed = {
            "text": "Body paragraph with enough words for scanning.",
            "metadata": {"format": "docx"},
            "paragraphs": [{
                "paragraph_index": 0,
                "source": "body",
                "style": "Normal",
                "text": "Body paragraph with enough words for scanning.",
                "lines": [{"line_index": 0, "text": "Body paragraph with enough words for scanning."}],
                "runs": [{"text": "Body paragraph with enough words for scanning.", "font": "Times New Roman", "size": 11}],
                "formatting": {"line_spacing": 1.5, "alignment": "left"},
            }],
            "sections": [{
                "section_index": 0,
                "page_width_inches": 8.5,
                "page_height_inches": 11.0,
                "top_margin_inches": 1.0,
                "bottom_margin_inches": 1.0,
                "left_margin_inches": 1.5,
                "right_margin_inches": 1.0,
            }],
        }
        result = run_compliance_scan(
            parsed,
            {"margins_inches": {"top": 1, "bottom": 1, "left": 1, "right": 1}},
            "free",
        )
        scores = {item["section"]: item["formatting_score"] for item in result["sections"]}
        self.assertEqual(scores["Margins"], 75.0)
        left = [i for i in result["issues"] if i["issue_type"] == "left_margin"]
        self.assertEqual(len(left), 1)
        self.assertEqual(left[0]["severity"], "moderate")
        self.assertIn("1.5", left[0]["explanation"])

    def test_paper_size_mismatch_does_not_zero_correct_margins(self):
        parsed = {
            "text": "Body text here.",
            "metadata": {"format": "docx"},
            "paragraphs": [{
                "paragraph_index": 0,
                "source": "body",
                "text": "Body text here with enough words.",
                "lines": [{"line_index": 0, "text": "Body text here with enough words."}],
                "runs": [{"text": "Body text here with enough words.", "font": "Times New Roman", "size": 11}],
                "formatting": {},
            }],
            "sections": [{
                "section_index": 0,
                "page_width_inches": 8.27,
                "page_height_inches": 11.69,
                "top_margin_inches": 1.0,
                "bottom_margin_inches": 1.0,
                "left_margin_inches": 1.0,
                "right_margin_inches": 1.0,
            }],
        }
        result = run_compliance_scan(
            parsed,
            {
                "margins_inches": {"top": 1, "bottom": 1, "left": 1, "right": 1},
                "paper_size": {"name": "LETTER", "width_inches": 8.5, "height_inches": 11.0},
            },
            "free",
        )
        scores = {item["section"]: item["formatting_score"] for item in result["sections"]}
        self.assertEqual(scores["Margins"], 100.0)
        self.assertTrue([i for i in result["issues"] if i["issue_type"] == "paper_size"])

    def test_pdf_page_number_does_not_fail_bottom_margin(self):
        parsed = {
            "text": "Body line\n42",
            "metadata": {"format": "pdf"},
            "pages": [{
                "page_index": 0,
                "width_points": 612,
                "height_points": 792,
                "lines": [
                    {
                        "line_index": 0,
                        "text": "This body line sits on a normal academic page with enough words.",
                        "spans": [{"text": "body", "font": "TimesNewRoman", "size": 11}],
                        "bbox": [72, 72, 540, 86],
                    },
                    {
                        "line_index": 1,
                        "text": "42",
                        "spans": [{"text": "42", "font": "TimesNewRoman", "size": 11}],
                        "bbox": [300, 760, 320, 774],
                    },
                ],
            }],
        }
        result = run_compliance_scan(
            parsed,
            {"margins_inches": {"top": 1, "bottom": 1, "left": 1, "right": 1}},
            "free",
        )
        scores = {item["section"]: item["formatting_score"] for item in result["sections"]}
        self.assertEqual(scores["Margins"], 100.0)

    def test_docx_tables_headers_and_all_pages_are_scanned(self):
        from io import BytesIO

        from docx import Document
        from docx.shared import Pt

        document = Document()
        document.add_paragraph("Opening body paragraph with enough words for the scan.")
        table = document.add_table(rows=1, cols=1)
        run = table.cell(0, 0).paragraphs[0].add_run("Table cell uses Arial throughout this cell.")
        run.font.name = "Arial"
        run.font.size = Pt(11)
        nested = table.cell(0, 0).add_table(rows=1, cols=1)
        nested_run = nested.cell(0, 0).paragraphs[0].add_run("Nested table cell also uses Arial text.")
        nested_run.font.name = "Arial"
        nested_run.font.size = Pt(11)
        document.sections[0].header.is_linked_to_previous = False
        header_run = document.sections[0].header.paragraphs[0].add_run("University header running title")
        header_run.font.name = "Times New Roman"
        document.sections[0].footer.is_linked_to_previous = False
        footer_para = document.sections[0].footer.paragraphs[0]
        for run in list(footer_para.runs):
            run.text = ""
        footer_run = footer_para.add_run("Footer running text line")
        footer_run.font.name = "Times New Roman"
        buffer = BytesIO()
        document.save(buffer)
        parsed = parse_document(buffer.getvalue(), "docx")
        sources = {paragraph["source"] for paragraph in parsed["paragraphs"]}
        self.assertIn("body", sources)
        self.assertIn("table", sources)
        self.assertIn("header", sources)
        self.assertIn("footer", sources)
        combined = " ".join(paragraph["text"] for paragraph in parsed["paragraphs"])
        self.assertIn("Table cell uses Arial", combined)
        self.assertIn("Nested table cell", combined)
        self.assertIn("University header", combined)

        result = run_compliance_scan(
            parsed,
            {"font": {"families": ["Times New Roman"], "sizes_points": [11]}},
            "free",
        )
        family_issues = [issue for issue in result["issues"] if issue["issue_type"] == "font_family"]
        self.assertTrue(family_issues)
        self.assertGreaterEqual(family_issues[0]["count"], 2)

    def test_scan_keeps_locations_across_the_whole_document(self):
        paragraphs = []
        for index in range(150):
            paragraphs.append({
                "paragraph_index": index,
                "source": "body",
                "style": "Normal",
                "text": f"Body paragraph number {index + 1} uses Arial on purpose.",
                "lines": [{"line_index": index, "text": f"Body paragraph number {index + 1} uses Arial on purpose."}],
                "runs": [{"text": f"Body paragraph number {index + 1} uses Arial on purpose.", "font": "Arial", "size": 11}],
                "formatting": {"line_spacing": 1.5, "alignment": "left"},
            })
        parsed = {
            "text": "\n".join(item["text"] for item in paragraphs),
            "metadata": {"format": "docx"},
            "paragraphs": paragraphs,
            "sections": [{
                "section_index": 0,
                "page_width_inches": 8.5,
                "page_height_inches": 11.0,
                "top_margin_inches": 1.0,
                "bottom_margin_inches": 1.0,
                "left_margin_inches": 1.0,
                "right_margin_inches": 1.0,
            }],
        }
        result = run_compliance_scan(
            parsed,
            {"font": {"families": ["Times New Roman"], "sizes_points": [11]}},
            "free",
        )
        locations = result["issues"][0]["locations"]
        self.assertGreaterEqual(len(locations), 150)
        self.assertGreaterEqual(result["issues"][0]["count"], 150)
        self.assertGreater(result["page_count"], 1)
        last_page = max(loc["page"] for loc in locations)
        self.assertEqual(last_page, result["page_count"])


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

    def test_deleted_mechanics_name_can_be_reused(self):
        first = self.mechanics("Format Guide")
        self.assertTrue(compliance_db.delete_mechanics("owner", first["id"]))
        self.assertEqual(compliance_db.list_mechanics("owner"), [])
        # Same display name must be allowed again after delete.
        second = self.mechanics("Format Guide")
        self.assertNotEqual(first["id"], second["id"])
        self.assertEqual(second["name"], "Format Guide")

    def test_same_title_upload_becomes_new_version(self):
        parsed, mechanics = self.parsed(), self.mechanics()
        first, created_first = compliance_db.create_version(
            "owner", "Thesis Draft", mechanics["id"], "a.docx", "docx", "Text", parsed, None
        )
        self.assertTrue(created_first)
        second, created_second = compliance_db.create_version(
            "owner", "thesis draft", mechanics["id"], "b.docx", "docx", "Text", parsed, None
        )
        self.assertFalse(created_second)
        self.assertEqual(first["manuscript_id"], second["manuscript_id"])
        self.assertEqual(first["version_number"], 1)
        self.assertEqual(second["version_number"], 2)

    def test_orphaned_mechanics_name_reservation_is_reclaimed(self):
        # Simulate a stale name index entry whose mechanics row is already gone.
        name_ref = compliance_db._reference(
            f"{compliance_db.ROOT}/mechanics_names/owner/{compliance_db._name_key('Orphan Guide')}"
        )
        name_ref.set("missing-mechanics-id")
        reclaimed = self.mechanics("Orphan Guide")
        self.assertEqual(reclaimed["name"], "Orphan Guide")
        self.assertEqual(name_ref.get(), reclaimed["id"])

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
        # And the name must be free for a fresh upload.
        again = self.mechanics()
        self.assertTrue(again["id"])

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
