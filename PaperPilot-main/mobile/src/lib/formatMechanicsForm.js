/**
 * Shared Format Mechanics form model ↔ API rules dict.
 * Used by Customize, Upload (extracted), and Saved (loaded) Format Fields.
 */

import {
  canonicalChapterFirstPage,
  canonicalLandscapePages,
  canonicalPagePosition,
  canonicalPreliminaryStyle,
  canonicalTitlePage,
  canonicalWordSpacing,
  HEADING_RULE_FIELDS,
  emptyHeading,
  headingsFromRules,
  headingsToRules,
} from "./mechanicsOptions";

function starterHeading(values) {
  return { ...emptyHeading(), ...values, fields: HEADING_RULE_FIELDS.map((field) => field.key) };
}

export const CITATION_STYLES = ["APA", "MLA", "IEEE"];
/** Free plan Format Fields: APA or IGNORE only (MLA/IEEE need Premium/Pro). */
export const FREE_CITATION_STYLES = ["APA"];

/** Format Fields IGNORE choice — stored in the form, omitted from saved rules. */
export function isIgnoreFormValue(value) {
  return /^ignore$/i.test(String(value || "").trim());
}

/**
 * Normalize a stored citation style for the form / scan gate.
 * Empty / IGNORE means "not set" (citation checks are skipped). Unknown legacy
 * styles (e.g. Chicago) map to APA; blank stays blank.
 */
export function supportedCitationStyle(value) {
  const style = String(value || "").trim().toUpperCase();
  if (!style || style === "IGNORE") return "";
  return CITATION_STYLES.includes(style) ? style : "APA";
}

/** Citation styles selectable in Format Fields for the user's plan. */
export function citationStylesForPlan(tier) {
  const value = String(tier || "free").toLowerCase();
  if (value === "premium" || value === "pro") return CITATION_STYLES;
  return FREE_CITATION_STYLES;
}

/** Clamp a form citation value to what the plan allows (keeps IGNORE / empty). */
export function clampCitationFormatForPlan(value, tier) {
  if (isIgnoreFormValue(value)) return "IGNORE";
  const style = supportedCitationStyle(value);
  if (!style) return "";
  const allowed = citationStylesForPlan(tier);
  return allowed.includes(style) ? style : "APA";
}

/** APA 7th edition starter values. */
export function sampleMechanicsForm(name = "APA 7th Edition Format") {
  return {
    name: name || "APA 7th Edition Format",
    paperSize: "8.5 x 11",
    paperOrientation: "Portrait",
    paperSubstance: "20",
    paperLandscapePages: "Allowed for tables and figures",
    spacing: "Double",
    wordSpacing: "One space between words and after periods",
    indention: "0.5 inch",
    alignment: "Left",
    alignmentPageOverrides: "",
    marginTop: "1",
    marginLeft: "1",
    marginBottom: "1",
    marginRight: "1",
    marginGutter: "0",
    marginHeader: "0.5",
    marginFooter: "0.5",
    bodySize: "12",
    fontType: "Times New Roman",
    fontColor: "Black/Automatic",
    headings: [
      starterHeading({ size: "12", bold: "yes", italic: "no", case: "title", alignment: "center" }),
      starterHeading({ size: "12", bold: "yes", italic: "no", case: "title", alignment: "left" }),
    ],
    paginationPosition: "Top right",
    paginationTitlePage: "Number shown",
    paginationFirstPageRule: "Same position as other pages",
    paginationPreliminaryStyle: "",
    // Body numbering / chapter-start markers removed from Format Fields UI.
    paginationBodyNumbering: "",
    paginationChapterMarkers: [],
    pageBreaks: "Only to start each new chapter and the reference list",
    tableLayout:
      "Table number in bold, with the title in italic title case on the next line, both placed above it",
    figureLayout:
      "Figure number in bold, with the title in italic title case on the next line, both placed above the image",
    citationFormat: "APA",
  };
}

/** Blank form - used before upload extraction. */
export function emptyMechanicsForm(name = "") {
  return {
    name: name || "",
    paperSize: "",
    paperOrientation: "",
    paperSubstance: "",
    paperLandscapePages: "",
    spacing: "",
    wordSpacing: "",
    indention: "",
    alignment: "",
    alignmentPageOverrides: "",
    marginTop: "",
    marginLeft: "",
    marginBottom: "",
    marginRight: "",
    marginGutter: "",
    marginHeader: "",
    marginFooter: "",
    bodySize: "",
    fontType: "",
    fontColor: "",
    headings: [],
    paginationPosition: "",
    paginationTitlePage: "",
    paginationFirstPageRule: "",
    paginationPreliminaryStyle: "",
    paginationBodyNumbering: "",
    paginationChapterMarkers: [],
    pageBreaks: "",
    tableLayout: "",
    figureLayout: "",
    citationFormat: "",
  };
}

function asText(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.filter(Boolean).join("\n");
  return String(value);
}

function paperSizeLabel(rules = {}) {
  const paper = rules.paper || {};
  if (paper.size) return String(paper.size);
  const size = rules.paper_size || {};
  if (size.width_inches != null && size.height_inches != null) {
    return `${size.width_inches} x ${size.height_inches}`;
  }
  const name = String(size.name || "").toUpperCase();
  if (name === "LETTER") return "8.5 x 11";
  if (name === "A4") return "8.27 x 11.69";
  if (name === "LEGAL") return "8.5 x 14";
  return name || "";
}

const FRACTION_GLYPHS = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };
const UNIT_TO_INCHES = { cm: 1 / 2.54, mm: 1 / 25.4, pt: 1 / 72, point: 1 / 72, points: 1 / 72 };

/** "1.5", "1 ½ inches", "1/2\"", "2.54 cm", "one tab" -> inches. */
export function parseLengthInches(value) {
  const text = String(value ?? "").trim().toLowerCase().replace(/,/g, ".");
  if (!text) return null;
  if (/\b(?:one\s+)?tab\b/.test(text)) return 0.5;
  let amount = null;
  let rest = text;
  const mixed = text.match(/(\d+)\s+(\d+)\s*\/\s*(\d+)/);
  const glyph = text.match(/(\d+)?\s*([½¼¾⅓⅔⅛])/);
  const fraction = text.match(/(\d+)\s*\/\s*(\d+)/);
  const decimal = text.match(/\d+(?:\.\d+)?/);
  if (mixed && Number(mixed[3])) {
    amount = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    rest = text.slice(mixed.index + mixed[0].length);
  } else if (glyph) {
    amount = Number(glyph[1] || 0) + FRACTION_GLYPHS[glyph[2]];
    rest = text.slice(glyph.index + glyph[0].length);
  } else if (fraction && Number(fraction[2])) {
    amount = Number(fraction[1]) / Number(fraction[2]);
    rest = text.slice(fraction.index + fraction[0].length);
  } else if (decimal) {
    amount = Number(decimal[0]);
    rest = text.slice(decimal.index + decimal[0].length);
  } else if (/\bhalf\b/.test(text)) {
    amount = 0.5;
  } else if (/\bone\b/.test(text)) {
    amount = 1;
  }
  if (amount == null || Number.isNaN(amount)) return null;
  const unit = rest.match(/^\s*(cm|mm|points?|pt)\b/);
  if (unit) amount *= UNIT_TO_INCHES[unit[1]];
  amount = Math.round(amount * 10000) / 10000;
  return amount >= 0 && amount <= 5 ? amount : null;
}

/** "Double", "single", "1.5 lines", "1.15" -> a line-spacing multiple. */
export function parseLineSpacing(value) {
  const text = String(value ?? "").trim().toLowerCase().replace(/,/g, ".");
  if (!text) return null;
  if (/\bdouble\b/.test(text)) return 2;
  if (/\bsingle\b/.test(text)) return 1;
  if (/one[\s-]+and[\s-]+a[\s-]+half|1\s*½/.test(text)) return 1.5;
  if (/\d\s*(?:pt|points?)\b/.test(text)) return null;
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return number >= 0.8 && number <= 3 ? number : null;
}

const ALIGNMENT_LABELS = { justify: "Justified", left: "Left", center: "Center", right: "Right" };
const PAGE_ALIGNMENT_OVERRIDE_RE = /^\s*page\s+(\d+)\s*[=:]\s*(.+?)\s*$/i;

function alignmentKey(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return "";
  if (/justif|\bfull\b/.test(text)) return "justify";
  if (/cent(?:er|re)/.test(text)) return "center";
  if (/\bright\b/.test(text)) return "right";
  if (/\bleft\b/.test(text)) return "left";
  return "";
}

/** Map known alignment wording to checker keys; keep unknown custom text as-is. */
function alignmentRuleValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return alignmentKey(text) || text;
}

/** Parse lines like `Page 1 = center` into `{ "1": "center" }` (1-based pages). */
export function parseAlignmentPageOverrides(text) {
  const overrides = {};
  const lines = String(text || "")
    .split(/\n|;/)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const line of lines) {
    const match = line.match(PAGE_ALIGNMENT_OVERRIDE_RE);
    if (!match) continue;
    const page = Number(match[1]);
    const alignment = alignmentKey(match[2]);
    if (!Number.isInteger(page) || page < 1 || !alignment) continue;
    overrides[String(page)] = alignment;
  }
  return overrides;
}

/** Serialize `alignment_page_overrides` back to `Page N = center` lines. */
export function formatAlignmentPageOverrides(overrides) {
  if (!overrides) return "";
  const recovered = {};

  // Firebase RTDB may coerce {1:"center",2:"left"} into [null,"center","left"].
  if (Array.isArray(overrides)) {
    overrides.forEach((item, index) => {
      if (item == null || item === "") return;
      if (typeof item === "object" && !Array.isArray(item)) {
        const page = Number(item.page ?? item.page_index);
        const alignment = alignmentKey(item.alignment ?? item.align);
        if (Number.isInteger(page) && page >= 1 && alignment) recovered[String(page)] = alignment;
        return;
      }
      const asAlign = alignmentKey(item);
      if (asAlign && index >= 1) {
        recovered[String(index)] = asAlign;
        return;
      }
      const match = String(item).match(PAGE_ALIGNMENT_OVERRIDE_RE);
      if (!match) return;
      const page = Number(match[1]);
      const alignment = alignmentKey(match[2]);
      if (Number.isInteger(page) && page >= 1 && alignment) recovered[String(page)] = alignment;
    });
  } else if (typeof overrides === "object") {
    for (const key of Object.keys(overrides)) {
      const keyMatch = String(key).match(/^(?:page[_-\s]*)?(\d+)$/i);
      const page = keyMatch ? Number(keyMatch[1]) : Number(key);
      const alignment = alignmentKey(overrides[key]);
      if (Number.isInteger(page) && page >= 1 && alignment) recovered[String(page)] = alignment;
    }
  } else if (typeof overrides === "string") {
    return formatAlignmentPageOverrides(parseAlignmentPageOverrides(overrides));
  } else {
    return "";
  }

  return Object.keys(recovered)
    .map((page) => Number(page))
    .filter((page) => Number.isInteger(page) && page >= 1)
    .sort((a, b) => a - b)
    .map((page) => `Page ${page} = ${recovered[String(page)]}`)
    .join("\n");
}

/** Choices for the per-page alignment row editor (display label → stored key). */
export const PAGE_ALIGNMENT_OPTIONS = [
  { value: "justify", label: "Justified" },
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

/** Turn stored override text into editable `{ page, alignment }` rows. */
export function alignmentPageOverrideRowsFromText(text) {
  const parsed = parseAlignmentPageOverrides(text);
  return Object.keys(parsed)
    .map((page) => Number(page))
    .filter((page) => Number.isInteger(page) && page >= 1)
    .sort((a, b) => a - b)
    .map((page) => ({ page: String(page), alignment: parsed[String(page)] }));
}

/** Serialize editor rows back to `Page N = center` text (skips incomplete rows). */
export function alignmentPageOverridesTextFromRows(rows) {
  const overrides = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const page = Number(String(row?.page ?? "").trim());
    const alignment = alignmentKey(row?.alignment);
    if (!Number.isInteger(page) || page < 1 || !alignment) continue;
    overrides[String(page)] = alignment;
  }
  return formatAlignmentPageOverrides(overrides);
}

/** Non-blank lines that do not match `Page N = left|center|right|justify`. */
export function invalidAlignmentPageOverrideLines(text) {
  return String(text || "")
    .split(/\n|;/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((line) => {
      const match = line.match(PAGE_ALIGNMENT_OVERRIDE_RE);
      if (!match) return true;
      const page = Number(match[1]);
      return !Number.isInteger(page) || page < 1 || !alignmentKey(match[2]);
    });
}

export function rulesToForm(rules = {}, name = "") {
  const font = rules.font || {};
  const families = Array.isArray(font.families) ? font.families : [];
  const margins = rules.margins_inches || {};
  const paper = rules.paper || {};
  const pagination = rules.pagination || {};

  // Do not invent body size from heading sizes / sizes_points - unset means NA.
  const hasHeadingSizes = [1, 2, 3, 4, 5, 6, 7, 8, 9].some(
    (n) => font[`heading${n}_size`] != null && font[`heading${n}_size`] !== ""
  );
  const bodySize =
    font.body_size != null && font.body_size !== ""
      ? font.body_size
      : hasHeadingSizes
        ? null
        : font.heading3_content_size;

  const spacing =
    rules.spacing != null
      ? String(rules.spacing)
      : rules.line_spacing != null
        ? String(rules.line_spacing)
        : "";

  const indention =
    rules.indention != null
      ? String(rules.indention)
      : rules.first_line_indent_inches != null
        ? `${rules.first_line_indent_inches} inch`
        : "";

  return {
    name: name || "",
    paperSize: paperSizeLabel(rules),
    paperOrientation: String(paper.orientation || rules.orientation || ""),
    paperSubstance: String(paper.substance || rules.substance || ""),
    paperLandscapePages: canonicalLandscapePages(paper.landscape_pages),
    spacing,
    wordSpacing: canonicalWordSpacing(rules.word_spacing),
    indention,
    alignment:
      ALIGNMENT_LABELS[alignmentKey(rules.alignment)] || String(rules.alignment || "").trim(),
    alignmentPageOverrides: formatAlignmentPageOverrides(rules.alignment_page_overrides),
    marginTop: margins.top != null ? String(margins.top) : "",
    marginLeft: margins.left != null ? String(margins.left) : "",
    marginBottom: margins.bottom != null ? String(margins.bottom) : "",
    marginRight: margins.right != null ? String(margins.right) : "",
    marginGutter: margins.gutter != null ? String(margins.gutter) : "",
    marginHeader: margins.header != null ? String(margins.header) : "",
    marginFooter: margins.footer != null ? String(margins.footer) : "",
    bodySize: bodySize != null ? String(bodySize) : "",
    fontType: String(font.type || families[0] || ""),
    fontColor: String(font.color || ""),
    headings: headingsFromRules(font),
    paginationPosition: canonicalPagePosition(
      pagination.position || rules.pagination_position || asText(rules.pagination_requirements)
    ),
    paginationTitlePage: canonicalTitlePage(pagination.title_page),
    paginationFirstPageRule: canonicalChapterFirstPage(
      pagination.first_page_of_chapter || rules.pagination_first_page_rule || ""
    ),
    paginationPreliminaryStyle: canonicalPreliminaryStyle(pagination.preliminary_style),
    // Body numbering / chapter starts removed — ignore legacy saved keys on load.
    paginationBodyNumbering: "",
    paginationChapterMarkers: [],
    pageBreaks: asText(rules.page_break_requirements || rules.page_breaks)
      .split(/\n/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 12 && part.split(/\s+/).length >= 3)
      .join("\n"),
    tableLayout: asText(rules.table_layout_requirements || rules.table_layout),
    figureLayout: asText(rules.figure_layout_requirements || rules.figure_layout),
    citationFormat: supportedCitationStyle(rules.citation_style),
  };
}

function inferPaperName(sizeText) {
  const text = String(sizeText || "").trim().toUpperCase();
  if (!text) return "";
  if (text === "LEGAL" || (text.includes("8.5") && text.includes("14"))) return "LEGAL";
  if (text === "LETTER" || (text.includes("8.5") && text.includes("11"))) return "LETTER";
  if (text === "A4" || text.includes("8.27") || text.includes("210") || text.includes("297")) {
    return "A4";
  }
  return "";
}

function formText(value) {
  const text = String(value ?? "").trim();
  return isIgnoreFormValue(text) ? "" : text;
}

export function formToRules(form, tier) {
  const rules = {};
  const paper = {};
  const sizeText = formText(form.paperSize);
  if (sizeText) paper.size = sizeText;
  const orientation = formText(form.paperOrientation);
  if (orientation) paper.orientation = orientation;
  const substance = formText(form.paperSubstance);
  if (substance) paper.substance = substance;
  const landscapePages = formText(form.paperLandscapePages);
  if (landscapePages) paper.landscape_pages = landscapePages;
  if (Object.keys(paper).length) rules.paper = paper;

  const paperName = inferPaperName(sizeText);
  if (paperName) {
    rules.paper_size = { name: paperName };
  } else {
    const dims = sizeText.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
    if (dims) {
      rules.paper_size = {
        width_inches: Number(dims[1]),
        height_inches: Number(dims[2]),
      };
    }
  }

  const spacingText = formText(form.spacing);
  if (spacingText) {
    rules.spacing = spacingText;
    const spacingNum = parseLineSpacing(spacingText);
    if (spacingNum != null) rules.line_spacing = spacingNum;
  }
  const wordSpacing = formText(form.wordSpacing);
  if (wordSpacing) rules.word_spacing = wordSpacing;

  const indentionText = formText(form.indention);
  if (indentionText) {
    rules.indention = indentionText;
    const indentNum = parseLengthInches(indentionText);
    if (indentNum != null && indentNum <= 2) rules.first_line_indent_inches = indentNum;
  }

  const alignment = alignmentRuleValue(formText(form.alignment));
  if (alignment) rules.alignment = alignment;

  const pageOverrides = parseAlignmentPageOverrides(form.alignmentPageOverrides);
  if (Object.keys(pageOverrides).length) {
    // Firebase-safe keys (numeric keys become arrays in RTDB and wipe on reload).
    rules.alignment_page_overrides = Object.fromEntries(
      Object.entries(pageOverrides).map(([page, alignment]) => [`page_${page}`, alignment]),
    );
  }

  const margins = {};
  for (const [key, field] of [
    ["top", "marginTop"],
    ["left", "marginLeft"],
    ["bottom", "marginBottom"],
    ["right", "marginRight"],
    ["gutter", "marginGutter"],
    ["header", "marginHeader"],
    ["footer", "marginFooter"],
  ]) {
    const raw = formText(form[field]);
    const value = Number(raw);
    if (!Number.isNaN(value) && raw !== "") {
      margins[key] = value;
    }
  }
  if (Object.keys(margins).length) rules.margins_inches = margins;

  const font = {};
  const fontType = formText(form.fontType);
  if (fontType) {
    font.type = fontType;
    font.families = [fontType];
  }
  const fontColor = formText(form.fontColor);
  // Blank / IGNORE means no color rule - do not invent Black/Automatic.
  if (fontColor && !/^(na|n\/a|n\.a\.?|none|not checked|-|\u2014)$/i.test(fontColor)) {
    font.color = fontColor;
  }

  const bodyRaw = formText(form.bodySize);
  const bodySize = Number(bodyRaw);
  if (!Number.isNaN(bodySize) && bodyRaw !== "") {
    font.body_size = bodySize;
    // sizes_points is body-only - never copy heading sizes into it (that invents H1 rules).
    font.sizes_points = [bodySize];
  }
  const headingRules = headingsToRules(form.headings);
  Object.assign(font, headingRules);
  // heading_styles are already included by headingsToRules(form.headings) above.
  if (Object.keys(font).length) rules.font = font;

  const pagination = {};
  for (const [field, key] of [
    ["paginationPosition", "position"],
    ["paginationFirstPageRule", "first_page_of_chapter"],
    ["paginationTitlePage", "title_page"],
    ["paginationPreliminaryStyle", "preliminary_style"],
  ]) {
    const value = formText(form[field]);
    if (value) pagination[key] = value;
  }
  // Body numbering + chapter-start markers are no longer Format Fields controls.
  if (Object.keys(pagination).length) {
    rules.pagination = pagination;
    rules.pagination_requirements = Object.values(pagination).filter((value) => typeof value === "string");
  }

  const split = (text) =>
    formText(text)
      .split(/\n|;/)
      .map((part) => part.trim())
      .filter(Boolean);
  // Table/figure layout templates use real line breaks (one-line vs two-line).
  // Only ';' separates multiple rules — do not split on newlines.
  const splitLayout = (text) =>
    formText(text)
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);

  const pageBreaks = split(form.pageBreaks);
  const tableLayout = splitLayout(form.tableLayout);
  const figureLayout = splitLayout(form.figureLayout);
  if (pageBreaks.length) rules.page_break_requirements = pageBreaks;
  if (tableLayout.length) rules.table_layout_requirements = tableLayout;
  if (figureLayout.length) rules.figure_layout_requirements = figureLayout;

  const citation = formText(form.citationFormat).toUpperCase();
  if (CITATION_STYLES.includes(citation)) {
    // When tier is passed, Free may only persist APA (MLA/IEEE need Premium/Pro).
    // Omit tier to keep legacy behavior (all styles) for unit tests / callers.
    if (tier != null && tier !== "" && !citationStylesForPlan(tier).includes(citation)) {
      rules.citation_style = "APA";
    } else {
      rules.citation_style = citation;
    }
  }

  return rules;
}

/** Build rules for save, clamping citation style to the user's plan. */
export function formToRulesForPlan(form, tier) {
  return formToRules(form, tier);
}

export function formHasAnyRule(form) {
  const { name, ...rest } = form || {};
  return Object.keys(formToRules(rest)).length > 0;
}
