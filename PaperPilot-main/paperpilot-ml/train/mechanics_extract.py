"""Turn labeled format-guide sentences into PaperPilot mechanics rules."""

from __future__ import annotations

import re

import joblib

from train.data_loader import clean_text
from train.mechanics_loader import MODEL_PATH

KNOWN_FONTS = (
    "Times New Roman",
    "Arial",
    "Calibri",
    "Cambria",
    "Georgia",
    "Helvetica",
    "Courier New",
    "Garamond",
    "Verdana",
)


def split_guide_sentences(text: str) -> list[str]:
    cleaned = (text or "").replace("\r", "\n")
    parts = re.split(r"(?<=[.!?])\s+|\n+", cleaned)
    sentences = [clean_text(part) for part in parts if clean_text(part)]
    return [sentence for sentence in sentences if 8 <= len(sentence) <= 400]


def _inches(text: str) -> float | None:
    match = re.search(r"(\d+(?:\.\d+)?)\s*(?:inches?|in|″|\")?", text, re.I)
    if not match:
        return None
    value = float(match.group(1))
    return value if 0 <= value <= 5 else None


def _points(text: str) -> float | None:
    match = re.search(r"(\d{1,2}(?:\.\d+)?)\s*(?:pt|points?)?", text, re.I)
    if not match:
        return None
    value = float(match.group(1))
    return value if 6 <= value <= 72 else None


def _spacing(text: str) -> float | None:
    lowered = text.lower()
    if re.search(r"\b1\.5\b|one[\s-]+and[\s-]+a[\s-]+half", lowered):
        return 1.5
    if re.search(r"\bdouble\b|\b2(?:\.0)?\b", lowered):
        return 2.0
    if re.search(r"\bsingle\b|\b1(?:\.0)?\b", lowered) and "1.5" not in lowered:
        return 1.0
    return None


def parse_rule_value(source_text: str, rule_type: str) -> str:
    text = source_text or ""
    lowered = text.lower()
    if rule_type == "font_family":
        for font in KNOWN_FONTS:
            if re.search(rf"\b{re.escape(font)}\b", text, re.I):
                return font
    if rule_type in {
        "font_size",
        "font_size_heading1",
        "font_size_heading2",
        "font_size_content",
    }:
        points = _points(text)
        if points is not None:
            return f"{points:g}pt"
    if rule_type == "line_spacing":
        spacing = _spacing(text)
        if spacing == 2.0:
            return "double"
        if spacing == 1.0:
            return "single"
        if spacing == 1.5:
            return "1.5"
    if rule_type.startswith("margin_") or rule_type == "paragraph_indent":
        inches = _inches(text)
        if inches is not None:
            return f"{inches:g} inch" if inches != 1 else "1 inch"
        if rule_type == "paragraph_indent" and re.search(r"\bone\s+tab\b", lowered):
            return "0.5 inch"
    if rule_type == "citation_style":
        match = re.search(r"\b(APA|MLA|IEEE|Chicago|Harvard)\b", text, re.I)
        if match:
            return match.group(1).upper()
    if rule_type == "paper_size":
        if re.search(r"8\.5\s*[x×]\s*11", text, re.I):
            return "8.5 x 11 inches"
        if re.search(r"\ba4\b", lowered):
            return "A4"
    if rule_type == "paper_orientation":
        if "landscape" in lowered:
            return "landscape"
        if "portrait" in lowered:
            return "portrait"
    if rule_type == "paper_substance":
        match = re.search(r"\b(\d{2,3})\b", text)
        if match:
            return match.group(1)
    if rule_type == "font_color":
        if re.search(r"black|automatic", lowered):
            return "black (automatic)"
    if rule_type in {"pagination", "pagination_position"}:
        if re.search(r"top\s+right", lowered):
            return "top right"
        if re.search(r"bottom\s+center|bottom\s+centre", lowered):
            return "bottom center"
    if rule_type == "pagination_first_page":
        return "hidden on first page of chapter"
    if rule_type == "page_break":
        return "new page per chapter"
    return ""


def apply_predicted_rule(rules: dict, rule_type: str, source_text: str) -> dict:
    value = parse_rule_value(source_text, rule_type)
    if rule_type == "font_family" and value:
        font = dict(rules.get("font") or {})
        families = list(font.get("families") or [])
        if value not in families:
            families.insert(0, value)
        font["families"] = families
        font["type"] = families[0]
        rules["font"] = font
    elif rule_type == "font_size" and value:
        points = _points(value)
        if points is not None:
            font = dict(rules.get("font") or {})
            sizes = list(font.get("sizes_points") or [])
            if points not in sizes:
                sizes.append(points)
            font["sizes_points"] = sizes
            rules["font"] = font
    elif rule_type == "font_size_heading1" and value:
        points = _points(value)
        if points is not None:
            font = dict(rules.get("font") or {})
            font["heading1_size"] = points
            rules["font"] = font
    elif rule_type == "font_size_heading2" and value:
        points = _points(value)
        if points is not None:
            font = dict(rules.get("font") or {})
            font["heading2_size"] = points
            rules["font"] = font
    elif rule_type == "font_size_content" and value:
        points = _points(value)
        if points is not None:
            font = dict(rules.get("font") or {})
            font["heading3_content_size"] = points
            rules["font"] = font
    elif rule_type == "font_color":
        font = dict(rules.get("font") or {})
        font["color"] = "Black/Automatic"
        rules["font"] = font
    elif rule_type == "line_spacing" and value:
        mapping = {"double": 2.0, "single": 1.0, "1.5": 1.5}
        spacing = mapping.get(value, _spacing(source_text))
        if spacing is not None:
            rules["line_spacing"] = spacing
            rules["spacing"] = "1.5" if spacing == 1.5 else str(int(spacing) if spacing in {1.0, 2.0} else spacing)
    elif rule_type == "paragraph_indent":
        inches = _inches(value) if value else _inches(source_text)
        if inches is not None:
            rules["first_line_indent_inches"] = inches
            rules["indention"] = f"{inches:g} inch"
    elif rule_type.startswith("margin_"):
        side = rule_type.replace("margin_", "")
        inches = _inches(value) if value else _inches(source_text)
        if inches is not None:
            margins = dict(rules.get("margins_inches") or {})
            margins[side] = inches
            rules["margins_inches"] = margins
    elif rule_type == "citation_style" and value:
        rules["citation_style"] = value
    elif rule_type == "paper_size":
        paper_size = dict(rules.get("paper_size") or {})
        paper = dict(rules.get("paper") or {})
        if "8.5" in (value or source_text):
            paper_size.update({"name": "LETTER", "width_inches": 8.5, "height_inches": 11.0})
            paper["size"] = "8.5 x 11"
        rules["paper_size"] = paper_size
        rules["paper"] = paper
    elif rule_type == "paper_orientation":
        paper = dict(rules.get("paper") or {})
        paper["orientation"] = "Landscape" if "landscape" in (value or source_text).lower() else "Portrait"
        rules["paper"] = paper
    elif rule_type == "paper_substance" and value:
        paper = dict(rules.get("paper") or {})
        paper["substance"] = re.sub(r"\D", "", value) or value
        rules["paper"] = paper
    elif rule_type in {"pagination", "pagination_position"} and value:
        pagination = dict(rules.get("pagination") or {})
        pagination["position"] = value[:120]
        rules["pagination"] = pagination
    elif rule_type == "pagination_first_page":
        pagination = dict(rules.get("pagination") or {})
        pagination["first_page_of_chapter"] = "No page number on the first page of every chapter"
        rules["pagination"] = pagination
    elif rule_type == "heading_style" and source_text:
        lines = list(rules.get("heading_requirements") or [])
        if source_text not in lines:
            lines.append(source_text[:500])
        rules["heading_requirements"] = lines[:12]
    elif rule_type == "page_break" and source_text:
        lines = list(rules.get("page_break_requirements") or [])
        if source_text not in lines:
            lines.append(source_text[:500])
        rules["page_break_requirements"] = lines[:12]
    elif rule_type in {"table_layout", "table_figure_layout"} and source_text:
        lines = list(rules.get("table_layout_requirements") or [])
        if source_text not in lines:
            lines.append(source_text[:500])
        rules["table_layout_requirements"] = lines[:12]
    elif rule_type == "figure_layout" and source_text:
        lines = list(rules.get("figure_layout_requirements") or [])
        if source_text not in lines:
            lines.append(source_text[:500])
        rules["figure_layout_requirements"] = lines[:12]
    return rules


def extract_mechanics_with_ml(text: str, min_confidence: float = 0.55) -> dict:
    if not MODEL_PATH.exists() or not (text or "").strip():
        return {}
    model = joblib.load(MODEL_PATH)
    rules: dict = {}
    classes = list(model.classes_)
    for sentence in split_guide_sentences(text):
        probabilities = model.predict_proba([sentence])[0]
        index = int(probabilities.argmax())
        if float(probabilities[index]) < min_confidence:
            continue
        apply_predicted_rule(rules, str(classes[index]), sentence)
    return rules


def model_available() -> bool:
    return MODEL_PATH.exists()
