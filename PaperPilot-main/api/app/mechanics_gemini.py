"""Gemini helpers for dynamic format mechanics (understand + visual assist).

Score ownership stays with the deterministic rule checker. These helpers only:
  (a) fill existing Format Fields schema from a guide, plus non-schema assist_items
  (b) produce assist_findings on scan for marked visual/image/style rules
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

import google.generativeai as genai

from app.config import settings
from app.documents import (
    _CORE_MARGIN_SIDES,
    iter_uniform_margin_mentions,
    parse_length_inches,
)

ASSIST_KINDS = frozenset({"visual", "image", "style", "other"})

# Top-level Format Fields keys only. Anything else from Gemini becomes assist_items.
_SCHEMA_TOP_KEYS = frozenset(
    {
        "font",
        "paper",
        "paper_size",
        "margins_inches",
        "spacing",
        "line_spacing",
        "line_spacings",
        "indention",
        "first_line_indent_inches",
        "indent_type",
        "indent_tolerance_inches",
        "alignment",
        "alignment_page_overrides",
        "pagination",
        "citation_style",
        "word_spacing",
        "heading_requirements",
        "pagination_requirements",
        "page_break_requirements",
        "table_layout_requirements",
        "figure_layout_requirements",
        "field_sources",
        "needs_review",
        "ignored_fields",
    }
)

# Schema-shaped keys Gemini may fill. Anything else becomes assist_items.
_SCHEMA_HINT = """
Known Format Fields schema (fill only when the guide clearly states a value):
- font: { type, families[], body_size, heading1_size..heading6_size, heading_levels,
  color, heading_styles: { headingN: { bold, italic, underline, all_caps, title_case, alignment } } }
- paper: { size, orientation, substance, landscape_pages }
- paper_size: { name (A4|LETTER|LEGAL), width_inches, height_inches }
- margins_inches: { top, bottom, left, right, gutter, header, footer } (inches)
  IMPORTANT: If the guide gives one margin amount without naming sides
  ("Margins 1 inch", "margins should be 1 inch"), set top, bottom, left, AND right
  to that same value. Do not leave sides empty.
- spacing / line_spacing (e.g. Double, 2.0, Single)
- indention / first_line_indent_inches
- alignment (left|center|right|justify)
- pagination: { position, title_page, preliminary_style }
- citation_style (APA|MLA|IEEE)
- table_layout_requirements[] / figure_layout_requirements[]
- page_break_requirements[]
Do NOT invent values for fields the guide never mentions. Prefer seed_rules when already filled.
If the same field is stated twice with different values, prefer the later mention in the guide.
"""

UNDERSTAND_SYSTEM = f"""You are PaperPilot's format-guide reader.
You extract institutional / publisher formatting requirements into a fixed schema
so a deterministic rule checker can score manuscripts.
You are publisher-agnostic: never assume ACM, IEEE, APA layout, or any named template.
Treat explicit rulebooks, template-as-guide Word/PDF submissions, and hybrids equally.
Map requirements into the schema when possible. Put visual, image, figure-placement,
alt-text, grayscale usability, caption position, style-only, or other non-schema rules
into assist_items.
{_SCHEMA_HINT}

Template-as-guide caution:
- Do NOT set citation_style from publisher names that appear only in sample references.
- Do NOT set font.color from accessibility prose about color vision / grayscale figures.
- Do NOT invent margins, font sizes, or indentation the guide never states numerically.
- Prefer assist_items for figure/table caption placement, alt-text / figure descriptions,
  float-element placement, and Word style instructions that the rule checker cannot score.

Return ONLY valid JSON with keys:
  rules (object — schema fields only),
  assist_items (array of {{ id, category, requirement_text, kind, assist_required }}),
  confidence (number 0-1),
  guide_kind (string: explicit_rulebook | template_as_guide | hybrid | unknown).
kind must be one of: visual, image, style, other.
assist_required must be true for every assist_item.
id should be a short snake_case slug.
Never put visual/image/style-only requirements into rules — assist_items only.
"""

ASSIST_SYSTEM = """You are PaperPilot's visual/format assist helper.
You review ONLY the provided assist_items against caption/image/style snippets from a manuscript.
Do NOT invent scored checklist issues. Do NOT propose numeric scores or pass/fail units.
Return ONLY valid JSON with key "findings": an array of objects with:
  assist_item_id, kind, title, summary, recommendation, confidence (0-1),
  status (possible_issue | unclear | looks_ok | unavailable).
Be conservative: prefer unclear over possible_issue when evidence is thin.
Never claim a finding changes the PaperPilot score.
"""


def _gemini_ready() -> bool:
    key = (settings.gemini_api_key or "").strip()
    return bool(key) and not key.startswith("your_")


def _parse_json_response(raw: str) -> dict:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].strip()
    data = json.loads(text)
    return data if isinstance(data, dict) else {}


def _merge_fill(base: dict, extra: dict) -> dict:
    """Keep seed/regex values; fill only empty schema keys from Gemini."""
    out = dict(base or {})
    for key, value in (extra or {}).items():
        if key in {"field_sources", "needs_review", "assist_items", "conflicts"}:
            continue
        # Non-schema keys are routed to assist_items in finalize — skip here.
        if key not in _SCHEMA_TOP_KEYS:
            continue
        if isinstance(value, dict):
            current = out.get(key) if isinstance(out.get(key), dict) else {}
            merged = dict(value)
            merged.update({k: v for k, v in current.items() if v not in (None, "", [], {})})
            if key == "font":
                families = list(current.get("families") or [])
                for family in value.get("families") or []:
                    if family not in families:
                        families.append(family)
                if families:
                    merged["families"] = families
                    merged.setdefault("type", families[0])
                sizes = list(current.get("sizes_points") or [])
                for size in value.get("sizes_points") or []:
                    if size not in sizes:
                        sizes.append(size)
                if sizes:
                    merged["sizes_points"] = sizes
            out[key] = merged
        elif isinstance(value, list):
            current = list(out.get(key) or [])
            for item in value:
                if item not in current:
                    current.append(item)
            out[key] = current[:12]
        elif key not in out or out.get(key) in (None, "", [], {}):
            out[key] = value
    return out


def _normalize_assist_items(raw: Any) -> list[dict]:
    items: list[dict] = []
    if not isinstance(raw, list):
        return items
    seen: set[str] = set()
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        requirement = str(entry.get("requirement_text") or "").strip()
        if not requirement:
            continue
        kind = str(entry.get("kind") or "other").strip().lower()
        if kind not in ASSIST_KINDS:
            kind = "other"
        slug = str(entry.get("id") or "").strip()
        if not slug:
            slug = re.sub(r"[^a-z0-9]+", "_", requirement.lower())[:48].strip("_")
            slug = f"assist_{slug or uuid.uuid4().hex[:8]}"
        if not slug.startswith("assist_"):
            slug = f"assist_{slug}"
        if slug in seen:
            slug = f"{slug}_{uuid.uuid4().hex[:6]}"
        seen.add(slug)
        category = str(entry.get("category") or kind).strip()[:80] or kind
        items.append(
            {
                "id": slug[:80],
                "category": category,
                "requirement_text": requirement[:500],
                "kind": kind,
                "assist_required": True,
            }
        )
        if len(items) >= 40:
            break
    return items


def _merge_assist_items(*groups: list[dict]) -> list[dict]:
    """De-dupe assist items by id / requirement text while preserving order."""
    merged: list[dict] = []
    seen_ids: set[str] = set()
    seen_text: set[str] = set()
    for group in groups:
        for item in _normalize_assist_items(group):
            text_key = re.sub(r"\s+", " ", item["requirement_text"].lower())
            if item["id"] in seen_ids or text_key in seen_text:
                continue
            seen_ids.add(item["id"])
            seen_text.add(text_key)
            merged.append(item)
            if len(merged) >= 40:
                return merged
    return merged


def _margin_dict_all_sides(amount: float) -> dict[str, float]:
    return {side: float(amount) for side in _CORE_MARGIN_SIDES}


def _format_inches_phrase(amount: float) -> str:
    value = float(amount)
    if abs(value - round(value)) < 1e-9:
        whole = int(round(value))
        unit = "inch" if whole == 1 else "inches"
        return f"{whole} {unit}"
    text = f"{value:.4g}".rstrip("0").rstrip(".")
    return f"{text} inches"


def _format_margins_phrase(margins: dict) -> str:
    core = {side: margins[side] for side in _CORE_MARGIN_SIDES if side in margins}
    if len(core) == 4 and len(set(round(float(v), 4) for v in core.values())) == 1:
        return f"{_format_inches_phrase(next(iter(core.values())))} on all sides"
    parts = [
        f"{_format_inches_phrase(margins[side])} {side}"
        for side in _CORE_MARGIN_SIDES
        if side in margins
    ]
    return ", ".join(parts) if parts else "the later margin value"


def expand_sideless_margins(rules: dict | None, text: str | None = None) -> dict:
    """Expand scalar / all / value margin cues into all four sides.

    When the guide states a side-less uniform amount, missing sides are filled so
    UI Ignore cannot wipe scoring. Named single-side rules are left alone unless
    the guide also has a uniform / all-sides phrase.
    """
    out = dict(rules or {})
    raw = out.get("margins_inches")
    amount: float | None = None
    extras: dict[str, Any] = {}
    had_explicit_uniform_key = False

    if isinstance(raw, (int, float, str)):
        amount = parse_length_inches(raw)
        had_explicit_uniform_key = amount is not None
    elif isinstance(raw, dict):
        extras = {
            key: value
            for key, value in raw.items()
            if key not in _CORE_MARGIN_SIDES
            and key not in {"all", "value", "uniform", "amount"}
        }
        for key in ("all", "value", "uniform", "amount"):
            if key in raw and amount is None:
                amount = parse_length_inches(raw.get(key))
                if amount is not None:
                    had_explicit_uniform_key = True
        core = {
            side: parse_length_inches(raw.get(side))
            for side in _CORE_MARGIN_SIDES
            if parse_length_inches(raw.get(side)) is not None
        }
        mentions = iter_uniform_margin_mentions(text or "")
        if amount is None and mentions and len(core) < 4:
            # Guide said a uniform amount — fill any sides Gemini/regex left empty.
            amount = mentions[-1][1]
        if amount is None and core:
            out["margins_inches"] = {**{side: core[side] for side in core}, **extras}
            return out
        if amount is not None and core and not had_explicit_uniform_key and not mentions:
            # Keep named sides; do not invent the rest from a lone side value.
            out["margins_inches"] = {**{side: core[side] for side in core}, **extras}
            return out
    else:
        return out

    if amount is None:
        # No margins object yet, but guide has a side-less phrase → fill all sides.
        mentions = iter_uniform_margin_mentions(text or "")
        if mentions and "margins_inches" not in out:
            amount = mentions[-1][1]
        else:
            return out
    out["margins_inches"] = {**_margin_dict_all_sides(amount), **extras}
    return out


def _strip_non_schema_into_assist(
    rules: dict | None,
    assist_items: list[dict] | None,
) -> tuple[dict, list[dict]]:
    """Move unknown top-level keys out of rules into assist_items (never scored)."""
    cleaned = dict(rules or {})
    spilled: list[dict] = []
    for key in list(cleaned.keys()):
        if key in _SCHEMA_TOP_KEYS:
            continue
        value = cleaned.pop(key)
        if isinstance(value, dict) and value.get("requirement_text"):
            spilled.append(value)
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    spilled.append(item)
                else:
                    text = str(item or "").strip()
                    if text:
                        spilled.append(
                            {
                                "id": f"assist_{re.sub(r'[^a-z0-9]+', '_', key.lower())[:40]}",
                                "category": key,
                                "requirement_text": text,
                                "kind": "other",
                                "assist_required": True,
                            }
                        )
        else:
            text = str(value or "").strip()
            if text:
                spilled.append(
                    {
                        "id": f"assist_{re.sub(r'[^a-z0-9]+', '_', key.lower())[:40]}",
                        "category": key,
                        "requirement_text": text,
                        "kind": "other",
                        "assist_required": True,
                    }
                )
    return cleaned, _merge_assist_items(assist_items or [], spilled)


def resolve_guide_conflicts(text: str, rules: dict | None) -> tuple[dict, list[dict]]:
    """Prefer later duplicate mentions; return friendly conflicts for the UI modal.

    Messages never say SOT/SOC — plain language only.
    """
    out = expand_sideless_margins(rules, text)
    conflicts: list[dict] = []
    mentions = iter_uniform_margin_mentions(text)
    if len(mentions) >= 2:
        distinct: list[float] = []
        for _, amount in mentions:
            if not distinct or round(distinct[-1], 4) != round(amount, 4):
                distinct.append(amount)
        if len(distinct) >= 2:
            chosen_amount = distinct[-1]
            rejected_amount = distinct[-2]
            chosen = _margin_dict_all_sides(chosen_amount)
            rejected = _margin_dict_all_sides(rejected_amount)
            existing = out.get("margins_inches") if isinstance(out.get("margins_inches"), dict) else {}
            out["margins_inches"] = {**existing, **chosen}
            conflicts.append(
                {
                    "field": "margins_inches",
                    "chosen": chosen,
                    "rejected": rejected,
                    "message": (
                        "We found two different margin rules. We're using the later one: "
                        f"{_format_margins_phrase(chosen)}. You can change this before saving."
                    ),
                }
            )
    return out, conflicts


def finalize_understood_mechanics(
    text: str,
    rules: dict | None,
    assist_items: list[dict] | None = None,
) -> tuple[dict, list[dict], list[dict]]:
    """Expand known fills, route unknown keys to assist, detect later-wins conflicts."""
    cleaned, assist = _strip_non_schema_into_assist(rules, assist_items)
    cleaned = expand_sideless_margins(cleaned, text)
    cleaned, conflicts = resolve_guide_conflicts(text, cleaned)
    return cleaned, assist, conflicts


def harvest_assist_items_from_guide(text: str) -> list[dict]:
    """Publisher-agnostic narrative harvest for visual/image rules regex cannot score.

    Works on school outlines and template-as-guide docs alike. Never encodes a
    specific publisher (ACM/IEEE/etc.) — only common instruction patterns.
    """
    body = str(text or "")
    if not body.strip():
        return []
    window = body[:30_000]
    harvested: list[dict] = []

    def add(item_id: str, category: str, requirement: str, kind: str) -> None:
        harvested.append(
            {
                "id": item_id,
                "category": category,
                "requirement_text": requirement,
                "kind": kind,
                "assist_required": True,
            }
        )

    if re.search(
        r"(?i)\b(?:alt[\s-]?text|alt[\s-]?txt|figure\s+descriptions?)\b"
        r".{0,120}\b(?:must|should|required|every\s+figure|provide|insert)\b"
        r"|\b(?:every|each)\s+figure\b.{0,80}\b(?:figure\s+description|alt[\s-]?text)\b"
        r"|\bfigure\s+description\b.{0,80}\b(?:unless|must|should)\b",
        window,
    ):
        add(
            "assist_figure_alt_text",
            "figure_layout",
            "Every figure should include alt-text / a figure description (unless purely decorative).",
            "image",
        )

    if re.search(
        r"(?i)\b(?:table\s+caption|caption\s+(?:for\s+)?tables?)\b.{0,80}\b(?:above|below)\b"
        r"|\b(?:above|below)\b.{0,40}\btable\b.{0,40}\bcaption\b"
        r"|\bevery\s+table\s+must\s+have\s+a\s+caption\b",
        window,
    ):
        add(
            "assist_table_caption_placement",
            "table_layout",
            "Tables must have a caption in the position the guide requires (commonly above the table).",
            "visual",
        )

    if re.search(
        r"(?i)\b(?:figure\s+caption|caption\s+(?:for\s+)?figures?)\b.{0,80}\b(?:above|below|under)\b"
        r"|\b(?:above|below|under)\b.{0,40}\bfigure\b.{0,40}\bcaption\b"
        r"|\bapply\s+the\s+(?:style\s+)?[\"'“”]?figure\s*caption"
        r"|\bfigure\s+caption\b.{0,60}\b(?:style|applied)\b",
        window,
    ):
        add(
            "assist_figure_caption_placement",
            "figure_layout",
            "Figures must use the caption placement / caption style the guide requires.",
            "visual",
        )

    if re.search(
        r"(?i)\b(?:grayscale|grey[\s-]?scale|color\s+vision|non-color\s+terms|"
        r"usable\s+when\s+printed\s+in\s+grayscale)\b",
        window,
    ):
        add(
            "assist_figure_grayscale_usable",
            "figure_layout",
            "Figures should remain understandable in grayscale / without relying on color alone.",
            "image",
        )

    if re.search(
        r"(?i)\bfloat\s+elements?\b.{0,80}\b(?:after|following)\b.{0,40}\breference\b"
        r"|\b(?:figures?|tables?)\b.{0,60}\binserted?\s+after\s+their\s+first\s+(?:text\s+)?reference\b",
        window,
    ):
        add(
            "assist_float_after_reference",
            "figure_layout",
            "Figures and tables should appear after their first text reference.",
            "visual",
        )

    if re.search(
        r"(?i)\bmulti[\s-]?part\s+figure\b|\bfigures?\s+inside\s+(?:a\s+)?table\b",
        window,
    ):
        add(
            "assist_multipart_figures",
            "figure_layout",
            "Multi-part figures must follow the guide's layout instructions and captioning rules.",
            "visual",
        )

    if re.search(
        r"(?i)\b(?:do\s+not\s+use\s+images?\s+to\s+present\s+tables?"
        r"|tables?\s+should\s+be\s+created\s+with\s+(?:ms\s+)?word)\b",
        window,
    ):
        add(
            "assist_tables_not_images",
            "table_layout",
            "Tables should be real table objects, not images of tables.",
            "accessibility",
        )

    # "accessibility" is not in ASSIST_KINDS — normalize will coerce unknown to other.
    # Use kind "other" for accessibility-ish table rule.
    for item in harvested:
        if item.get("kind") == "accessibility":
            item["kind"] = "other"

    return _normalize_assist_items(harvested)


def _guess_guide_kind(text: str, style_names: list[str] | None = None) -> str:
    body = str(text or "")
    styles = [str(name) for name in (style_names or []) if str(name).strip()]
    template_signals = 0
    if re.search(r"(?i)\b(?:submission\s+template|manuscript\s+template|author\s+guidelines?)\b", body):
        template_signals += 2
    if re.search(r"(?i)\b(?:styles?\s+pane|paragraph\s+styles?|apply\s+the\s+[\"']?\w+)", body):
        template_signals += 1
    if len(styles) >= 8:
        template_signals += 1
    explicit = bool(
        re.search(
            r"(?i)\b(?:margins?\s*:|font\s*(?:type|size)\s*:|line\s*spacing\s*:|paper\s*size\s*:)",
            body,
        )
    )
    if template_signals >= 2 and explicit:
        return "hybrid"
    if template_signals >= 2:
        return "template_as_guide"
    if explicit:
        return "explicit_rulebook"
    return "unknown"


def understand_mechanics_with_gemini(
    text: str,
    seed_rules: dict | None = None,
    style_names: list[str] | None = None,
) -> dict:
    """Fill Format Fields + assist_items from a guide. Falls back when Gemini is off.

    Always runs local finalize: side-less margins → all sides, later-wins conflicts,
    and non-schema keys → assist_items. Unmentioned schema fields stay empty.
    """
    seed = dict(seed_rules or {})
    harvested = harvest_assist_items_from_guide(text)
    guessed_kind = _guess_guide_kind(text, style_names)
    body = str(text or "").strip()

    def _pack(
        rules: dict,
        assist: list[dict],
        *,
        confidence: float,
        guide_kind: str,
        gemini_used: bool,
        gemini_available: bool,
    ) -> dict:
        finalized_rules, finalized_assist, conflicts = finalize_understood_mechanics(
            body, rules, assist
        )
        return {
            "rules": finalized_rules,
            "assist_items": finalized_assist,
            "conflicts": conflicts,
            "confidence": confidence,
            "guide_kind": guide_kind,
            "gemini_used": gemini_used,
            "gemini_available": gemini_available,
        }

    empty = _pack(
        seed,
        harvested,
        confidence=0.35 if harvested else 0.0,
        guide_kind=guessed_kind,
        gemini_used=False,
        gemini_available=_gemini_ready(),
    )
    if not _gemini_ready():
        return empty
    if not body:
        return empty
    styles = [str(name) for name in (style_names or []) if str(name).strip()][:80]
    prompt = (
        f"{UNDERSTAND_SYSTEM}\n\nSEED_RULES (prefer these when already set):\n"
        f"{json.dumps(seed, ensure_ascii=False)[:12_000]}\n\n"
        f"DOCUMENT_STYLE_NAMES (from the uploaded file; may be empty):\n"
        f"{json.dumps(styles, ensure_ascii=False)}\n\n"
        f"ALREADY_HARVESTED_ASSIST_ITEMS (keep / extend; do not drop):\n"
        f"{json.dumps(harvested, ensure_ascii=False)}\n\n"
        f"GUIDE_TEXT:\n{body[:24_000]}"
    )
    try:
        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel(settings.gemini_model)
        response = model.generate_content(prompt)
        data = _parse_json_response(response.text or "")
        gemini_rules = data.get("rules") if isinstance(data.get("rules"), dict) else {}
        # Non-schema Gemini keys become assist_items (never scored).
        schema_rules, spilled_assist = _strip_non_schema_into_assist(gemini_rules, [])
        merged = _merge_fill(seed, schema_rules)
        assist_items = _merge_assist_items(
            harvested, data.get("assist_items") or [], spilled_assist
        )
        try:
            confidence = float(data.get("confidence") or 0)
        except (TypeError, ValueError):
            confidence = 0.0
        confidence = max(0.0, min(1.0, confidence))
        guide_kind = str(data.get("guide_kind") or guessed_kind).strip().lower()
        if guide_kind not in {"explicit_rulebook", "template_as_guide", "hybrid", "unknown"}:
            guide_kind = guessed_kind
        return _pack(
            merged,
            assist_items,
            confidence=confidence,
            guide_kind=guide_kind,
            gemini_used=True,
            gemini_available=True,
        )
    except Exception:
        return empty


def _caption_snippets(parsed: dict | None, limit: int = 40) -> list[dict]:
    """Lightweight caption / figure / table text samples for visual assist."""
    snippets: list[dict] = []
    if not isinstance(parsed, dict):
        return snippets
    caption_re = re.compile(
        r"^\s*(?:figure|fig\.?|table|image|exhibit|appendix)\s*[\dA-Za-z.\-]*\s*[:.\-]?\s*.+",
        re.I,
    )
    for page in parsed.get("pages") or []:
        if not isinstance(page, dict):
            continue
        page_index = page.get("page_index", page.get("index"))
        for block in page.get("blocks") or page.get("lines") or []:
            if isinstance(block, dict):
                text = str(block.get("text") or "").strip()
            else:
                text = str(block or "").strip()
            if not text or len(text) < 8:
                continue
            if caption_re.match(text) or re.search(r"\b(?:alt[\s-]?text|figure description)\b", text, re.I):
                snippets.append(
                    {
                        "page": page_index,
                        "excerpt": text[:280],
                    }
                )
                if len(snippets) >= limit:
                    return snippets
    # Fallback: scan plain text lines.
    if not snippets:
        for line in str(parsed.get("text") or "").splitlines():
            raw = line.strip()
            if caption_re.match(raw):
                snippets.append({"page": None, "excerpt": raw[:280]})
                if len(snippets) >= limit:
                    break
    return snippets


def assist_visual_mechanics(
    assist_items: list[dict] | None,
    parsed: dict | None = None,
    mechanics_rules: dict | None = None,
) -> list[dict]:
    """Produce non-scoring assist_findings for marked assist_items."""
    items = [
        item
        for item in (assist_items or [])
        if isinstance(item, dict) and item.get("assist_required") is not False
    ]
    if not items:
        return []
    if not _gemini_ready():
        return [
            {
                "assist_item_id": item.get("id"),
                "kind": item.get("kind") or "other",
                "title": "AI assist unavailable",
                "summary": "Gemini is not configured, so this visual/image rule could not be checked.",
                "recommendation": "Configure GEMINI_API_KEY or review this requirement manually.",
                "confidence": 0.0,
                "status": "unavailable",
            }
            for item in items[:40]
        ]

    snippets = _caption_snippets(parsed)
    prompt = (
        f"{ASSIST_SYSTEM}\n\nASSIST_ITEMS:\n"
        f"{json.dumps(items[:40], ensure_ascii=False)}\n\n"
        f"CAPTION_IMAGE_SNIPPETS:\n{json.dumps(snippets, ensure_ascii=False)}\n\n"
        f"MECHANICS_RULES_CONTEXT (do not score):\n"
        f"{json.dumps(mechanics_rules or {}, ensure_ascii=False)[:6000]}"
    )
    try:
        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel(settings.gemini_model)
        response = model.generate_content(prompt)
        data = _parse_json_response(response.text or "")
        findings_raw = data.get("findings") if isinstance(data.get("findings"), list) else []
        by_id = {str(item.get("id")): item for item in items if item.get("id")}
        findings: list[dict] = []
        for entry in findings_raw:
            if not isinstance(entry, dict):
                continue
            item_id = str(entry.get("assist_item_id") or "").strip()
            if item_id and item_id not in by_id and not item_id.startswith("assist_"):
                continue
            status = str(entry.get("status") or "unclear").strip().lower()
            if status not in {"possible_issue", "unclear", "looks_ok", "unavailable"}:
                status = "unclear"
            kind = str(entry.get("kind") or (by_id.get(item_id) or {}).get("kind") or "other")
            if kind not in ASSIST_KINDS:
                kind = "other"
            try:
                confidence = float(entry.get("confidence") or 0)
            except (TypeError, ValueError):
                confidence = 0.0
            findings.append(
                {
                    "assist_item_id": item_id or None,
                    "kind": kind,
                    "title": str(entry.get("title") or "Assist finding")[:200],
                    "summary": str(entry.get("summary") or "")[:800],
                    "recommendation": str(entry.get("recommendation") or "")[:800],
                    "confidence": max(0.0, min(1.0, confidence)),
                    "status": status,
                }
            )
            if len(findings) >= 40:
                break
        return findings
    except Exception:
        return [
            {
                "assist_item_id": item.get("id"),
                "kind": item.get("kind") or "other",
                "title": "AI assist unavailable",
                "summary": "Gemini assist could not run for this requirement.",
                "recommendation": "Review this visual/image requirement manually.",
                "confidence": 0.0,
                "status": "unavailable",
            }
            for item in items[:40]
        ]
