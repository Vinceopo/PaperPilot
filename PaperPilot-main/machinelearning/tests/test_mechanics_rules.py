import io
import unittest

from docx import Document
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt

from app.compliance import (
    CategoryStats,
    IssueCollector,
    _observe_spacing,
    _page_token,
    _spacing_matches,
    run_compliance_scan,
)
from app.documents import normalize_mechanics_rules, parse_document

BODY = (
    "This study examines how students format their manuscripts and how a checker can help them. "
    "It describes the problem, the method, and the expected results in plain language for readers."
)


def _page_field(paragraph):
    field = OxmlElement("w:fldSimple")
    field.set(qn("w:instr"), "PAGE")
    run = OxmlElement("w:r")
    text = OxmlElement("w:t")
    text.text = "1"
    run.append(text)
    field.append(run)
    paragraph._p.append(field)


def _set_number_format(section, fmt=None, start=None):
    element = section._sectPr.find(qn("w:pgNumType"))
    if element is None:
        element = OxmlElement("w:pgNumType")
        section._sectPr.append(element)
    if fmt:
        element.set(qn("w:fmt"), fmt)
    # add_section() copies the previous section's settings, including its restart.
    element.attrib.pop(qn("w:start"), None)
    if start is not None:
        element.set(qn("w:start"), str(start))


def _number_header(section, where="header", align=WD_ALIGN_PARAGRAPH.RIGHT, first_page=None):
    """first_page: None = same as other pages, 'hidden', or ('footer', WD_ALIGN_PARAGRAPH.CENTER)."""
    part = section.header if where == "header" else section.footer
    part.is_linked_to_previous = False
    paragraph = part.paragraphs[0]
    paragraph.alignment = align
    _page_field(paragraph)
    if first_page is not None:
        section.different_first_page_header_footer = True
        section.first_page_header.is_linked_to_previous = False
        section.first_page_footer.is_linked_to_previous = False
        if first_page != "hidden":
            first_where, first_align = first_page
            first_part = section.first_page_header if first_where == "header" else section.first_page_footer
            first_paragraph = first_part.paragraphs[0]
            first_paragraph.alignment = first_align
            _page_field(first_paragraph)


def _body(doc, text=BODY, count=2):
    for _ in range(count):
        paragraph = doc.add_paragraph(text)
        paragraph.paragraph_format.first_line_indent = Inches(0.5)
        paragraph.paragraph_format.line_spacing = 2.0


def _page_break(doc):
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


def _heading(doc, text, bold=True):
    paragraph = doc.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = paragraph.add_run(text)
    run.bold = bold
    run.font.size = Pt(12)
    return paragraph


def _thesis(
    prelim_fmt="lowerRoman",
    body_start=1,
    title_first_page="hidden",
    chapter_first_page=("footer", WD_ALIGN_PARAGRAPH.CENTER),
    align=WD_ALIGN_PARAGRAPH.RIGHT,
):
    """Title page + 2 preliminary pages, then Chapter I (2 pages) and Chapter II, each chapter its own section."""
    doc = Document()
    _heading(doc, "A STUDY OF MANUSCRIPT FORMATTING")
    doc.add_paragraph("A thesis presented to the faculty")
    _page_break(doc)
    _heading(doc, "ABSTRACT")
    _body(doc)
    _page_break(doc)
    _heading(doc, "ACKNOWLEDGMENT")
    _body(doc)
    prelim = doc.sections[0]
    _number_header(prelim, align=align, first_page=title_first_page)
    if prelim_fmt:
        _set_number_format(prelim, fmt=prelim_fmt)

    body = doc.add_section(WD_SECTION.NEW_PAGE)
    _heading(doc, "CHAPTER I")
    _heading(doc, "INTRODUCTION")
    _body(doc)
    _page_break(doc)
    _body(doc)
    _number_header(body, align=align, first_page=chapter_first_page)
    _set_number_format(body, fmt="decimal", start=body_start)

    second = doc.add_section(WD_SECTION.NEW_PAGE)
    _heading(doc, "CHAPTER II")
    _body(doc)
    _number_header(second, align=align, first_page=chapter_first_page)
    _set_number_format(second, fmt="decimal")
    buffer = io.BytesIO()
    doc.save(buffer)
    return parse_document(buffer.getvalue(), "docx")


PAGINATION_RULES = {
    "pagination": {
        "position": "Top right",
        "title_page": "Hidden but counted",
        "first_page_of_chapter": "Bottom center",
        "preliminary_style": "Lowercase Roman (i, ii, iii)",
        "body_numbering": "Arabic, restart at 1 on Chapter 1",
        "chapter_markers": ["chapter_roman"],
    }
}


def _issue_types(result, prefix=""):
    return {issue["issue_type"] for issue in result["issues"] if issue["issue_type"].startswith(prefix)}


def _section(result, name):
    return next(item for item in result["sections"] if item["section"] == name)


class PaginationTests(unittest.TestCase):
    def scan(self, parsed, rules):
        return run_compliance_scan(parsed, normalize_mechanics_rules(rules))

    def test_section_start_counts_as_new_page(self):
        parsed = _thesis()
        sections = [paragraph.get("section_index") for paragraph in parsed["paragraphs"] if paragraph["source"] == "body"]
        self.assertEqual(sections[0], 0)
        self.assertEqual(sections[-1], 2)
        self.assertEqual(parsed["sections"][1]["page_number"]["start"], 1)
        self.assertIsNone(parsed["sections"][2]["page_number"]["start"])
        self.assertEqual(parsed["sections"][0]["page_number"]["format"], "roman_lower")
        from app.compliance import _document_units

        pages = {unit["page_index"] for unit in _document_units(parsed, {}) if unit["text"].startswith("CHAPTER")}
        self.assertEqual(pages, {3, 5})

    def test_compliant_thesis_has_no_pagination_issues(self):
        result = self.scan(_thesis(), PAGINATION_RULES)
        self.assertEqual(_issue_types(result, "pagination"), set())
        self.assertEqual(_section(result, "Pagination")["formatting_score"], 100.0)
        self.assertGreater(_section(result, "Pagination")["issue_count"], -1)

    def test_title_page_number_shown_is_flagged(self):
        result = self.scan(_thesis(title_first_page=None), PAGINATION_RULES)
        self.assertIn("pagination_title_page", _issue_types(result))

    def test_left_position_is_checked(self):
        rules = {"pagination": {**PAGINATION_RULES["pagination"], "position": "Top left"}}
        result = self.scan(_thesis(), rules)
        self.assertIn("pagination_position", _issue_types(result))
        compliant = self.scan(_thesis(align=WD_ALIGN_PARAGRAPH.LEFT), rules)
        self.assertNotIn("pagination_position", _issue_types(compliant))

    def test_arabic_preliminary_pages_flagged_when_roman_required(self):
        result = self.scan(_thesis(prelim_fmt="decimal"), PAGINATION_RULES)
        self.assertIn("pagination_style", _issue_types(result))

    def test_body_must_restart_at_one(self):
        result = self.scan(_thesis(body_start=5), PAGINATION_RULES)
        issues = {issue["issue_type"]: issue for issue in result["issues"]}
        self.assertIn("pagination_sequence", issues)
        self.assertIn("restart at 1", issues["pagination_sequence"]["explanation"])

    def test_chapter_first_page_rules(self):
        hidden_rules = {"pagination": {**PAGINATION_RULES["pagination"], "first_page_of_chapter": "No page number shown"}}
        self.assertIn("pagination_chapter_first", _issue_types(self.scan(_thesis(), hidden_rules)))
        self.assertNotIn(
            "pagination_chapter_first", _issue_types(self.scan(_thesis(chapter_first_page="hidden"), hidden_rules))
        )
        same_rules = {"pagination": {**PAGINATION_RULES["pagination"], "first_page_of_chapter": "Same position as other pages"}}
        self.assertNotIn("pagination_position", _issue_types(self.scan(_thesis(chapter_first_page=None), same_rules)))

    def test_unmarked_table_continuation_chapter_cell_is_not_chapter_start(self):
        """Continuation table page: short unmarked 'Chapter 3' must not hide-number FP."""
        def page(index, lines, number=None, mark_table=None):
            mark_table = mark_table or set()
            out = []
            for line_index, text in enumerate(lines):
                unit = {
                    "text": text,
                    "bbox": [72, 120 + line_index * 18, 280, 134 + line_index * 18],
                    "spans": [{"text": text, "size": 11, "font": "Times"}],
                    "page_index": index,
                    "line_index": line_index,
                    "page_width": 612,
                    "page_height": 792,
                    "source": "body",
                }
                if line_index in mark_table:
                    unit["table_row"] = True
                    unit["source"] = "table"
                out.append(unit)
            if number is not None:
                out.append({
                    "text": number,
                    "bbox": [540, 40, 550, 52],
                    "spans": [{"text": number, "size": 12, "font": "Times"}],
                    "page_index": index,
                    "line_index": len(out),
                    "page_width": 612,
                    "page_height": 792,
                })
            return {"page_index": index, "width_points": 612, "height_points": 792, "lines": out}

        pages = [
            page(0, ["A STUDY OF MANUSCRIPT FORMATTING"]),
            page(1, ["ABSTRACT", BODY[:80]], number="ii"),
            page(
                2,
                [
                    "Chapter 3",
                    "Review of Related Literature  environment variables",
                    "shared components and project board",
                    "GitHub branches  Android Studio  VS Code",
                ],
                number="35",
                mark_table={1, 2, 3},
            ),
        ]
        parsed = {"text": "", "metadata": {"format": "pdf"}, "pages": pages}
        rules = {
            "pagination": {
                "position": "Top right",
                "title_page": "Hidden but counted",
                "first_page_of_chapter": "No page number shown",
                "chapter_markers": ["chapter_roman", "chapter_arabic"],
            }
        }
        result = self.scan(parsed, rules)
        self.assertNotIn("pagination_chapter_first", _issue_types(result, "pagination"))

    def test_real_chapter_first_page_with_number_still_flagged(self):
        """Emphasized CHAPTER I with a visible number must still raise chapter-first."""
        def page(index, number=None, heading=None):
            lines = []
            if heading:
                lines.append({
                    "text": heading,
                    "bbox": [72, 120, 540, 140],
                    "spans": [{"text": heading, "size": 14, "font": "Times-Bold", "flags": 2**4}],
                    "page_index": index,
                    "line_index": 0,
                    "page_width": 612,
                    "page_height": 792,
                    "role": "heading1",
                    "formatting": {"bold": True},
                    "source": "body",
                })
            lines.append({
                "text": f"Body text continues on page {index + 1} with enough words for readers.",
                "bbox": [72, 180, 540, 194],
                "spans": [{"text": "body", "size": 12, "font": "Times"}],
                "page_index": index,
                "line_index": len(lines),
                "page_width": 612,
                "page_height": 792,
                "source": "body",
            })
            if number is not None:
                lines.append({
                    "text": number,
                    "bbox": [540, 40, 550, 52],
                    "spans": [{"text": number, "size": 12, "font": "Times"}],
                    "page_index": index,
                    "line_index": len(lines),
                    "page_width": 612,
                    "page_height": 792,
                })
            return {"page_index": index, "width_points": 612, "height_points": 792, "lines": lines}

        pages = [
            page(0),
            page(1, number="ii"),
            page(2, number="1", heading="CHAPTER I"),
            page(3, number="2"),
        ]
        parsed = {"text": "", "metadata": {"format": "pdf"}, "pages": pages}
        rules = {
            "pagination": {
                "position": "Top right",
                "title_page": "Hidden but counted",
                "first_page_of_chapter": "No page number shown",
                "chapter_markers": ["chapter_roman", "chapter_arabic"],
            }
        }
        result = self.scan(parsed, rules)
        self.assertIn("pagination_chapter_first", _issue_types(result, "pagination"))

    def test_hidden_chapter_first_page_is_not_missing_number(self):
        """CHAPTER I with no number + hide rule must not raise pagination_missing."""
        def page(index, number=None, heading=None, orphan=None, table_at=None):
            lines = []
            if orphan:
                lines.append({
                    "text": orphan,
                    "bbox": [72, 90, 200, 104],
                    "spans": [{"text": orphan, "size": 10, "font": "Times"}],
                    "page_index": index,
                    "line_index": 0,
                    "page_width": 612,
                    "page_height": 792,
                    "source": "body",
                })
            if heading:
                lines.append({
                    "text": heading,
                    "bbox": [72, 120, 540, 140],
                    "spans": [{"text": heading, "size": 14, "font": "Times-Bold", "flags": 2**4}],
                    "page_index": index,
                    "line_index": len(lines),
                    "page_width": 612,
                    "page_height": 792,
                    "role": "heading1",
                    "formatting": {"bold": True},
                    "source": "body",
                })
            lines.append({
                "text": "INTRODUCTION",
                "bbox": [72, 150, 540, 168],
                "spans": [{"text": "INTRODUCTION", "size": 12, "font": "Times-Bold"}],
                "page_index": index,
                "line_index": len(lines),
                "page_width": 612,
                "page_height": 792,
                "role": "heading1",
                "formatting": {"bold": True},
                "source": "body",
            })
            lines.append({
                "text": (
                    "In response to these challenges, there is a growing need for an intelligent "
                    "system that can help students format academic manuscripts correctly."
                ),
                "bbox": [72, 200, 540, 240],
                "spans": [{"text": "body", "size": 12, "font": "Times"}],
                "page_index": index,
                "line_index": len(lines),
                "page_width": 612,
                "page_height": 792,
                "source": "body",
            })
            if table_at is not None:
                lines.append({
                    "text": "Task  Owner  Status",
                    "bbox": [72, table_at, 500, table_at + 14],
                    "spans": [{"text": "Task  Owner  Status", "size": 11, "font": "Times"}],
                    "page_index": index,
                    "line_index": len(lines),
                    "page_width": 612,
                    "page_height": 792,
                    "source": "table",
                    "table_row": True,
                })
            if number is not None:
                lines.append({
                    "text": number,
                    "bbox": [540, 40, 550, 52],
                    "spans": [{"text": number, "size": 12, "font": "Times"}],
                    "page_index": index,
                    "line_index": len(lines),
                    "page_width": 612,
                    "page_height": 792,
                })
            return {"page_index": index, "width_points": 612, "height_points": 792, "lines": lines}

        pages = [
            page(0),
            page(1, number="ii"),
            page(2, heading="CHAPTER I", orphan="PaperPilot", table_at=520),
            page(3, number="2"),
        ]
        parsed = {"text": "", "metadata": {"format": "pdf"}, "pages": pages}
        rules = {
            "pagination": {
                "position": "Top right",
                "title_page": "Hidden but counted",
                "first_page_of_chapter": "No page number shown",
                "chapter_markers": ["chapter_roman", "chapter_arabic"],
            }
        }
        result = self.scan(parsed, rules)
        types = _issue_types(result, "pagination")
        self.assertNotIn("pagination_missing", types)
        self.assertNotIn("pagination_chapter_first", types)

    def test_hidden_and_not_counted_title_page(self):
        rules = {"pagination": {**PAGINATION_RULES["pagination"], "title_page": "Hidden and not counted"}}
        self.assertIn("pagination_sequence", _issue_types(self.scan(_thesis(), rules)))

    def test_page_tokens(self):
        self.assertEqual(_page_token("iv"), (4, "roman_lower"))
        self.assertEqual(_page_token("Page 12 of 40"), (12, "arabic"))
        self.assertEqual(_page_token("- 7 -"), (7, "arabic"))
        self.assertIsNone(_page_token("iiii"))
        self.assertIsNone(_page_token("Introduction"))

    def test_pdf_page_numbers(self):
        def page(index, number, x=540, y=40, heading=None):
            lines = [{"text": heading or f"Body text line on page {index + 1} with enough words.",
                      "bbox": [72, 300, 540, 314], "spans": [{"text": "x", "size": 12, "font": "Times"}]}]
            if number is not None:
                lines.append({"text": number, "bbox": [x, y, x + 10, y + 12],
                              "spans": [{"text": number, "size": 12, "font": "Times"}]})
            for line_index, line in enumerate(lines):
                line.update(page_index=index, line_index=line_index)
            return {"page_index": index, "width_points": 612, "height_points": 792, "lines": lines}

        pages = [page(0, None), page(1, "ii"), page(2, "iii"),
                 page(3, None, heading="CHAPTER I"), page(4, "2"), page(5, "4")]
        parsed = {"text": "", "metadata": {"format": "pdf"}, "pages": pages}
        rules = {"pagination": {**PAGINATION_RULES["pagination"], "first_page_of_chapter": "No page number shown"}}
        result = self.scan(parsed, rules)
        issues = {issue["issue_type"]: issue for issue in result["issues"]}
        self.assertEqual(set(issues), {"pagination_sequence"})
        self.assertEqual(issues["pagination_sequence"]["locations"][0]["page"], 6)


class HeadingAndSpacingTests(unittest.TestCase):
    def _doc(self, heading_bold=True, body=BODY):
        doc = Document()
        heading = doc.add_paragraph("Introduction", style="Heading 1")
        heading.alignment = WD_ALIGN_PARAGRAPH.CENTER
        heading.runs[0].bold = heading_bold
        _body(doc, body)
        buffer = io.BytesIO()
        doc.save(buffer)
        return parse_document(buffer.getvalue(), "docx")

    def test_heading_style(self):
        rules = normalize_mechanics_rules(
            {"font": {"heading_styles": {"heading1": {"bold": True, "case": "upper", "alignment": "center"}}}}
        )
        result = run_compliance_scan(self._doc(), rules)
        issue = next(issue for issue in result["issues"] if issue["issue_type"] == "heading1_style")
        self.assertIn("ALL CAPS", issue["explanation"])
        self.assertNotIn("bold", issue["explanation"])
        rules["font"]["heading_styles"]["heading1"]["case"] = "title"
        self.assertNotIn("heading1_style", _issue_types(run_compliance_scan(self._doc(), rules)))

    def test_measured_one_point_six_four_matches_one_and_a_half_spacing(self):
        """PDF gap math often reports Word 1.5 spacing as 1.64. That is not a mismatch."""
        self.assertTrue(_spacing_matches(1.64, 1.5))
        self.assertTrue(_spacing_matches(1.5, 1.5))
        self.assertTrue(_spacing_matches(1.02, 1.0))
        self.assertFalse(_spacing_matches(1.64, 2.0))
        self.assertFalse(_spacing_matches(1.15, 1.0))
        self.assertFalse(_spacing_matches(1.0, 1.5))
        stats = CategoryStats()
        collector = IssueCollector()
        _observe_spacing(
            {"page_index": 0, "line_index": 4, "text": "This paragraph is set to 1.5 line spacing."},
            1.64,
            1.5,
            stats,
            collector,
        )
        self.assertEqual(stats.failed, 0)
        self.assertEqual(collector.result(), [])

    def test_lists_and_table_columns_skip_first_line_indent(self):
        """Numbered questions and far-right table cells are not body indent targets."""
        from app.compliance import _check_indentation

        list_units = [
            {
                "page_index": 0,
                "line_index": 0,
                "text": "3. How often do students use AI writing tools during school work?",
                "role": "body",
                "source": "body",
                "paragraph_index": 0,
                "formatting": {"first_line_indent_inches": 0.0, "left_indent_inches": 0.0},
                "spans": [],
            },
            {
                "page_index": 0,
                "line_index": 1,
                "text": "This wraps onto a second line of the same numbered question item.",
                "role": "body",
                "source": "body",
                "paragraph_index": 0,
                "formatting": {"first_line_indent_inches": 0.0, "left_indent_inches": 0.0},
                "spans": [],
            },
        ]
        table_units = [
            {
                "page_index": 0,
                "line_index": 0,
                "text": "gemini_wording_rejected stores rejected wording for an issue.",
                "role": "body",
                "source": "body",
                "paragraph_index": 1,
                "formatting": {},
                "bbox": [72 + 3.9 * 72, 120, 72 + 5.2 * 72, 134],
                "column": (72.0, 540.0),
                "page_width": 612,
                "spans": [],
            },
            {
                "page_index": 0,
                "line_index": 1,
                "text": "Second wrapped cell line in the same far-right table column.",
                "role": "body",
                "source": "body",
                "paragraph_index": 1,
                "formatting": {},
                "bbox": [72 + 3.9 * 72, 140, 72 + 5.2 * 72, 154],
                "column": (72.0, 540.0),
                "page_width": 612,
                "spans": [],
            },
        ]
        rules = {"first_line_indent_inches": 0.5}
        for units in (list_units, table_units):
            collector = IssueCollector()
            _check_indentation(units, rules, CategoryStats(), collector)
            self.assertNotIn("first_line_indent", collector.items)

    def test_pdf_table_cells_skip_spacing_and_indent(self):
        """Wrapped left-column PDF table lines must not get body spacing/indent hits."""
        from app.compliance import (
            CategoryStats,
            IssueCollector,
            _check_indentation,
            _check_spacing,
            _document_units,
            _promote_pdf_table_cells,
        )

        parsed = {
            "text": "",
            "metadata": {"format": "pdf"},
            "pages": [
                {
                    "page_index": 0,
                    "width_points": 612,
                    "height_points": 792,
                    "lines": [
                        {
                            "text": "Sprint  Task owner  Status",
                            "bbox": [72, 120, 500, 134],
                            "spans": [{"text": "x", "size": 11, "font": "Times"}],
                            "page_index": 0,
                            "line_index": 0,
                            "table_row": True,
                        },
                        {
                            "text": "Build the formatter pipeline for chapter one",
                            "bbox": [72, 150, 250, 164],
                            "spans": [{"text": "x", "size": 11, "font": "Times"}],
                            "page_index": 0,
                            "line_index": 1,
                            "table_row": False,
                        },
                        {
                            "text": "Continue the same cell on the next visual row",
                            "bbox": [72, 168, 240, 182],
                            "spans": [{"text": "x", "size": 11, "font": "Times"}],
                            "page_index": 0,
                            "line_index": 2,
                            "table_row": False,
                        },
                    ],
                }
            ],
        }
        units = _document_units(parsed, {"first_line_indent_inches": 0.5, "line_spacing": 1.5})
        self.assertTrue(any(unit.get("source") == "table" for unit in units[1:]))
        spacing_collector = IssueCollector()
        indent_collector = IssueCollector()
        _check_spacing(units, {"line_spacing": 1.5}, CategoryStats(), spacing_collector)
        _check_indentation(units, {"first_line_indent_inches": 0.5}, CategoryStats(), indent_collector)
        self.assertEqual(spacing_collector.result(), [])
        self.assertNotIn("first_line_indent", indent_collector.items)
        _promote_pdf_table_cells(units)
        self.assertTrue(all(unit.get("source") == "table" for unit in units if unit.get("text")))

    def test_single_line_paragraph_indent_is_checked(self):
        """A one-line body sentence with 0.5 inch indent must fail a 1.0 inch rule."""
        from app.compliance import CategoryStats, IssueCollector, _check_indentation

        units = [
            {
                "page_index": 0,
                "line_index": 0,
                "text": "This single-line body paragraph should still be checked for indentation.",
                "role": "body",
                "source": "body",
                "paragraph_index": 0,
                "formatting": {"first_line_indent_inches": 0.5, "left_indent_inches": 0.0},
                "spans": [],
            }
        ]
        collector = IssueCollector()
        _check_indentation(units, {"first_line_indent_inches": 1.0}, CategoryStats(), collector)
        self.assertIn("first_line_indent", collector.items)

    def test_pdf_wrap_jitter_does_not_start_indent_paragraph(self):
        """A slightly inset wrap line is not a new paragraph first-line indent."""
        from app.compliance import CategoryStats, IssueCollector, _check_indentation

        units = [
            {
                "page_index": 0,
                "line_index": 0,
                "text": "Students prepare manuscripts with careful attention to indent rules across pages.",
                "role": "body",
                "source": "body",
                "formatting": {},
                "bbox": [72.0 + 36.0, 120.0, 520.0, 134.0],
                "column": (72.0, 540.0),
                "page_width": 612,
                "spans": [],
            },
            {
                "page_index": 0,
                "line_index": 1,
                "text": "Continuation of the same paragraph should not be scored as a new indent.",
                "role": "body",
                "source": "body",
                "formatting": {},
                "bbox": [72.0 + 12.0, 140.0, 520.0, 154.0],
                "column": (72.0, 540.0),
                "page_width": 612,
                "spans": [],
            },
        ]
        collector = IssueCollector()
        _check_indentation(units, {"first_line_indent_inches": 0.5}, CategoryStats(), collector)
        self.assertNotIn("first_line_indent", collector.items)

    def test_one_line_address_skips_justified_alignment(self):
        """A one-line address or contact block is not a JUSTIFIED body line."""
        from app.compliance import CategoryStats, IssueCollector, _check_alignment

        address = "Department of Computer Science, 123 University Avenue, City, State 12345"
        units = [
            {
                "page_index": 0,
                "line_index": 0,
                "text": address,
                "role": "body",
                "source": "body",
                "paragraph_index": 0,
                "alignment": "center",
                "formatting": {"alignment": "center"},
                "spans": [],
            },
            {
                "page_index": 0,
                "line_index": 1,
                "text": "This study examines how students format their manuscripts and how a checker can help.",
                "role": "body",
                "source": "body",
                "paragraph_index": 1,
                "alignment": "left",
                "formatting": {"alignment": "left"},
                "spans": [],
            },
            {
                "page_index": 0,
                "line_index": 2,
                "text": "It describes the problem, the method, and the expected results in plain language.",
                "role": "body",
                "source": "body",
                "paragraph_index": 1,
                "alignment": "left",
                "formatting": {"alignment": "left"},
                "spans": [],
            },
        ]
        stats = CategoryStats()
        collector = IssueCollector()
        _check_alignment(units, {"alignment": "JUSTIFIED"}, stats, collector)
        excerpts = " ".join(loc.get("excerpt") or "" for loc in collector.items["alignment"]["locations"])
        self.assertNotIn("University Avenue", excerpts)
        self.assertEqual(stats.failed, 1)
        self.assertIn("manuscripts", excerpts)

    def test_list_item_flag_skips_indent(self):
        """Word numbering (w:numPr) skips indent even when the text has no list marker."""
        from app.compliance import CategoryStats, IssueCollector, _check_indentation

        text = "Students review the formatting guide before they submit the final manuscript today."
        base = {
            "page_index": 0,
            "line_index": 0,
            "text": text,
            "role": "body",
            "source": "body",
            "paragraph_index": 0,
            "formatting": {"first_line_indent_inches": 0.0, "left_indent_inches": 0.0},
            "spans": [],
        }
        skipped = IssueCollector()
        _check_indentation([{**base, "list_item": True}], {"first_line_indent_inches": 0.5}, CategoryStats(), skipped)
        self.assertNotIn("first_line_indent", skipped.items)
        flagged = IssueCollector()
        _check_indentation([{**base, "list_item": False}], {"first_line_indent_inches": 0.5}, CategoryStats(), flagged)
        self.assertIn("first_line_indent", flagged.items)

    def test_glossary_term_entries_skip_first_line_indent(self):
        """Definition-of-terms 'Term. Definition…' lines are not body indent targets."""
        from app.compliance import CategoryStats, IssueCollector, _check_indentation

        units = [
            {
                "page_index": 0,
                "line_index": 0,
                "text": "Definition of Terms",
                "role": "heading1",
                "source": "body",
                "formatting": {"first_line_indent_inches": 0.0, "left_indent_inches": 0.0},
                "spans": [],
            },
            {
                "page_index": 0,
                "line_index": 1,
                "text": (
                    "PaperPilot. An AI-assisted web and mobile system designed to help researchers "
                    "and students analyze academic documents for compliance with institutional rules."
                ),
                "role": "body",
                "source": "body",
                "paragraph_index": 1,
                "formatting": {"first_line_indent_inches": 0.0, "left_indent_inches": 0.0},
                "spans": [],
            },
            {
                "page_index": 0,
                "line_index": 2,
                "text": (
                    "Academic Documents. Scholarly materials such as theses, dissertations, research "
                    "papers, and related academic reports that must follow prescribed guidelines."
                ),
                "role": "body",
                "source": "body",
                "paragraph_index": 2,
                "formatting": {"first_line_indent_inches": 0.0, "left_indent_inches": 0.0},
                "spans": [],
            },
            {
                "page_index": 0,
                "line_index": 3,
                "text": (
                    "Students prepare manuscripts with careful attention to indent rules across the "
                    "full chapter body after the glossary section ends."
                ),
                "role": "body",
                "source": "body",
                "paragraph_index": 3,
                "formatting": {"first_line_indent_inches": 0.0, "left_indent_inches": 0.0},
                "spans": [],
            },
        ]
        collector = IssueCollector()
        _check_indentation(units, {"first_line_indent_inches": 0.5}, CategoryStats(), collector)
        self.assertNotIn("first_line_indent", collector.items)

        units.append(
            {
                "page_index": 0,
                "line_index": 4,
                "text": "Chapter II",
                "role": "heading1",
                "source": "body",
                "formatting": {"first_line_indent_inches": 0.0, "left_indent_inches": 0.0},
                "spans": [],
            }
        )
        units.append(
            {
                "page_index": 0,
                "line_index": 5,
                "text": (
                    "Students prepare manuscripts with careful attention to indent rules across the "
                    "full chapter body after the glossary section ends."
                ),
                "role": "body",
                "source": "body",
                "paragraph_index": 4,
                "formatting": {"first_line_indent_inches": 0.0, "left_indent_inches": 0.0},
                "spans": [],
            }
        )
        flagged = IssueCollector()
        _check_indentation(units, {"first_line_indent_inches": 0.5}, CategoryStats(), flagged)
        self.assertIn("first_line_indent", flagged.items)

    def test_hanging_indent_skips_first_line_indent_rule(self):
        """Hanging layout is not scored as a missing positive first-line indent."""
        from app.compliance import CategoryStats, IssueCollector, _check_indentation

        units = [
            {
                "page_index": 0,
                "line_index": 0,
                "text": (
                    "Students prepare manuscripts with careful attention to indent rules across the "
                    "full chapter body when hanging indents are used for reference style entries."
                ),
                "role": "body",
                "source": "body",
                "paragraph_index": 0,
                "formatting": {"first_line_indent_inches": -0.5, "left_indent_inches": 0.5},
                "spans": [],
            }
        ]
        collector = IssueCollector()
        _check_indentation(units, {"first_line_indent_inches": 0.5}, CategoryStats(), collector)
        self.assertNotIn("first_line_indent", collector.items)

    def test_pdf_column_left_uses_rare_body_edge_cluster(self):
        """A single wrap-line body edge still beats a majority first-line indent cluster."""
        from app.compliance import PT_PER_INCH, _column_from_boxes

        body_edge = 72.0
        indented = body_edge + 0.5 * PT_PER_INCH
        boxes = [[indented, 0, 540, 12]] * 9 + [[body_edge, 0, 540, 12]]
        left, _right = _column_from_boxes(boxes)
        self.assertEqual(left, body_edge)

    def test_decorative_drawing_is_not_a_missing_figure_caption(self):
        """Logos and seals under 1.5 inches are not figures that need a caption."""
        from app.compliance import IssueCollector, _check_captions

        body = {
            "page_index": 0,
            "line_index": 0,
            "text": "This study examines how students format their manuscripts and how a checker can help them succeed.",
            "role": "body",
            "source": "body",
            "spans": [],
        }
        rules = {"figure_layout_requirements": "Caption placed above the figure"}
        small = IssueCollector()
        _check_captions(
            [
                body,
                {
                    "page_index": 0,
                    "line_index": 1,
                    "text": "",
                    "role": "figure",
                    "source": "figure",
                    "has_drawing": True,
                    "bbox": [72, 220, 140, 280],
                    "page_width": 612,
                    "page_height": 792,
                },
            ],
            rules,
            small,
        )
        self.assertNotIn("figure_caption_missing", small.items)
        large = IssueCollector()
        _check_captions(
            [
                body,
                {
                    "page_index": 0,
                    "line_index": 1,
                    "text": "",
                    "role": "figure",
                    "source": "figure",
                    "has_drawing": True,
                    "bbox": [72, 220, 400, 520],
                    "page_width": 612,
                    "page_height": 792,
                },
            ],
            rules,
            large,
        )
        self.assertIn("figure_caption_missing", large.items)

    def test_pdf_column_left_prefers_body_edge_over_indent_cluster(self):
        """A majority 0.5 inch indent cluster must not become the column left."""
        from app.compliance import (
            CategoryStats,
            IssueCollector,
            PT_PER_INCH,
            _check_indentation,
            _column_from_boxes,
            _document_units,
            _measured_indent,
        )

        body_edge = 72.0
        indented = body_edge + 0.5 * PT_PER_INCH
        boxes = [[indented, 0, 540, 12]] * 5 + [[body_edge, 0, 540, 12]] * 2
        left, _right = _column_from_boxes(boxes)
        self.assertEqual(left, body_edge)

        lines = []
        y = 100.0
        specs = [
            (indented, "Students prepare manuscripts with a half-inch first-line indent on this page."),
            (body_edge, "The wrapped continuation sits on the body edge and must not reset the column."),
            (indented, "Another paragraph begins with the same half-inch indent measured from that edge."),
            (body_edge, "Continuation text stays at the body edge so the indent cluster stays the majority."),
            (indented, "A third indented opening still measures one half inch rather than zero inches."),
            (indented, "A fourth indented opening keeps the indented left edge as the common cluster."),
            (indented, "A fifth indented opening confirms the body edge is still chosen as column left."),
        ]
        for index, (x, text) in enumerate(specs):
            lines.append(
                {
                    "text": text,
                    "bbox": [x, y, 540.0, y + 12],
                    "spans": [{"text": text, "size": 12, "font": "Times"}],
                    "page_index": 0,
                    "line_index": index,
                }
            )
            y += 16
        parsed = {
            "text": "",
            "metadata": {"format": "pdf"},
            "pages": [{"page_index": 0, "width_points": 612, "height_points": 792, "lines": lines}],
        }
        units = _document_units(parsed, {"first_line_indent_inches": 0.5})
        self.assertEqual(units[0]["column"][0], body_edge)
        opening = next(unit for unit in units if abs(unit["bbox"][0] - indented) < 1)
        self.assertAlmostEqual(_measured_indent(opening, 0.0), 0.5, places=2)
        self.assertNotEqual(_measured_indent(opening, 0.0), 0)
        collector = IssueCollector()
        _check_indentation(units, {"first_line_indent_inches": 0.5}, CategoryStats(), collector)
        self.assertNotIn("first_line_indent", collector.items)

    def test_numbered_subheading_maps_to_heading2(self):
        """1.1 maps to Heading 2 when that level is defined, even if Heading 1 exists."""
        from app.compliance import _annotate_roles

        units = [
            {
                "page_index": 0,
                "line_index": 0,
                "text": "1.1 Research Design",
                "style": None,
                "source": "body",
                "formatting": {"first_line_indent_inches": 0.0},
                "spans": [{"text": "1.1 Research Design", "size": 14}],
            }
        ]
        _annotate_roles(
            units,
            {"font": {"heading1_size": 16, "heading2_size": 14, "body_size": 12}},
        )
        self.assertEqual(units[0]["role"], "heading2")

    def test_running_chapter_head_is_not_a_new_chapter_start(self):
        """A repeated CHAPTER I running head on later pages must not hide page numbers."""
        from app.compliance import _section_starts

        units = [
            {
                "page_index": 2,
                "line_index": 0,
                "text": "CHAPTER I",
                "role": "heading1",
                "source": "body",
                "formatting": {"bold": True},
                "spans": [],
            },
            {
                "page_index": 2,
                "line_index": 1,
                "text": "Introduction to the study and its scope for readers.",
                "role": "body",
                "source": "body",
                "spans": [],
            },
            {
                "page_index": 3,
                "line_index": 0,
                "text": "CHAPTER I",
                "role": "heading1",
                "source": "body",
                "formatting": {"bold": True},
                "spans": [],
            },
            {
                "page_index": 3,
                "line_index": 1,
                "text": "Body text continues on the next page of the same chapter.",
                "role": "body",
                "source": "body",
                "spans": [],
            },
        ]
        starts = _section_starts(units)
        self.assertEqual(starts.get(2), "chapter_roman")
        self.assertNotIn(3, starts)

    def test_word_spacing(self):
        rules = normalize_mechanics_rules({"word_spacing": "One space between words and after periods"})
        self.assertIn("word_spacing", _issue_types(run_compliance_scan(self._doc(body=BODY.replace(" how ", "  how ")), rules)))
        self.assertNotIn("word_spacing", _issue_types(run_compliance_scan(self._doc(), rules)))
        two = normalize_mechanics_rules({"word_spacing": "Two spaces after periods"})
        self.assertIn("word_spacing", _issue_types(run_compliance_scan(self._doc(), two)))
        self.assertNotIn(
            "word_spacing", _issue_types(run_compliance_scan(self._doc(body=BODY.replace(". It", ".  It")), two))
        )

    def test_landscape_pages(self):
        doc = Document()
        _body(doc)
        wide = doc.add_section(WD_SECTION.NEW_PAGE)
        wide.orientation = WD_ORIENT.LANDSCAPE
        wide.page_width, wide.page_height = wide.page_height, wide.page_width
        table = doc.add_table(rows=2, cols=2)
        table.cell(0, 0).text = "Year"
        buffer = io.BytesIO()
        doc.save(buffer)
        parsed = parse_document(buffer.getvalue(), "docx")
        base = {"paper": {"size": "8.5 x 11", "orientation": "Portrait"}}
        strict = run_compliance_scan(parsed, normalize_mechanics_rules(base))
        self.assertIn("paper_orientation", _issue_types(strict))
        allowed = {"paper": {**base["paper"], "landscape_pages": "Allowed for tables and figures"}}
        self.assertNotIn("paper_orientation", _issue_types(run_compliance_scan(parsed, normalize_mechanics_rules(allowed))))


class UnsetRulesAreSkippedTests(unittest.TestCase):
    """Unset mechanics fields must not produce violations for that dimension."""

    def _body_doc(self, *, size=11, align=WD_ALIGN_PARAGRAPH.CENTER):
        doc = Document()
        paragraph = doc.add_paragraph(BODY)
        paragraph.alignment = align
        paragraph.runs[0].font.size = Pt(size)
        paragraph.runs[0].font.name = "Arial"
        buffer = io.BytesIO()
        doc.save(buffer)
        return parse_document(buffer.getvalue(), "docx")

    def test_unset_body_size_is_not_flagged_when_only_heading_sizes_exist(self):
        # Heading sizes used to bleed into body via sizes_points; body must stay unchecked.
        rules = normalize_mechanics_rules(
            {
                "font": {
                    "families": ["Times New Roman"],
                    "heading1_size": 14,
                    "heading2_size": 12,
                    "sizes_points": [14, 12],
                }
            }
        )
        self.assertNotIn("body_size", rules.get("font") or {})
        result = run_compliance_scan(self._body_doc(size=11), rules)
        self.assertNotIn("font_size", _issue_types(result))

    def test_unset_alignment_is_not_flagged(self):
        rules = normalize_mechanics_rules({"font": {"families": ["Arial"]}})
        self.assertNotIn("alignment", rules)
        result = run_compliance_scan(self._body_doc(align=WD_ALIGN_PARAGRAPH.CENTER), rules)
        self.assertNotIn("alignment", _issue_types(result))
        alignment = next(item for item in result["scoring"]["categories"] if item["category"] == "Alignment")
        self.assertEqual(alignment["status"], "pass")
        self.assertGreater(alignment["units_checked"], 0)
        self.assertEqual(alignment["units_failed"], 0)

    def test_justified_synonym_still_checks_alignment(self):
        """Legacy / form labels like 'Justified' must appear on Score Breakdown."""
        result = run_compliance_scan(
            self._body_doc(align=WD_ALIGN_PARAGRAPH.CENTER),
            {"alignment": "Justified"},
        )
        alignment = next(item for item in result["scoring"]["categories"] if item["category"] == "Alignment")
        self.assertNotEqual(alignment["status"], "not_applicable")
        self.assertGreater(alignment["units_checked"], 0)
        self.assertIn("alignment", _issue_types(result))

    def test_ignore_alignment_passes_with_units(self):
        """IGNORE counts eligible alignment units as all passed (no issues)."""
        result = run_compliance_scan(
            self._body_doc(align=WD_ALIGN_PARAGRAPH.CENTER),
            {"alignment": "IGNORE"},
        )
        alignment = next(item for item in result["scoring"]["categories"] if item["category"] == "Alignment")
        self.assertEqual(alignment["status"], "pass")
        self.assertGreater(alignment["units_checked"], 0)
        self.assertEqual(alignment["units_failed"], 0)
        self.assertNotIn("alignment", _issue_types(result))

    def test_empty_mechanics_pass_alignment_and_spacing_units(self):
        """Unset categories still show checked units that all pass on Score Breakdown."""
        result = run_compliance_scan(self._body_doc(align=WD_ALIGN_PARAGRAPH.LEFT), {})
        by_cat = {item["category"]: item for item in result["scoring"]["categories"]}
        for name in ("Alignment", "Spacing"):
            self.assertEqual(by_cat[name]["units_failed"], 0, name)
            self.assertGreater(by_cat[name]["units_checked"], 0, name)
            self.assertEqual(by_cat[name]["status"], "pass", name)
        self.assertEqual(result["issues"], [])

    def test_explicit_body_size_still_flags_mismatch(self):
        rules = normalize_mechanics_rules({"font": {"body_size": 12}})
        result = run_compliance_scan(self._body_doc(size=11), rules)
        self.assertIn("font_size", _issue_types(result))

class NormalizeTests(unittest.TestCase):
    def test_legacy_values_map_to_dropdown_choices(self):
        rules = normalize_mechanics_rules(
            {"pagination": {"position": "upper right corner", "first_page_of_chapter": "Counted but not numbered"}}
        )
        self.assertEqual(rules["pagination"]["position"], "Top right")
        self.assertEqual(rules["pagination"]["first_page_of_chapter"], "No page number shown")

    def test_new_fields_survive(self):
        rules = normalize_mechanics_rules(
            {
                **PAGINATION_RULES,
                "word_spacing": "Two spaces after periods",
                "paper": {"orientation": "Portrait", "landscape_pages": "Allowed on any page"},
                "font": {"heading_styles": {"heading2": {"bold": "Yes", "alignment": "Left"}}},
            }
        )
        self.assertEqual(rules["pagination"]["chapter_markers"], ["chapter_roman"])
        self.assertEqual(rules["pagination"]["title_page"], "Hidden but counted")
        self.assertEqual(rules["word_spacing"], "Two spaces after periods")
        self.assertEqual(rules["paper"]["landscape_pages"], "Allowed on any page")
        self.assertEqual(rules["font"]["heading_styles"], {"heading2": {"bold": True, "alignment": "left"}})


if __name__ == "__main__":
    unittest.main()
