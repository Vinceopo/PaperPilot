from __future__ import annotations

import io
import re
import zipfile
from pathlib import Path

import fitz
from docx import Document
from docx.oxml.ns import qn


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
                            "italic": bool(int(span.get("flags", 0)) & 2),
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
        },
        "pages": pages,
    }


def _length_inches(value) -> float | None:
    return round(value.inches, 3) if value is not None else None


def _parse_docx(data: bytes) -> dict:
    document = Document(io.BytesIO(data))
    paragraphs: list[dict] = []
    all_lines: list[str] = []
    explicit_page_breaks: list[dict] = []
    line_index = 0
    for paragraph_index, paragraph in enumerate(document.paragraphs):
        runs: list[dict] = []
        for run_index, run in enumerate(paragraph.runs):
            page_break_count = 0
            line_break_count = 0
            for br in run._element.iter(qn("w:br")):
                break_type = br.get(qn("w:type"))
                if break_type == "page":
                    page_break_count += 1
                    explicit_page_breaks.append(
                        {"paragraph_index": paragraph_index, "run_index": run_index}
                    )
                else:
                    line_break_count += 1
            runs.append(
                {
                    "text": run.text,
                    "font": run.font.name,
                    "size": round(run.font.size.pt, 2) if run.font.size else None,
                    "bold": run.bold,
                    "italic": run.italic,
                    "style": run.style.name if run.style else None,
                    "page_breaks": page_break_count,
                    "line_breaks": line_break_count,
                }
            )
        source_lines = paragraph.text.splitlines() or [""]
        lines = []
        for text in source_lines:
            lines.append({"line_index": line_index, "text": text})
            all_lines.append(text)
            line_index += 1
        formatting = paragraph.paragraph_format
        paragraphs.append(
            {
                "paragraph_index": paragraph_index,
                "style": paragraph.style.name if paragraph.style else None,
                "text": paragraph.text,
                "lines": lines,
                "runs": runs,
                "formatting": {
                    "line_spacing": (
                        round(float(formatting.line_spacing), 3)
                        if isinstance(formatting.line_spacing, (int, float))
                        else None
                    ),
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
        )
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
            "pagination_fidelity": "explicit_breaks_only_no_static_layout",
            "pagination_note": (
                "DOCX pagination depends on the rendering engine, fonts, and printer settings; "
                "page locations cannot be inferred reliably without rendering."
            ),
            "explicit_page_break_count": len(explicit_page_breaks),
            "line_indexing": "line_index is document-flow based and zero-based",
        },
        "paragraphs": paragraphs,
        "sections": sections,
        "explicit_page_breaks": explicit_page_breaks,
    }


def derive_mechanics_rules(text: str) -> dict:
    normalized = re.sub(r"[ \t]+", " ", text)
    rules: dict = {}

    known_fonts = (
        "Times New Roman", "Arial", "Calibri", "Cambria", "Georgia",
        "Helvetica", "Courier New", "Garamond", "Verdana",
    )
    fonts = [font for font in known_fonts if re.search(rf"\b{re.escape(font)}\b", normalized, re.I)]
    sizes = sorted(
        {
            float(value)
            for value in re.findall(r"\b(\d{1,2}(?:\.\d+)?)\s*(?:pt|point)s?\b", normalized, re.I)
            if 6 <= float(value) <= 72
        }
    )
    if fonts or sizes:
        rules["font"] = {}
        if fonts:
            rules["font"]["families"] = fonts
        if sizes:
            rules["font"]["sizes_points"] = sizes

    named_paper = re.search(r"\b(A4|letter|legal)\b(?:\s+(?:paper|page|size))?", normalized, re.I)
    dimensions = re.search(
        r"\b(\d+(?:\.\d+)?)\s*(?:inches?|in|″|\")\s*[x×by]+\s*"
        r"(\d+(?:\.\d+)?)\s*(?:inches?|in|″|\")\b",
        normalized,
        re.I,
    )
    if named_paper or dimensions:
        rules["paper_size"] = {}
        if named_paper:
            rules["paper_size"]["name"] = named_paper.group(1).upper()
        if dimensions:
            rules["paper_size"]["width_inches"] = float(dimensions.group(1))
            rules["paper_size"]["height_inches"] = float(dimensions.group(2))

    spacing = re.search(
        r"\b(single|double|one(?:[\s-]and[\s-]a[\s-]half)|1(?:\.0)?|1\.5|2(?:\.0)?)"
        r"(?:[\s-]+line)?[\s-]+spac(?:e|ed|ing)\b",
        normalized,
        re.I,
    )
    if spacing:
        token = spacing.group(1).lower()
        rules["line_spacing"] = (
            1.0 if token in {"single", "1", "1.0"} else
            1.5 if token in {"1.5", "one-and-a-half", "one and a half"} else 2.0
        )

    margins: dict[str, float] = {}
    uniform = re.search(
        r"\b(\d+(?:\.\d+)?)\s*(?:inches?|in|″|\")\s+margins?\b", normalized, re.I
    )
    if uniform:
        margins = {side: float(uniform.group(1)) for side in ("top", "bottom", "left", "right")}
    for side in ("top", "bottom", "left", "right"):
        match = re.search(
            rf"\b{side}\s+margin\s*(?:of|:|=|should be|must be)?\s*"
            r"(\d+(?:\.\d+)?)\s*(?:inches?|in|″|\")",
            normalized,
            re.I,
        )
        if match:
            margins[side] = float(match.group(1))
    if margins:
        rules["margins_inches"] = margins

    indent = re.search(
        r"\b(?:first(?:[\s-]line)?|paragraph)\s+indent(?:ation)?\s*"
        r"(?:of|:|=|should be|must be)?\s*(\d+(?:\.\d+)?)\s*(?:inches?|in|″|\")",
        normalized,
        re.I,
    )
    if indent:
        rules["first_line_indent_inches"] = float(indent.group(1))

    citation = re.search(
        r"\b(APA|MLA|Chicago|Harvard|IEEE|Vancouver|Turabian)\b"
        r"(?:\s+(?:citation|referencing|reference|style|format))?",
        normalized,
        re.I,
    )
    if citation:
        rules["citation_style"] = citation.group(1).upper()

    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+|\n+", text) if part.strip()]
    heading_terms = [
        sentence[:500] for sentence in sentences
        if re.search(r"\b(headings?|section titles?)\b", sentence, re.I)
        and re.search(r"\b(must|shall|required|should|use|format)\b", sentence, re.I)
    ]
    pagination_terms = [
        sentence[:500] for sentence in sentences
        if re.search(r"\b(page numbers?|pagination|numbered pages?)\b", sentence, re.I)
        and re.search(r"\b(must|shall|required|should|use|place|begin|start)\b", sentence, re.I)
    ]
    if heading_terms:
        rules["heading_requirements"] = heading_terms
    if pagination_terms:
        rules["pagination_requirements"] = pagination_terms
    return rules
