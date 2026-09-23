from __future__ import annotations

import io
import re
import zipfile
from pathlib import Path

import fitz
from docx import Document
from docx.document import Document as DocxDocument
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml.ns import qn
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.text.run import Run


class DocumentError(ValueError):
    pass


def validate_document(filename: str, data: bytes, max_bytes: int) -> str:
    suffix = Path(filename or "").suffix.lower()
    if suffix not in {".pdf", ".docx"}:
        raise DocumentError("Only .pdf and .docx files are supported.")
    if not data:
        raise DocumentError("The uploaded file is empty.")
    if len(data) > max_bytes:
        raise DocumentError(f"The uploaded file exceeds the {max_bytes}-byte limit.")
    if suffix == ".pdf":
        if not data[:1024].lstrip().startswith(b"%PDF-"):
            raise DocumentError("The file extension is .pdf but its signature is not a PDF.")
        return "pdf"
    if not data.startswith(b"PK\x03\x04"):
        raise DocumentError("The file extension is .docx but its signature is not a ZIP container.")
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as package:
            names = set(package.namelist())
            if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                raise DocumentError("The uploaded ZIP container is not a valid DOCX document.")
    except zipfile.BadZipFile as exc:
        raise DocumentError("The uploaded DOCX container is corrupt.") from exc
    return "docx"


def parse_document(data: bytes, file_type: str) -> dict:
    try:
        return _parse_pdf(data) if file_type == "pdf" else _parse_docx(data)
    except DocumentError:
        raise
    except Exception as exc:
        raise DocumentError("The document could not be parsed.") from exc


def _parse_pdf(data: bytes) -> dict:
    pages: list[dict] = []
    all_text: list[str] = []
    with fitz.open(stream=data, filetype="pdf") as document:
        if document.needs_pass:
            raise DocumentError("Password-protected PDFs are not supported.")
        for page_index in range(document.page_count):
            page = document.load_page(page_index)
            raw = page.get_text("dict", sort=True)
            lines: list[dict] = []
            line_index = 0
            for block in raw.get("blocks", []):
                if block.get("type") != 0:
                    continue
                for source_line in block.get("lines", []):
                    spans = [
                        {
                            "text": span.get("text", ""),
                            "font": span.get("font"),
                            "size": round(float(span.get("size", 0)), 2),
                            "bold": bool(int(span.get("flags", 0)) & 16),
                            "color": span.get("color"),
                            "bbox": [round(float(value), 2) for value in span.get("bbox", [])],
                        }
                        for span in source_line.get("spans", [])
                        if span.get("text")
                    ]
                    text = "".join(span["text"] for span in spans).strip()
                    if not text:
                        continue
                    lines.append(
                        {
                            "page_index": page_index,
                            "line_index": line_index,
                            "text": text,
                            "spans": spans,
                            "bbox": [
                                round(float(value), 2) for value in source_line.get("bbox", [])
                            ],
                        }
                    )
                    line_index += 1
            page_text = "\n".join(line["text"] for line in lines)
            all_text.append(page_text)
            pages.append(
                {
                    "page_index": page_index,
                    "width_points": round(float(page.rect.width), 2),
                    "height_points": round(float(page.rect.height), 2),
                    "rotation": page.rotation,
                    "lines": lines,
                }
            )
    return {
        "text": "\n\n".join(all_text).strip(),
        "metadata": {
            "format": "pdf",
            "pagination_fidelity": "fixed_source_pages",
            "page_count": len(pages),
            "indexing": "page_index and line_index are fixed zero-based source indexes",
            "includes": "every PDF page, including headers, footers, and table text",
        },
        "pages": pages,
    }


def _length_inches(value) -> float | None:
    return round(value.inches, 3) if value is not None else None


def _docx_alignment(paragraph) -> str | None:
    align = paragraph.alignment
    if align is None and paragraph.style is not None:
        align = paragraph.style.paragraph_format.alignment
    mapping = {
        WD_ALIGN_PARAGRAPH.LEFT: "left",
        WD_ALIGN_PARAGRAPH.CENTER: "center",
        WD_ALIGN_PARAGRAPH.RIGHT: "right",
        WD_ALIGN_PARAGRAPH.JUSTIFY: "justify",
    }
    return mapping.get(align)


def _docx_line_spacing(formatting) -> float | None:
    rule = formatting.line_spacing_rule
    if rule == WD_LINE_SPACING.ONE_POINT_FIVE:
        return 1.5
    if rule == WD_LINE_SPACING.DOUBLE:
        return 2.0
    if rule == WD_LINE_SPACING.SINGLE:
        return 1.0
    value = formatting.line_spacing
    if isinstance(value, (int, float)):
        return round(float(value), 3)
    return None


def _iter_block_element(element, container):
    for child in element.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, container)
        elif isinstance(child, CT_Tbl):
            yield Table(child, container)
        elif child.tag == qn("w:sdt"):
            content = child.find(qn("w:sdtContent"))
            if content is not None:
                yield from _iter_block_element(content, container)
        elif child.tag in {qn("w:sdtContent"), qn("w:customXml")}:
            yield from _iter_block_element(child, container)


def _iter_docx_block_items(parent):
    if isinstance(parent, DocxDocument):
        element = parent.element.body
        container = parent
    elif hasattr(parent, "_tc"):
        element = parent._tc
        container = parent
    else:
        element = parent._element
        container = parent
    yield from _iter_block_element(element, container)


def _run_inside_excluded(run_el, stop_el) -> bool:
    parent = run_el.getparent()
    skip = {qn("w:drawing"), qn("w:txbxContent"), qn("w:pict"), qn("w:del")}
    while parent is not None and parent is not stop_el:
        if parent.tag in skip:
            return True
        parent = parent.getparent()
    return False


def _docx_run_elements(paragraph):
    for run_el in paragraph._element.iter(qn("w:r")):
        if not _run_inside_excluded(run_el, paragraph._element):
            yield run_el


def _related_parts(document, needle: str):
    rels = getattr(document.part, "rels", None)
    if not rels:
        return
    for rel in rels.values():
        reltype = str(getattr(rel, "reltype", "") or "")
        if needle not in reltype:
            continue
        try:
            yield rel.target_part
        except Exception:
            continue


def _docx_run_font_name(run, paragraph) -> str | None:
    name = run.font.name
    if name:
        return name
    try:
        rpr = run._element.rPr
        if rpr is not None:
            rfonts = rpr.rFonts
            if rfonts is not None:
                for attr in ("ascii", "hAnsi", "cs", "eastAsia"):
                    value = rfonts.get(qn(f"w:{attr}"))
                    if value and not _is_docx_decorative_font(value):
                        return value
                for attr in ("ascii", "hAnsi", "cs", "eastAsia"):
                    value = rfonts.get(qn(f"w:{attr}"))
                    if value:
                        return value
    except Exception:
        pass
    try:
        style = paragraph.style
        while style is not None:
            if style.font and style.font.name:
                return style.font.name
            style = style.base_style
    except Exception:
        pass
    return None


def _is_docx_decorative_font(name: str | None) -> bool:
    return bool(name and re.search(
        r"(emoji|symbol|wingdings|webdings|marlett|dingbat|barra?code|icon)",
        str(name),
        re.I,
    ))


def _docx_run_font_size(run, paragraph) -> float | None:
    if run.font.size:
        return round(run.font.size.pt, 2)
    try:
        rpr = run._element.rPr
        if rpr is not None and rpr.sz is not None and rpr.sz.val is not None:
            return round(float(rpr.sz.val) / 2.0, 2)
    except Exception:
        pass
    try:
        style = paragraph.style
        while style is not None:
            if style.font and style.font.size:
                return round(style.font.size.pt, 2)
            style = style.base_style
    except Exception:
        pass
    return None


def _docx_paragraph_record(paragraph, paragraph_index: int, line_index: int, source: str):
    runs: list[dict] = []
    page_break_total = 0
    for run_index, run_el in enumerate(_docx_run_elements(paragraph)):
        run = Run(run_el, paragraph)
        page_break_count = 0
        line_break_count = 0
        for br in run._element.iter(qn("w:br")):
            break_type = br.get(qn("w:type"))
            if break_type == "page":
                page_break_count += 1
            else:
                line_break_count += 1
        rendered_page_breaks = len(list(run._element.iter(qn("w:lastRenderedPageBreak"))))
        page_break_total += page_break_count + rendered_page_breaks
        rgb = None
        try:
            if run.font.color and run.font.color.rgb:
                rgb = str(run.font.color.rgb)
        except Exception:
            rgb = None
        runs.append(
            {
                "text": run.text,
                "font": _docx_run_font_name(run, paragraph),
                "size": _docx_run_font_size(run, paragraph),
                "bold": run.bold,
                "italic": run.italic,
                "color": rgb,
                "style": run.style.name if run.style else None,
                "page_breaks": page_break_count,
                "rendered_page_breaks": rendered_page_breaks,
                "line_breaks": line_break_count,
                "run_index": run_index,
            }
        )
    source_lines = paragraph.text.splitlines() or [""]
    lines = []
    collected = []
    for text in source_lines:
        lines.append({"line_index": line_index, "text": text})
        collected.append(text)
        line_index += 1
    formatting = paragraph.paragraph_format
    record = {
        "paragraph_index": paragraph_index,
        "source": source,
        "style": paragraph.style.name if paragraph.style else None,
        "text": paragraph.text,
        "lines": lines,
        "runs": runs,
        "formatting": {
            "line_spacing": _docx_line_spacing(formatting),
            "alignment": _docx_alignment(paragraph),
            "space_before_points": (
                round(formatting.space_before.pt, 2) if formatting.space_before else None
            ),
            "space_after_points": (
                round(formatting.space_after.pt, 2) if formatting.space_after else None
            ),
            "first_line_indent_inches": _length_inches(formatting.first_line_indent),
            "left_indent_inches": _length_inches(formatting.left_indent),
            "right_indent_inches": _length_inches(formatting.right_indent),
            "page_break_before": formatting.page_break_before,
        },
    }
    return record, line_index, page_break_total, collected


def _append_docx_paragraph(paragraphs, all_lines, breaks, paragraph, paragraph_index, line_index, source):
    record, line_index, page_breaks, collected = _docx_paragraph_record(
        paragraph, paragraph_index, line_index, source
    )
    paragraphs.append(record)
    all_lines.extend(collected)
    if page_breaks:
        breaks.append({"paragraph_index": paragraph_index, "source": source, "count": page_breaks})
    return line_index


def _parse_docx(data: bytes) -> dict:
    document = Document(io.BytesIO(data))
    paragraphs: list[dict] = []
    all_lines: list[str] = []
    explicit_page_breaks: list[dict] = []
    line_index = 0
    paragraph_index = 0
    seen_cells: set = set()
    seen_paragraphs: set = set()

    def consume_paragraph(paragraph, source: str) -> None:
        nonlocal line_index, paragraph_index
        element = paragraph._element
        if element in seen_paragraphs:
            return
        seen_paragraphs.add(element)
        line_index = _append_docx_paragraph(
            paragraphs, all_lines, explicit_page_breaks, paragraph, paragraph_index, line_index, source
        )
        paragraph_index += 1

    def consume_table(table, source: str) -> None:
        for row in table.rows:
            for cell in row.cells:
                cell_el = cell._tc
                if cell_el in seen_cells:
                    continue
                seen_cells.add(cell_el)
                consume_parent(cell, source)

    def consume_parent(parent, source: str) -> None:
        for block in _iter_docx_block_items(parent):
            if isinstance(block, Paragraph):
                consume_paragraph(block, source)
            else:
                consume_table(block, "table" if source == "body" else source)

    def consume_textboxes(root, container, source: str) -> None:
        for txbx in root.iter(qn("w:txbxContent")):
            for block in _iter_block_element(txbx, container):
                if isinstance(block, Paragraph):
                    consume_paragraph(block, source)
                else:
                    consume_table(block, source)

    consume_parent(document, "body")
    consume_textboxes(document.element, document, "textbox")

    for section in document.sections:
        for source, part in (("header", section.header), ("footer", section.footer)):
            try:
                consume_parent(part, source)
                consume_textboxes(part._element, part, source)
            except Exception:
                continue

    for needle, source in (("footnotes", "footnote"), ("endnotes", "endnote")):
        for part in _related_parts(document, needle):
            try:
                root = part.element
            except Exception:
                continue
            for note in root.iterchildren():
                note_type = note.get(qn("w:type"))
                if note_type in {"separator", "continuationSeparator"}:
                    continue
                for block in _iter_block_element(note, document):
                    if isinstance(block, Paragraph):
                        consume_paragraph(block, source)
                    else:
                        consume_table(block, source)

    sections = [
        {
            "section_index": index,
            "page_width_inches": _length_inches(section.page_width),
            "page_height_inches": _length_inches(section.page_height),
            "top_margin_inches": _length_inches(section.top_margin),
            "bottom_margin_inches": _length_inches(section.bottom_margin),
            "left_margin_inches": _length_inches(section.left_margin),
            "right_margin_inches": _length_inches(section.right_margin),
        }
        for index, section in enumerate(document.sections)
    ]
    return {
        "text": "\n".join(all_lines).strip(),
        "metadata": {
            "format": "docx",
            "pagination_fidelity": "word_rendered_breaks_when_present_else_estimated",
            "explicit_page_break_count": len(explicit_page_breaks),
            "paragraph_count": len(paragraphs),
            "line_indexing": "line_index is document-flow based and zero-based",
            "includes": "body, tables, headers, footers, text boxes, footnotes, and endnotes",
            "rendered_page_break_count": sum(
                int(run.get("rendered_page_breaks") or 0)
                for paragraph in paragraphs
                for run in (paragraph.get("runs") or [])
            ),
        },
        "paragraphs": paragraphs,
        "sections": sections,
        "explicit_page_breaks": explicit_page_breaks,
    }


def normalize_mechanics_rules(raw: dict | None) -> dict:
    """Sanitize client-edited rules into the shape used by compliance checks."""
    # NOTE: Guide extraction (derive_mechanics_rules) lives on the Vercel api/ gateway.
    if not isinstance(raw, dict):
        return {}
    rules: dict = {}

    font = raw.get("font") if isinstance(raw.get("font"), dict) else {}
    families = font.get("families") or raw.get("font_families") or []
    if isinstance(families, str):
        families = [part.strip() for part in families.split(",") if part.strip()]
    font_type = str(font.get("type") or raw.get("font_type") or "").strip()
    if font_type and font_type not in families:
        families = [font_type, *list(families)]
    sizes = font.get("sizes_points") or raw.get("font_sizes") or []
    if isinstance(sizes, (int, float, str)) and str(sizes).strip():
        try:
            sizes = [float(sizes)]
        except ValueError:
            sizes = []
    font_out: dict = {}
    if families:
        font_out["families"] = [str(f).strip() for f in families if str(f).strip()][:8]
    if font_type:
        font_out["type"] = font_type
    color = str(font.get("color") or raw.get("font_color") or "").strip()
    if color:
        font_out["color"] = color[:80]
    for key in ("heading1_size", "heading2_size", "heading3_content_size"):
        value = font.get(key, raw.get(key))
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if 6 <= number <= 72:
            font_out[key] = number
            if isinstance(sizes, list):
                sizes = [*list(sizes), number]
            else:
                sizes = [number]
    if sizes:
        cleaned = []
        for value in sizes:
            try:
                number = float(value)
            except (TypeError, ValueError):
                continue
            if 6 <= number <= 72:
                cleaned.append(number)
        if cleaned:
            seen: set[float] = set()
            unique = []
            for number in cleaned:
                if number not in seen:
                    seen.add(number)
                    unique.append(number)
            font_out["sizes_points"] = unique[:8]
    if font_out:
        rules["font"] = font_out

    paper_in = raw.get("paper") if isinstance(raw.get("paper"), dict) else {}
    paper_out: dict = {}
    for key in ("size", "orientation", "substance"):
        value = str(paper_in.get(key) or raw.get(f"paper_{key}") or "").strip()
        if value:
            paper_out[key] = value[:120]
    if paper_out:
        rules["paper"] = paper_out

    paper = raw.get("paper_size") if isinstance(raw.get("paper_size"), dict) else {}
    paper_name = str(paper.get("name") or raw.get("paper_size_name") or "").strip().upper()
    size_label = str(paper_out.get("size") or "").upper()
    if not paper_name and size_label:
        if "14" in size_label and "8.5" in size_label:
            paper_name = "LEGAL"
        elif "8.5" in size_label and "11" in size_label:
            paper_name = "LETTER"
        elif "A4" in size_label or "8.27" in size_label:
            paper_name = "A4"
    paper_size_out: dict = {}
    if paper_name in {"A4", "LETTER", "LEGAL"}:
        paper_size_out["name"] = paper_name
    try:
        width = float(paper.get("width_inches"))
        height = float(paper.get("height_inches"))
        if width > 0 and height > 0:
            paper_size_out["width_inches"] = width
            paper_size_out["height_inches"] = height
    except (TypeError, ValueError):
        dims = re.search(r"(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)", size_label, re.I)
        if dims:
            paper_size_out["width_inches"] = float(dims.group(1))
            paper_size_out["height_inches"] = float(dims.group(2))
    if paper_size_out:
        rules["paper_size"] = paper_size_out

    spacing_raw = raw.get("line_spacing", raw.get("spacing"))
    try:
        spacing = float(spacing_raw)
        if spacing in {1.0, 1.5, 2.0}:
            rules["line_spacing"] = spacing
            rules["spacing"] = str(spacing)
    except (TypeError, ValueError):
        spacing_text = str(raw.get("spacing") or "").strip()
        if spacing_text:
            rules["spacing"] = spacing_text[:80]
            match = re.search(r"(\d+(?:\.\d+)?)", spacing_text)
            if match:
                try:
                    spacing = float(match.group(1))
                    if spacing in {1.0, 1.5, 2.0}:
                        rules["line_spacing"] = spacing
                except ValueError:
                    pass

    indention = str(raw.get("indention") or "").strip()
    if indention:
        rules["indention"] = indention[:120]
    try:
        indent = float(raw.get("first_line_indent_inches"))
        if 0 <= indent <= 2:
            rules["first_line_indent_inches"] = indent
    except (TypeError, ValueError):
        if indention:
            match = re.search(r"(\d+(?:\.\d+)?)", indention)
            if match:
                try:
                    indent = float(match.group(1))
                    if 0 <= indent <= 2:
                        rules["first_line_indent_inches"] = indent
                except ValueError:
                    pass

    margins_in = raw.get("margins_inches") if isinstance(raw.get("margins_inches"), dict) else {}
    margins: dict[str, float] = {}
    for side in ("top", "bottom", "left", "right", "gutter", "header", "footer"):
        value = margins_in.get(side, raw.get(f"margin_{side}"))
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if 0 <= number <= 5:
            margins[side] = number
    if margins:
        rules["margins_inches"] = margins

    citation = str(raw.get("citation_style") or "").strip().upper()
    if citation in {"APA", "MLA", "IEEE", "CHICAGO", "HARVARD", "VANCOUVER", "TURABIAN"}:
        rules["citation_style"] = citation

    pagination_in = raw.get("pagination") if isinstance(raw.get("pagination"), dict) else {}
    pagination_out: dict = {}
    position = str(pagination_in.get("position") or raw.get("pagination_position") or "").strip()
    first_page = str(
        pagination_in.get("first_page_of_chapter") or raw.get("pagination_first_page_rule") or ""
    ).strip()
    if position:
        pagination_out["position"] = position[:200]
    if first_page:
        pagination_out["first_page_of_chapter"] = first_page[:200]
    if pagination_out:
        rules["pagination"] = pagination_out

    def _lines(value) -> list[str]:
        if isinstance(value, list):
            return [str(item).strip()[:500] for item in value if str(item).strip()][:12]
        if isinstance(value, str) and value.strip():
            return [part.strip()[:500] for part in re.split(r"[\n;]+", value) if part.strip()][:12]
        return []

    for key in (
        "heading_requirements",
        "pagination_requirements",
        "page_break_requirements",
        "table_layout_requirements",
        "figure_layout_requirements",
    ):
        lines = _lines(raw.get(key))
        if lines:
            rules[key] = lines

    if pagination_out and "pagination_requirements" not in rules:
        rules["pagination_requirements"] = list(pagination_out.values())

    return rules
