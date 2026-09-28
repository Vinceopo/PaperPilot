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
from docx.shared import Length
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


def parse_document(data: bytes, file_type: str, on_progress=None) -> dict:
    try:
        if file_type == "pdf":
            return _parse_pdf(data, on_progress=on_progress)
        if on_progress:
            on_progress(0, 1)
        parsed = _parse_docx(data)
        if on_progress:
            on_progress(1, 1)
        return parsed
    except DocumentError:
        raise
    except Exception as exc:
        raise DocumentError("The document could not be parsed.") from exc


def _parse_pdf(data: bytes, on_progress=None) -> dict:
    pages: list[dict] = []
    all_text: list[str] = []
    with fitz.open(stream=data, filetype="pdf") as document:
        if document.needs_pass:
            raise DocumentError("Password-protected PDFs are not supported.")
        total_pages = max(document.page_count, 1)
        for page_index in range(document.page_count):
            if on_progress:
                on_progress(page_index + 1, total_pages)
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
            lines = _merge_pdf_rows(lines, page_index)
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


PAGE_FIELD_RE = re.compile(r"(?<![A-Z])PAGE(?![A-Z])")


def _has_page_field(element) -> bool:
    for instr in element.iter(qn("w:instrText")):
        if PAGE_FIELD_RE.search(instr.text or ""):
            return True
    return any(PAGE_FIELD_RE.search(fld.get(qn("w:instr")) or "") for fld in element.iter(qn("w:fldSimple")))


def _page_field_alignment(paragraph_el) -> str:
    ppr = paragraph_el.find(qn("w:pPr"))
    jc = ppr.find(qn("w:jc")) if ppr is not None else None
    value = jc.get(qn("w:val")) if jc is not None else None
    if value in ("right", "end"):
        return "right"
    if value == "center":
        return "center"
    # Header/Footer styles place text with tab stops: one tab reaches the centre, two reach the right.
    tabs = 0
    for node in paragraph_el.iter():
        if node.tag == qn("w:tab") and node.getparent() is not None and node.getparent().tag == qn("w:r"):
            tabs += 1
        if node.tag in (qn("w:instrText"), qn("w:fldSimple")):
            break
    return "right" if tabs >= 2 else "center" if tabs == 1 else "left"


EMU_PER_INCH = 914400


def _anchor_alignment(field_el, section) -> str | None:
    """Page numbers often sit in a floating text box; use where that box is pinned on the page."""
    anchor = next((node for node in field_el.iterancestors() if node.tag == qn("wp:anchor")), None)
    position = anchor.find(qn("wp:positionH")) if anchor is not None else None
    if position is None:
        return None
    align = position.find(qn("wp:align"))
    if align is not None and align.text:
        return {"right": "right", "outside": "right", "center": "center"}.get(align.text.strip(), "left")
    offset = position.find(qn("wp:posOffset"))
    if offset is None or not (offset.text or "").strip().lstrip("-").isdigit():
        return None
    try:
        page_width = section.page_width.inches
        left_margin = section.left_margin.inches
    except Exception:
        page_width, left_margin = 8.5, 1.0
    x = int(offset.text) / EMU_PER_INCH
    if position.get("relativeFrom") in ("margin", "column", "leftMargin"):
        x += left_margin if position.get("relativeFrom") != "leftMargin" else 0.0
    extent = anchor.find(qn("wp:extent"))
    box = int(extent.get("cx") or 0) / EMU_PER_INCH if extent is not None else 0.0
    centre = (x + box / 2) / max(1.0, page_width)
    return "right" if centre >= 0.6 else "center" if centre >= 0.4 else "left"


def _page_field_elements(element):
    for instr in element.iter(qn("w:instrText")):
        if PAGE_FIELD_RE.search(instr.text or ""):
            yield instr
    for fld in element.iter(qn("w:fldSimple")):
        if PAGE_FIELD_RE.search(fld.get(qn("w:instr")) or ""):
            yield fld


def _page_number_setup(section) -> dict | None:
    """Where Word prints the page number for this section (header/footer PAGE field)."""
    for where, part in (("header", section.header), ("footer", section.footer)):
        try:
            element = part._element
        except Exception:
            continue
        for field_el in _page_field_elements(element):
            paragraph_el = next((node for node in field_el.iterancestors() if node.tag == qn("w:p")), None)
            if paragraph_el is None:
                continue
            hidden_first = False
            try:
                if section.different_first_page_header_footer:
                    first = section.first_page_header if where == "header" else section.first_page_footer
                    hidden_first = not _has_page_field(first._element)
            except Exception:
                hidden_first = False
            align = _anchor_alignment(field_el, section) or _page_field_alignment(paragraph_el)
            return {"where": where, "align": align, "first_page_hidden": hidden_first}
    return None


def _xml_paragraph_height(paragraph_el) -> float:
    """Inches one header/footer paragraph occupies in the flow (floating shapes don't count)."""
    sizes = [
        int(node.get(qn("w:val")) or 0) / 2
        for node in paragraph_el.iter(qn("w:sz"))
        if (node.get(qn("w:val")) or "").isdigit()
    ]
    height = max(sizes or [11.0]) * LINE_HEIGHT_FACTOR / 72
    for inline in paragraph_el.iter(qn("wp:inline")):
        extent = inline.find(qn("wp:extent"))
        if extent is not None and (extent.get("cy") or "").isdigit():
            height = max(height, int(extent.get("cy")) / EMU_PER_INCH)
    ppr = paragraph_el.find(qn("w:pPr"))
    spacing = ppr.find(qn("w:spacing")) if ppr is not None else None
    if spacing is not None:
        for key in ("w:before", "w:after"):
            value = spacing.get(qn(key)) or ""
            if value.isdigit():
                height += int(value) / TWIPS_PER_INCH
    return height


def _xml_blocks_height(container) -> float:
    total = 0.0
    for child in container.iterchildren():
        if child.tag == qn("w:p"):
            total += _xml_paragraph_height(child)
        elif child.tag == qn("w:tbl"):
            for row in child.iter(qn("w:tr")):
                total += max((_xml_blocks_height(cell) for cell in row.iter(qn("w:tc"))), default=0.0)
        elif child.tag == qn("w:sdt"):
            content = child.find(qn("w:sdtContent"))
            if content is not None:
                total += _xml_blocks_height(content)
    return total


def _body_edges(sections) -> list[tuple[float | None, float | None]]:
    """Where body text really starts/ends: Word pushes it past a header/footer taller than the margin."""
    edges = []
    inherited = [0.0, 0.0]
    for section in sections:
        pair: list[float | None] = []
        for slot, (margin, distance, part) in enumerate(
            (
                (section.top_margin, section.header_distance, section.header),
                (section.bottom_margin, section.footer_distance, section.footer),
            )
        ):
            try:
                if not part.is_linked_to_previous:
                    inherited[slot] = _xml_blocks_height(part._element)
            except Exception:
                pass
            base = _length_inches(margin)
            content = inherited[slot]
            reach = (_length_inches(distance) or 0.0) + content if content else 0.0
            pair.append(round(max(base or 0.0, reach), 3) if base is not None else None)
        edges.append((pair[0], pair[1]))
    return edges


def _merge_pdf_rows(lines: list[dict], page_index: int) -> list[dict]:
    """Join fragments on one printed row (justified text is emitted word by word)."""
    rows: list[list[dict]] = []
    for line in sorted(lines, key=lambda item: ((item["bbox"] or [0, 0])[1], (item["bbox"] or [0])[0])):
        bbox = line.get("bbox") or []
        if len(bbox) < 4:
            rows.append([line])
            continue
        height = max(1.0, bbox[3] - bbox[1])
        middle = (bbox[1] + bbox[3]) / 2
        placed = False
        for row in reversed(rows[-3:]):
            ref = row[0].get("bbox") or []
            if len(ref) < 4:
                continue
            ref_height = max(1.0, ref[3] - ref[1])
            overlap = min(bbox[3], ref[3]) - max(bbox[1], ref[1])
            if overlap >= 0.6 * min(height, ref_height) and abs(middle - (ref[1] + ref[3]) / 2) <= 0.35 * max(height, ref_height):
                row.append(line)
                placed = True
                break
        if not placed:
            rows.append([line])

    merged: list[dict] = []
    for row in rows:
        row.sort(key=lambda item: (item.get("bbox") or [0])[0])
        boxes = [item["bbox"] for item in row if len(item.get("bbox") or []) >= 4]
        sizes = [span["size"] for item in row for span in item["spans"] if span.get("size")]
        em = max(6.0, sorted(sizes)[len(sizes) // 2]) if sizes else 11.0
        # Word gaps in justified text stay under ~1 em; wider gaps separate table cells.
        cell_gaps = sum(1 for prev, nxt in zip(boxes, boxes[1:]) if nxt[0] - prev[2] > 1.6 * em)
        merged.append(
            {
                "page_index": page_index,
                "line_index": len(merged),
                "text": " ".join(item["text"] for item in row),
                "spans": [span for item in row for span in item["spans"]],
                "table_row": cell_gaps >= 1,
                "bbox": [
                    min(box[0] for box in boxes),
                    min(box[1] for box in boxes),
                    max(box[2] for box in boxes),
                    max(box[3] for box in boxes),
                ]
                if boxes
                else row[0].get("bbox"),
            }
        )
    return merged


def _length_inches(value) -> float | None:
    return round(value.inches, 3) if value is not None else None


LINE_HEIGHT_FACTOR = 1.15  # single-spaced line height as a multiple of the font size
TWIPS_PER_INCH = 1440
_DOC_DEFAULTS: dict[int, dict] = {}


def _paragraph_formats(paragraph) -> list:
    """Direct paragraph formatting first, then each style it inherits from."""
    formats = [paragraph.paragraph_format]
    try:
        style = paragraph.style
    except Exception:
        style = None
    depth = 0
    while style is not None and depth < 12:
        try:
            formats.append(style.paragraph_format)
            style = style.base_style
        except Exception:
            break
        depth += 1
    return formats


def _first_set(formats: list, attr: str):
    for fmt in formats:
        try:
            value = getattr(fmt, attr)
        except Exception:
            continue
        if value is not None:
            return value
    return None


def _docx_defaults(paragraph) -> dict:
    """Paragraph defaults from styles.xml (w:docDefaults), used when nothing else sets a value."""
    try:
        styles_el = paragraph.part.package.main_document_part.styles.element
    except Exception:
        return {}
    key = id(styles_el)
    if key in _DOC_DEFAULTS:
        return _DOC_DEFAULTS[key]
    defaults: dict = {}
    ppr = styles_el.find(f"{qn('w:docDefaults')}/{qn('w:pPrDefault')}/{qn('w:pPr')}")
    if ppr is not None:
        spacing = ppr.find(qn("w:spacing"))
        if spacing is not None and spacing.get(qn("w:line")):
            defaults["line"] = int(spacing.get(qn("w:line")))
            defaults["line_rule"] = spacing.get(qn("w:lineRule")) or "auto"
        ind = ppr.find(qn("w:ind"))
        if ind is not None:
            def twips(*names):
                for name in names:
                    raw = ind.get(qn(f"w:{name}"))
                    if raw not in (None, ""):
                        return int(raw) / TWIPS_PER_INCH
                return None

            first = twips("firstLine")
            hanging = twips("hanging")
            defaults["first_line"] = -hanging if hanging else first
            defaults["left"] = twips("left", "start")
            defaults["right"] = twips("right", "end")
        jc = ppr.find(qn("w:jc"))
        if jc is not None:
            defaults["jc"] = jc.get(qn("w:val"))
    _DOC_DEFAULTS[key] = defaults
    return defaults


def _docx_alignment(paragraph, formats: list | None = None) -> str:
    align = _first_set(formats or _paragraph_formats(paragraph), "alignment")
    mapping = {
        WD_ALIGN_PARAGRAPH.LEFT: "left",
        WD_ALIGN_PARAGRAPH.CENTER: "center",
        WD_ALIGN_PARAGRAPH.RIGHT: "right",
        WD_ALIGN_PARAGRAPH.JUSTIFY: "justify",
    }
    if align in mapping:
        return mapping[align]
    jc = _docx_defaults(paragraph).get("jc")
    return {"center": "center", "right": "right", "end": "right", "both": "justify"}.get(jc or "", "left")


def _docx_line_spacing(paragraph, formats: list | None = None, font_pt: float | None = None) -> float:
    """Line spacing as a multiple of single spacing (1.0, 1.5, 2.0, ...)."""
    size = max(6.0, float(font_pt or 12.0))
    for fmt in formats or _paragraph_formats(paragraph):
        try:
            value = fmt.line_spacing
            rule = fmt.line_spacing_rule
        except Exception:
            continue
        if value is None:
            continue
        if rule == WD_LINE_SPACING.ONE_POINT_FIVE:
            return 1.5
        if rule == WD_LINE_SPACING.DOUBLE:
            return 2.0
        if rule == WD_LINE_SPACING.SINGLE:
            return 1.0
        if isinstance(value, Length):
            return round(value.pt / (size * LINE_HEIGHT_FACTOR), 3)
        return round(float(value), 3)
    defaults = _docx_defaults(paragraph)
    if defaults.get("line"):
        if defaults.get("line_rule") in ("exact", "atLeast"):
            return round((defaults["line"] / 20) / (size * LINE_HEIGHT_FACTOR), 3)
        return round(defaults["line"] / 240, 3)
    return 1.0


def _docx_indents(paragraph, formats: list | None = None) -> tuple[float, float, float]:
    """(first-line, left, right) indents in inches, following styles and document defaults."""
    formats = formats or _paragraph_formats(paragraph)
    defaults = _docx_defaults(paragraph)

    def pick(attr: str, fallback_key: str) -> float:
        value = _first_set(formats, attr)
        if value is not None:
            return round(value.inches, 3)
        return round(float(defaults.get(fallback_key) or 0.0), 3)

    return pick("first_line_indent", "first_line"), pick("left_indent", "left"), pick("right_indent", "right")


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
    formats = _paragraph_formats(paragraph)
    run_sizes = [run["size"] for run in runs if run.get("size") and str(run.get("text") or "").strip()]
    first_line, left_indent, right_indent = _docx_indents(paragraph, formats)
    record = {
        "paragraph_index": paragraph_index,
        "source": source,
        "style": paragraph.style.name if paragraph.style else None,
        "text": paragraph.text,
        "lines": lines,
        "runs": runs,
        "formatting": {
            "line_spacing": _docx_line_spacing(paragraph, formats, run_sizes[0] if run_sizes else None),
            "alignment": _docx_alignment(paragraph, formats),
            "space_before_points": (
                round(formatting.space_before.pt, 2) if formatting.space_before else None
            ),
            "space_after_points": (
                round(formatting.space_after.pt, 2) if formatting.space_after else None
            ),
            "first_line_indent_inches": first_line,
            "left_indent_inches": left_indent,
            "right_indent_inches": right_indent,
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

    body_edges = _body_edges(document.sections)
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
            "body_top_inches": body_edges[index][0],
            "body_bottom_inches": body_edges[index][1],
            "page_number": _page_number_setup(section),
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


UNICODE_FRACTIONS = {"½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625}
WORD_NUMBERS = {"half": 0.5, "one": 1.0, "two": 2.0, "three": 3.0}
UNIT_TO_INCHES = {"cm": 1 / 2.54, "mm": 1 / 25.4, "pt": 1 / 72, "point": 1 / 72, "points": 1 / 72}


def parse_length_inches(value) -> float | None:
    """'1.5', '1 ½ inches', '1/2"', '2.54 cm', '25 mm', 'one inch', 'one tab' -> inches."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        number = float(value)
        return number if 0 <= number <= 5 else None
    text = str(value or "").strip().lower().replace(",", ".")
    if not text:
        return None
    if re.search(r"\b(?:one\s+)?tab\b", text):
        return 0.5
    amount = None
    unit_text = text
    mixed = re.search(r"(\d+)\s+(\d+)\s*/\s*(\d+)", text)
    fraction = re.search(r"(\d+)\s*/\s*(\d+)", text)
    glyph = re.search(r"(\d+)?\s*([½¼¾⅓⅔⅛⅜⅝])", text)
    decimal = re.search(r"\d+(?:\.\d+)?", text)
    if mixed and int(mixed.group(3)):
        amount = int(mixed.group(1)) + int(mixed.group(2)) / int(mixed.group(3))
        unit_text = text[mixed.end():]
    elif glyph:
        amount = float(glyph.group(1) or 0) + UNICODE_FRACTIONS[glyph.group(2)]
        unit_text = text[glyph.end():]
    elif fraction and int(fraction.group(2)):
        amount = int(fraction.group(1)) / int(fraction.group(2))
        unit_text = text[fraction.end():]
    elif decimal:
        amount = float(decimal.group(0))
        unit_text = text[decimal.end():]
    else:
        words = re.search(r"\b(half|one|two|three)(?:\s+and\s+a\s+half)?\b", text)
        if words:
            amount = WORD_NUMBERS[words.group(1)] + (0.5 if "and a half" in words.group(0) else 0.0)
            unit_text = text[words.end():]
    if amount is None:
        return None
    unit = re.match(r"\s*(cm|mm|points?|pt)\b", unit_text)
    if unit:
        amount *= UNIT_TO_INCHES[unit.group(1)]
    amount = round(amount, 4)
    return amount if 0 <= amount <= 5 else None


def parse_line_spacing(value) -> float | None:
    """'Double', 'single', '1.5 lines', 'one and a half', '1.15' -> a line-spacing multiple."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        number = float(value)
        return number if 0.8 <= number <= 3.0 else None
    text = str(value or "").strip().lower().replace(",", ".")
    if not text:
        return None
    if re.search(r"\bdouble\b", text):
        return 2.0
    if re.search(r"\bsingle\b", text):
        return 1.0
    if re.search(r"one[\s-]+and[\s-]+a[\s-]+half|1\s*½", text):
        return 1.5
    if re.search(r"\d\s*(?:pt|points?)\b", text):
        return None
    number = re.search(r"\d+(?:\.\d+)?", text)
    if not number:
        return None
    spacing = float(number.group(0))
    return spacing if 0.8 <= spacing <= 3.0 else None


def parse_alignment(value) -> str | None:
    text = str(value or "").strip().lower()
    if not text:
        return None
    if re.search(r"justif|\bfull\b|\bboth\b", text):
        return "justify"
    if re.search(r"cent(?:er|re)", text):
        return "center"
    if re.search(r"\bright\b", text):
        return "right"
    if re.search(r"\bleft\b", text):
        return "left"
    return None


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

    # The text the user typed ("Double", "1/2 inch", "1.27 cm") is the source of truth over a pre-parsed number.
    spacing_text = str(raw.get("spacing") or "").strip()
    spacing = parse_line_spacing(spacing_text) if spacing_text else None
    if spacing is None:
        spacing = parse_line_spacing(raw.get("line_spacing"))
    if spacing_text:
        rules["spacing"] = spacing_text[:80]
    if spacing is not None:
        rules["line_spacing"] = spacing
        rules.setdefault("spacing", f"{spacing:g}")

    indention = str(raw.get("indention") or "").strip()
    if indention:
        rules["indention"] = indention[:120]
    indent = parse_length_inches(indention) if indention else None
    if indent is None:
        indent = parse_length_inches(raw.get("first_line_indent_inches"))
    if indent is not None and indent <= 2:
        rules["first_line_indent_inches"] = indent

    alignment = parse_alignment(raw.get("alignment") or raw.get("text_alignment"))
    if alignment:
        rules["alignment"] = alignment

    margins_in = raw.get("margins_inches") if isinstance(raw.get("margins_inches"), dict) else {}
    margins: dict[str, float] = {}
    for side in ("top", "bottom", "left", "right", "gutter", "header", "footer"):
        number = parse_length_inches(margins_in.get(side, raw.get(f"margin_{side}")))
        if number is not None:
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
