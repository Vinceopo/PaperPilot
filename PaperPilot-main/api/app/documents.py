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


def _flatten_mechanics_text(text: str) -> str:
    """Collapse PDF/DOCX layout noise so label:value patterns can be matched."""
    cleaned = (text or "").replace("\r", "\n")
    cleaned = cleaned.replace("\u00a0", " ").replace("\u200b", "")
    # Join hyphenated line-breaks: "Times New-\nRoman" -> "Times NewRoman" then fix later
    cleaned = re.sub(r"-\s*\n\s*", "", cleaned)
    # Treat newlines / bullets as spaces so "Size\n:\n8.5 x 11" becomes searchable.
    cleaned = re.sub(r"[\n\t|•●▪◦]+", " ", cleaned)
    cleaned = re.sub(r"\s*([:：])\s*", r" : ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def _clip_value(value: str, stop_words: tuple[str, ...]) -> str:
    text = (value or "").strip(" \t-:;,.|/\\")
    if not text:
        return ""
    # Stop at the next outline/label boundary when the capture ran long.
    pattern = r"(?i)\s+(?:%s)\b" % "|".join(re.escape(word) for word in stop_words)
    parts = re.split(pattern, text, maxsplit=1)
    return parts[0].strip(" \t-:;,.|/\\")[:200]


def _value_after_label(flat: str, labels: tuple[str, ...], stop_words: tuple[str, ...]) -> str:
    label_alt = "|".join(re.escape(label) for label in labels)
    stop_alt = "|".join(re.escape(word) for word in stop_words)
    match = re.search(
        rf"(?i)\b(?:{label_alt})\b(?:\s*[)\].-]*)?\s*"
        rf"(?:[:：=\-–]|is|are|of|should be|must be)?\s*"
        rf"(.+?)(?=\s{{2,}}|\s+(?:{stop_alt})\b|$)",
        flat,
    )
    if not match:
        # Looser window: label then value within ~60 chars.
        match = re.search(
            rf"(?i)\b(?:{label_alt})\b.{{0,12}}?([A-Za-z0-9][A-Za-z0-9 .\"″'/\-]{{0,80}})",
            flat,
        )
    if not match:
        return ""
    return _clip_value(match.group(1), stop_words)


def _parse_paper_size(value: str) -> dict:
    text = (value or "").strip()
    if not text:
        return {}
    upper = text.upper()
    out: dict = {}
    if re.search(r"\bLEGAL\b", upper) or (re.search(r"8\.5", upper) and re.search(r"\b14\b", upper)):
        out["name"] = "LEGAL"
        out["label"] = "8.5 x 14"
    elif re.search(r"\bA4\b", upper) or re.search(r"8\.27|210\s*[x×]\s*297", upper):
        out["name"] = "A4"
        out["label"] = "8.27 x 11.69"
    elif (
        re.search(r"\bLETTER\b", upper)
        or re.search(r"\bSHORT\s*BOND\b", upper)
        or (re.search(r"8\.5", upper) and re.search(r"\b11\b", upper))
    ):
        out["name"] = "LETTER"
        out["label"] = "8.5 x 11"
    dims = re.search(
        r"(\d+(?:\.\d+)?)\s*(?:inches?|in|″|\")?\s*[x×by]\s*(\d+(?:\.\d+)?)\s*(?:inches?|in|″|\")?",
        text,
        re.I,
    )
    if dims:
        out["width_inches"] = float(dims.group(1))
        out["height_inches"] = float(dims.group(2))
        out.setdefault("label", f"{dims.group(1)} x {dims.group(2)}")
    elif out.get("label"):
        pass
    elif text:
        out["label"] = text[:80]
    return out


def _parse_spacing(value: str) -> float | None:
    text = (value or "").strip().lower()
    if not text:
        return None
    if re.search(r"\bdouble\b", text):
        return 2.0
    if re.search(r"\bsingle\b", text):
        return 1.0
    if re.search(r"one[\s-]+and[\s-]+a[\s-]+half|1\.5", text):
        return 1.5
    number = re.search(r"(\d+(?:\.\d+)?)", text)
    if not number:
        return None
    spacing = float(number.group(1))
    return spacing if spacing in {1.0, 1.5, 2.0} else spacing if 0.5 <= spacing <= 3 else None


def _parse_inches(value: str) -> float | None:
    text = (value or "").strip().lower()
    if not text:
        return None
    if re.search(r"\bone\s+inch\b", text):
        return 1.0
    if re.search(r"\bhalf\s*(?:an?\s*)?inch\b|½", text):
        return 0.5
    if re.search(r"\bone\s+tab\b|\btab\b", text):
        return 0.5
    number = re.search(r"(\d+(?:\.\d+)?)", text)
    if not number:
        return None
    amount = float(number.group(1))
    return amount if 0 <= amount <= 5 else None


def derive_mechanics_rules(text: str) -> dict:
    """Extract editable format rules from a mechanics guide's plain text.

    Handles Capstone-style outlines where PDF extraction splits labels and values
    onto separate lines (e.g. \"Size\\n:\\n8.5 x 11\").
    """
    flat = _flatten_mechanics_text(text)
    rules: dict = {}
    if not flat:
        return rules

    stop = (
        "Size", "Orientation", "Substance", "Spacing", "Indention", "Indentation",
        "Margins", "Margin", "Font", "Type", "Color", "Pagination", "Citation",
        "Heading", "Table", "Figure", "Page", "Top", "Bottom", "Left", "Right",
        "Gutter", "Header", "Footer", "Paper", "a.", "b.", "c.", "d.", "e.",
        "i.", "ii.", "iii.", "iv.", "v.", "vi.",
    )

    paper: dict = {}
    size_raw = _value_after_label(flat, ("Size", "Paper size", "Page size"), stop)
    size_info = _parse_paper_size(size_raw) if size_raw else {}
    if not size_info:
        # Global fallbacks when the guide never uses an explicit Size label.
        size_info = _parse_paper_size(flat)
    if size_info.get("label"):
        paper["size"] = size_info["label"]
    paper_size: dict = {}
    if size_info.get("name"):
        paper_size["name"] = size_info["name"]
    if size_info.get("width_inches") and size_info.get("height_inches"):
        paper_size["width_inches"] = size_info["width_inches"]
        paper_size["height_inches"] = size_info["height_inches"]
    if paper_size:
        rules["paper_size"] = paper_size

    orientation = _value_after_label(flat, ("Orientation", "Page orientation"), stop)
    if orientation:
        if re.search(r"landscape", orientation, re.I):
            paper["orientation"] = "Landscape"
        elif re.search(r"portrait", orientation, re.I):
            paper["orientation"] = "Portrait"
    elif re.search(r"\blandscape\b", flat, re.I):
        paper["orientation"] = "Landscape"
    else:
        paper["orientation"] = "Portrait"

    substance = _value_after_label(
        flat, ("Substance", "Paper substance", "Paper weight", "Basis weight", "gsm"), stop
    )
    if substance:
        number = re.search(r"(\d+(?:\.\d+)?)", substance)
        paper["substance"] = number.group(1) if number else substance[:40]

    if paper:
        rules["paper"] = paper

    spacing_raw = _value_after_label(
        flat, ("Spacing", "Line spacing", "Line space", "Lines spacing"), stop
    )
    spacing_val = _parse_spacing(spacing_raw) if spacing_raw else None
    if spacing_val is None:
        spacing_match = re.search(
            r"\b(single|double|one(?:[\s-]and[\s-]a[\s-]half)|1(?:\.0)?|1\.5|2(?:\.0)?)"
            r"(?:[\s-]+line)?[\s-]+spac(?:e|ed|ing)\b",
            flat,
            re.I,
        )
        if spacing_match:
            spacing_val = _parse_spacing(spacing_match.group(0))
    if spacing_val is not None:
        rules["line_spacing"] = spacing_val
        rules["spacing"] = str(spacing_val).rstrip("0").rstrip(".") if isinstance(spacing_val, float) else str(spacing_val)
        if rules["spacing"] == "1":
            rules["spacing"] = "1"
        elif spacing_val == 1.5:
            rules["spacing"] = "1.5"
        elif spacing_val == 2.0:
            rules["spacing"] = "2"

    indent_raw = _value_after_label(
        flat,
        ("Indention", "Indentation", "First-line indent", "First line indent", "Paragraph indent"),
        stop,
    )
    indent_val = _parse_inches(indent_raw) if indent_raw else None
    if indent_val is None:
        indent_match = re.search(
            r"\b(?:first(?:[\s-]line)?|paragraph)\s+indent(?:ation|ion)?\s*"
            r"(?:of|:|=|should be|must be)?\s*(\d+(?:\.\d+)?)\s*(?:inches?|in|″|\")?",
            flat,
            re.I,
        )
        if indent_match:
            indent_val = float(indent_match.group(1))
        elif re.search(r"\bone\s+tab\b|\bindent(?:ation|ion)?\s*(?:of|:)?\s*one\s+tab\b", flat, re.I):
            indent_val = 0.5
    if indent_val is not None:
        rules["first_line_indent_inches"] = indent_val
        rules["indention"] = f"{indent_val} inch" if indent_val != 1 else "1 inch"

    margins: dict[str, float] = {}
    for side in ("top", "bottom", "left", "right", "gutter", "header", "footer"):
        side_raw = _value_after_label(
            flat,
            (f"{side.capitalize()} margin", f"{side} margin", side.capitalize(), side),
            stop,
        )
        amount = _parse_inches(side_raw) if side_raw else None
        if amount is None:
            match = re.search(
                rf"\b{side}\s+margin\s*(?:of|:|=|should be|must be)?\s*"
                r"(\d+(?:\.\d+)?)\s*(?:inches?|in|″|\")?",
                flat,
                re.I,
            )
            if match:
                amount = float(match.group(1))
        if amount is not None:
            margins[side] = amount
    if not margins:
        uniform = re.search(
            r"\b(\d+(?:\.\d+)?)\s*(?:inches?|in|″|\")\s+(?:on\s+all\s+sides\s+)?margins?\b"
            r"|\bmargins?\s*(?:of|:|=)?\s*(\d+(?:\.\d+)?)\s*(?:inches?|in|″|\")\s*(?:on\s+all\s+sides)?",
            flat,
            re.I,
        )
        if uniform:
            amount = float(next(group for group in uniform.groups() if group))
            margins = {side: amount for side in ("top", "bottom", "left", "right")}
    if margins:
        rules["margins_inches"] = margins

    known_fonts = (
        "Times New Roman", "Arial", "Calibri", "Cambria", "Georgia",
        "Helvetica", "Courier New", "Garamond", "Verdana",
    )
    fonts = [font for font in known_fonts if re.search(rf"\b{re.escape(font)}\b", flat, re.I)]
    font_type = _value_after_label(flat, ("Font type", "Font", "Typeface", "Type"), stop)
    if font_type:
        for font in known_fonts:
            if re.search(rf"\b{re.escape(font)}\b", font_type, re.I):
                if font not in fonts:
                    fonts.insert(0, font)
                break
    sizes = sorted(
        {
            float(value)
            for value in re.findall(r"\b(\d{1,2}(?:\.\d+)?)\s*(?:pt|point)s?\b", flat, re.I)
            if 6 <= float(value) <= 72
        }
    )
    h1 = _value_after_label(flat, ("Heading 1", "Heading1", "H1"), stop)
    h2 = _value_after_label(flat, ("Heading 2", "Heading2", "H2"), stop)
    h3 = _value_after_label(
        flat, ("Heading 3", "Heading3", "H3", "Content size", "Body size", "Body font size"), stop
    )

    def _nearby_pt(labels: tuple[str, ...]) -> float | None:
        label_alt = "|".join(re.escape(label) for label in labels)
        match = re.search(
            rf"(?i)\b(?:{label_alt})\b.{{0,48}}?(\d{{1,2}}(?:\.\d+)?)\s*(?:pt|point)?s?\b",
            flat,
        )
        if not match:
            return None
        number = float(match.group(1))
        return number if 6 <= number <= 72 else None

    font: dict = {}
    if fonts:
        font["families"] = fonts
        font["type"] = fonts[0]
    if sizes:
        font["sizes_points"] = sizes
    for raw, key, labels in (
        (h1, "heading1_size", ("Heading 1", "Heading1", "H1")),
        (h2, "heading2_size", ("Heading 2", "Heading2", "H2")),
        (h3, "heading3_content_size", ("Heading 3", "Heading3", "H3", "Content size", "Body size")),
    ):
        number = re.search(r"(\d+(?:\.\d+)?)", raw or "")
        value = float(number.group(1)) if number and 6 <= float(number.group(1)) <= 72 else None
        if value is None:
            value = _nearby_pt(labels)
        if value is not None:
            font[key] = value
            sizes = sorted(set([*sizes, value]))
            font["sizes_points"] = sizes
    font_color = _value_after_label(flat, ("Font color", "Text color", "Color"), stop)
    if font_color:
        if re.search(r"black|automatic", font_color, re.I):
            font["color"] = "Black/Automatic"
        else:
            font["color"] = font_color[:40]
    else:
        font.setdefault("color", "Black/Automatic")
    if font:
        rules["font"] = font

    pagination: dict = {}
    if re.search(r"\btop\s+right\b", flat, re.I):
        pagination["position"] = "Top right"
    elif re.search(r"\btop\s+center\b|\btop\s+centre\b", flat, re.I):
        pagination["position"] = "Top center"
    elif re.search(r"\bbottom\s+right\b", flat, re.I):
        pagination["position"] = "Bottom right"
    elif re.search(r"\bbottom\s+center\b|\bbottom\s+centre\b", flat, re.I):
        pagination["position"] = "Bottom center"
    else:
        position = _value_after_label(
            flat, ("Page number position", "Page numbers", "Pagination position"), stop
        )
        if position:
            pagination["position"] = position[:120]
    first_page = _value_after_label(
        flat,
        ("First page of each chapter", "First page", "Chapter first page"),
        stop,
    )
    if first_page:
        pagination["first_page_of_chapter"] = first_page[:160]
    elif re.search(r"no page number.*(chapter|first page)|first page.*no page number", flat, re.I):
        pagination["first_page_of_chapter"] = "No page number shown"
    if pagination:
        rules["pagination"] = pagination
        rules["pagination_requirements"] = list(pagination.values())

    page_breaks = _value_after_label(flat, ("Page breaks", "Page break rules", "Page break"), stop)
    page_breaks = _clip_value(page_breaks, stop)
    # Reject truncated scraps like "Do" from "Do not …" cut by a stop word.
    if page_breaks and (len(page_breaks) < 12 or len(page_breaks.split()) < 3):
        page_breaks = ""
    if not page_breaks:
        sentence = re.search(
            r"(?i)((?:insert\s+a\s+)?page\s+breaks?[^.!?\n]{10,220}[.!?]?"
            r"|(?:do\s+not|only|never|always)[^.!?\n]{0,40}page\s+break[^.!?\n]{5,180}[.!?]?)",
            flat,
        )
        if sentence:
            page_breaks = _clip_value(sentence.group(1), stop)
            if page_breaks and (len(page_breaks) < 12 or len(page_breaks.split()) < 3):
                page_breaks = ""
    if page_breaks:
        rules["page_break_requirements"] = [page_breaks[:300]]
    elif re.search(r"page break.*(?:new chapter|chapter)|(?:new chapter|chapter).*page break", flat, re.I):
        rules["page_break_requirements"] = ["Only when starting a new chapter"]

    table_layout = _value_after_label(flat, ("Table layout", "Tables", "Table naming", "Table"), stop)
    if table_layout and len(table_layout) > 3:
        rules["table_layout_requirements"] = [table_layout[:300]]

    figure_layout = _value_after_label(
        flat, ("Figure layout", "Figures", "Figure naming", "Figure"), stop
    )
    if figure_layout and len(figure_layout) > 3:
        rules["figure_layout_requirements"] = [figure_layout[:300]]

    citation = re.search(
        r"\b(APA|MLA|Chicago|Harvard|IEEE|Vancouver|Turabian)\b"
        r"(?:\s*(?:7th|6th|style|format|citation|referencing))?",
        flat,
        re.I,
    )
    if citation:
        rules["citation_style"] = citation.group(1).upper()
    else:
        citation_raw = _value_after_label(
            flat, ("Citation format", "Citation style", "Citation", "Reference style"), stop
        )
        if citation_raw:
            style = re.search(r"\b(APA|MLA|Chicago|Harvard|IEEE|Vancouver|Turabian)\b", citation_raw, re.I)
            if style:
                rules["citation_style"] = style.group(1).upper()

    return rules


def normalize_mechanics_rules(raw: dict | None) -> dict:
    """Sanitize client-edited rules into the shape used by compliance checks."""
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
            # Preserve order while unique-ing
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

