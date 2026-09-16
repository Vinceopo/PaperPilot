/**
 * Shared Format Mechanics form model ↔ API rules dict.
 * Used by Customize (blank) and Upload (AI-filled) Format Fields panel.
 */

export function emptyMechanicsForm(name = "") {
  return {
    name: name || "",
    // Paper
    paperSize: "",
    paperOrientation: "Portrait",
    paperSubstance: "",
    spacing: "",
    indention: "",
    // Margins
    marginTop: "",
    marginLeft: "",
    marginBottom: "",
    marginRight: "",
    marginGutter: "",
    marginHeader: "",
    marginFooter: "",
    // Font
    fontHeading1Size: "",
    fontHeading2Size: "",
    fontHeading3Size: "",
    fontType: "",
    fontColor: "Black/Automatic",
    // Pagination
    paginationPosition: "",
    paginationFirstPageRule: "",
    // Layout rules
    pageBreaks: "",
    tableLayout: "",
    figureLayout: "",
    citationFormat: "APA",
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

function parseNumber(value) {
  if (value == null || String(value).trim() === "") return null;
  const match = String(value).match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isNaN(number) ? null : number;
}

export function rulesToForm(rules = {}, name = "") {
  const font = rules.font || {};
  const families = Array.isArray(font.families) ? font.families : [];
  const sizes = Array.isArray(font.sizes_points) ? font.sizes_points : [];
  const margins = rules.margins_inches || {};
  const paper = rules.paper || {};
  const pagination = rules.pagination || {};

  const contentSize =
    font.heading3_content_size != null
      ? String(font.heading3_content_size)
      : sizes[0] != null
        ? String(sizes[0])
        : "";

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
    paperOrientation: String(paper.orientation || rules.orientation || "Portrait"),
    paperSubstance: String(paper.substance || rules.substance || ""),
    spacing,
    indention,
    marginTop: margins.top != null ? String(margins.top) : "",
    marginLeft: margins.left != null ? String(margins.left) : "",
    marginBottom: margins.bottom != null ? String(margins.bottom) : "",
    marginRight: margins.right != null ? String(margins.right) : "",
    marginGutter: margins.gutter != null ? String(margins.gutter) : "",
    marginHeader: margins.header != null ? String(margins.header) : "",
    marginFooter: margins.footer != null ? String(margins.footer) : "",
    fontHeading1Size:
      font.heading1_size != null ? String(font.heading1_size) : sizes[2] != null ? String(sizes[2]) : "",
    fontHeading2Size:
      font.heading2_size != null ? String(font.heading2_size) : sizes[1] != null ? String(sizes[1]) : "",
    fontHeading3Size: contentSize,
    fontType: String(font.type || families[0] || ""),
    fontColor: String(font.color || "Black/Automatic"),
    paginationPosition: String(
      pagination.position || rules.pagination_position || asText(rules.pagination_requirements)
    ),
    paginationFirstPageRule: String(
      pagination.first_page_of_chapter || rules.pagination_first_page_rule || ""
    ),
    pageBreaks: asText(rules.page_break_requirements || rules.page_breaks),
    tableLayout: asText(rules.table_layout_requirements || rules.table_layout),
    figureLayout: asText(rules.figure_layout_requirements || rules.figure_layout),
    citationFormat: String(rules.citation_style || "APA").toUpperCase(),
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

export function formToRules(form) {
  const rules = {};
  const paper = {};
  const sizeText = String(form.paperSize || "").trim();
  if (sizeText) paper.size = sizeText;
  const orientation = String(form.paperOrientation || "").trim();
  if (orientation) paper.orientation = orientation;
  const substance = String(form.paperSubstance || "").trim();
  if (substance) paper.substance = substance;
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

  const spacingText = String(form.spacing || "").trim();
  if (spacingText) {
    rules.spacing = spacingText;
    const spacingNum = parseNumber(spacingText);
    if (spacingNum != null && [1, 1.5, 2].includes(spacingNum)) {
      rules.line_spacing = spacingNum;
    }
  }

  const indentionText = String(form.indention || "").trim();
  if (indentionText) {
    rules.indention = indentionText;
    const indentNum = parseNumber(indentionText);
    if (indentNum != null && indentNum >= 0 && indentNum <= 2) {
      rules.first_line_indent_inches = indentNum;
    }
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
    const value = Number(form[field]);
    if (!Number.isNaN(value) && String(form[field] || "").trim() !== "") {
      margins[key] = value;
    }
  }
  if (Object.keys(margins).length) rules.margins_inches = margins;

  const font = {};
  const fontType = String(form.fontType || "").trim();
  if (fontType) {
    font.type = fontType;
    font.families = [fontType];
  }
  const fontColor = String(form.fontColor || "").trim();
  if (fontColor) font.color = fontColor;

  const sizes = [];
  for (const [field, key] of [
    ["fontHeading1Size", "heading1_size"],
    ["fontHeading2Size", "heading2_size"],
    ["fontHeading3Size", "heading3_content_size"],
  ]) {
    const number = Number(form[field]);
    if (!Number.isNaN(number) && String(form[field] || "").trim() !== "") {
      font[key] = number;
      sizes.push(number);
    }
  }
  if (sizes.length) font.sizes_points = [...new Set(sizes)];
  if (Object.keys(font).length) rules.font = font;

  const pagination = {};
  const position = String(form.paginationPosition || "").trim();
  if (position) pagination.position = position;
  const firstPage = String(form.paginationFirstPageRule || "").trim();
  if (firstPage) pagination.first_page_of_chapter = firstPage;
  if (Object.keys(pagination).length) {
    rules.pagination = pagination;
    rules.pagination_requirements = Object.values(pagination);
  }

  const split = (text) =>
    String(text || "")
      .split(/\n|;/)
      .map((part) => part.trim())
      .filter(Boolean);

  const pageBreaks = split(form.pageBreaks);
  const tableLayout = split(form.tableLayout);
  const figureLayout = split(form.figureLayout);
  if (pageBreaks.length) rules.page_break_requirements = pageBreaks;
  if (tableLayout.length) rules.table_layout_requirements = tableLayout;
  if (figureLayout.length) rules.figure_layout_requirements = figureLayout;

  const citation = String(form.citationFormat || "").trim().toUpperCase();
  if (["APA", "MLA", "IEEE", "CHICAGO"].includes(citation)) {
    rules.citation_style = citation;
  }

  return rules;
}

export function formHasAnyRule(form) {
  const { name, ...rest } = form || {};
  return Object.keys(formToRules(rest)).length > 0;
}
