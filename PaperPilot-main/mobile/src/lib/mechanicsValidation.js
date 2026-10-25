/**
 * Client-side helpers for mechanics document validation issues.
 * Mirrors api/app/mechanics_validate.py field → rules coverage checks.
 *
 * Empty form fields after extract stay unresolved. Choosing IGNORE in Format
 * Fields (literal "IGNORE") clears that document issue without adding a rule.
 */

import { formToRules } from "./formatMechanicsForm.js";

export function isIgnoreFormValue(value) {
  return /^ignore$/i.test(String(value || "").trim());
}

/** Schema field id → form key(s) used to detect explicit IGNORE. */
const FIELD_FORM_KEYS = {
  "margins:top": ["marginTop"],
  "margins:left": ["marginLeft"],
  "margins:bottom": ["marginBottom"],
  "margins:right": ["marginRight"],
  "margins:gutter": ["marginGutter"],
  "margins:header": ["marginHeader"],
  "margins:footer": ["marginFooter"],
  "paper:size": ["paperSize"],
  "paper:orientation": ["paperOrientation"],
  "paper:substance": ["paperSubstance"],
  "paper:spacing": ["spacing"],
  "paper:word_spacing": ["wordSpacing"],
  "paper:indention": ["indention"],
  "paper:alignment": ["alignment"],
  "paper:landscape_pages": ["paperLandscapePages"],
  "font:heading1_size": ["headings"],
  "font:heading2_size": ["headings"],
  "font:body_size": ["bodySize"],
  "font:font_type": ["fontType"],
  "font:font_color": ["fontColor"],
  "heading_styles:heading1_style": ["headings"],
  "heading_styles:heading2_style": ["headings"],
  "pagination:page_number_position": ["paginationPosition"],
  "pagination:title_page": ["paginationTitlePage"],
  "pagination:first_page_of_chapter": ["paginationFirstPageRule"],
  "pagination:preliminary_pages": ["paginationPreliminaryStyle"],
  "pagination:body_numbering": ["paginationBodyNumbering"],
  "pagination:chapter_starts": ["paginationChapterMarkers"],
  "page_breaks:page_breaks": ["pageBreaks"],
  "table_layout:table_layout": ["tableLayout"],
  "figure_layout:figure_layout": ["figureLayout"],
  "citation_format:citation_style": ["citationFormat"],
};

const FIELD_COVERED = {
  "margins:top": (rules) => rules?.margins_inches?.top != null,
  "margins:left": (rules) => rules?.margins_inches?.left != null,
  "margins:bottom": (rules) => rules?.margins_inches?.bottom != null,
  "margins:right": (rules) => rules?.margins_inches?.right != null,
  "margins:gutter": (rules) => rules?.margins_inches?.gutter != null,
  "margins:header": (rules) => rules?.margins_inches?.header != null,
  "margins:footer": (rules) => rules?.margins_inches?.footer != null,
  "paper:size": (rules) => Boolean(rules?.paper?.size),
  "paper:orientation": (rules) => Boolean(rules?.paper?.orientation),
  "paper:substance": (rules) => Boolean(rules?.paper?.substance),
  "paper:spacing": (rules) => Boolean(rules?.spacing),
  "paper:word_spacing": (rules) => Boolean(rules?.word_spacing),
  "paper:indention": (rules) => Boolean(rules?.indention),
  "paper:alignment": (rules) => Boolean(rules?.alignment),
  "paper:landscape_pages": (rules) => Boolean(rules?.paper?.landscape_pages),
  "font:heading1_size": (rules) => rules?.font?.heading1_size != null,
  "font:heading2_size": (rules) => rules?.font?.heading2_size != null,
  "font:body_size": (rules) => rules?.font?.body_size != null,
  "font:font_type": (rules) => Boolean(rules?.font?.type),
  "font:font_color": (rules) => Boolean(rules?.font?.color),
  "heading_styles:heading1_style": (rules) => Boolean(rules?.font?.heading_styles?.heading1),
  "heading_styles:heading2_style": (rules) => Boolean(rules?.font?.heading_styles?.heading2),
  "pagination:page_number_position": (rules) => Boolean(rules?.pagination?.position),
  "pagination:title_page": (rules) => Boolean(rules?.pagination?.title_page),
  "pagination:first_page_of_chapter": (rules) => Boolean(rules?.pagination?.first_page_of_chapter),
  "pagination:preliminary_pages": (rules) => Boolean(rules?.pagination?.preliminary_style),
  "pagination:body_numbering": (rules) => Boolean(rules?.pagination?.body_numbering),
  "pagination:chapter_starts": (rules) => Boolean(rules?.pagination?.chapter_markers?.length),
  "page_breaks:page_breaks": (rules) => Boolean(rules?.page_break_requirements?.length),
  "table_layout:table_layout": (rules) => Boolean(rules?.table_layout_requirements?.length),
  "figure_layout:figure_layout": (rules) => Boolean(rules?.figure_layout_requirements?.length),
  "citation_format:citation_style": (rules) => Boolean(rules?.citation_style),
};

const CATEGORY_FIELDS = {
  margins: ["top", "left", "bottom", "right", "gutter", "header", "footer"],
  paper: [
    "size",
    "orientation",
    "substance",
    "spacing",
    "word_spacing",
    "indention",
    "alignment",
    "landscape_pages",
  ],
  font: ["heading1_size", "heading2_size", "body_size", "font_type", "font_color"],
  heading_styles: ["heading1_style", "heading2_style"],
  // Must match Format Fields Pagination controls (including Chapter starts).
  pagination: [
    "page_number_position",
    "title_page",
    "first_page_of_chapter",
    "preliminary_pages",
    "body_numbering",
    "chapter_starts",
  ],
  page_breaks: ["page_breaks"],
  table_layout: ["table_layout"],
  figure_layout: ["figure_layout"],
  citation_format: ["citation_style"],
};

const HEADING_STYLE_KEYS = ["bold", "italic", "case", "alignment"];
const HEADING_STYLE_LABELS = { bold: "Weight", italic: "Italic", case: "Case", alignment: "Alignment" };

function headingAt(form, level) {
  const headings = Array.isArray(form?.headings) ? form.headings : [];
  return headings[level - 1] || null;
}

/** Style chips the user actually added (+ Weight, + Italic, …). */
function headingStyleKeysAdded(heading) {
  const fields = Array.isArray(heading?.fields) ? heading.fields : [];
  return HEADING_STYLE_KEYS.filter((key) => fields.includes(key));
}

/**
 * Added a style rule but left it on "Choose…" — that is an issue.
 * Not adding the chip at all is IGNORE (optional).
 */
function incompleteHeadingStyleKeys(heading) {
  return headingStyleKeysAdded(heading).filter((key) => {
    const text = String(heading?.[key] ?? "").trim();
    return !text;
  });
}

/** No style chips added, or every added chip is IGNORE / a real value. */
function headingStylesOptionalOrComplete(form, level) {
  const heading = headingAt(form, level);
  if (!heading) return true;
  const added = headingStyleKeysAdded(heading);
  if (!added.length) return true;
  return incompleteHeadingStyleKeys(heading).length === 0;
}

function formIgnoresField(form, category, fieldId) {
  const key = `${category}:${fieldId || category}`;
  const formKeys = FIELD_FORM_KEYS[key] || FIELD_FORM_KEYS[`${category}:${category}`] || [];
  return formKeys.some((formKey) => {
    if (formKey === "headings") {
      const headings = Array.isArray(form?.headings) ? form.headings : [];
      if (fieldId === "heading1_size" || fieldId === "heading2_size") {
        const level = fieldId === "heading1_size" ? 1 : 2;
        const heading = headings[level - 1];
        // Headings are optional in Format Fields — no row (or empty size) means skip.
        if (!heading) return true;
        const size = String(heading.size ?? "").trim();
        if (!size) return true;
        return isIgnoreFormValue(size);
      }
      if (fieldId === "heading1_style" || fieldId === "heading2_style") {
        const level = fieldId === "heading1_style" ? 1 : 2;
        const heading = headings[level - 1];
        if (!heading) return true;
        if (isIgnoreFormValue(heading?.size)) return true;
        // Incomplete Choose… is never IGNORE.
        if (incompleteHeadingStyleKeys(heading).length) return false;
        const added = headingStyleKeysAdded(heading);
        // No chips added → styles not required (ignore).
        if (!added.length) return true;
        // Every added chip is explicitly IGNORE.
        return added.every((k) => isIgnoreFormValue(heading?.[k]));
      }
      return false;
    }
    if (formKey === "paginationChapterMarkers") {
      const markers = form?.paginationChapterMarkers;
      if (isIgnoreFormValue(markers)) return true;
      return Array.isArray(markers) && markers.length === 1 && isIgnoreFormValue(markers[0]);
    }
    return isIgnoreFormValue(form?.[formKey]);
  });
}

function headingStyleFieldResolved(form, rules, level) {
  const heading = headingAt(form, level);
  const styleId = `heading${level}_style`;
  const sizeId = `heading${level}_size`;
  // Added Weight/Italic/… but left on Choose… → not resolved (issue).
  if (incompleteHeadingStyleKeys(heading).length) return false;
  if (FIELD_COVERED[`heading_styles:${styleId}`]?.(rules)) return true;
  if (formIgnoresField(form, "heading_styles", styleId)) return true;
  // Size-only heading (no style chips) covers the optional Heading Styles category.
  if (headingStyleKeysAdded(heading).length === 0) {
    return Boolean(FIELD_COVERED[`font:${sizeId}`]?.(rules) || formIgnoresField(form, "font", sizeId));
  }
  // Chips added with real values → headingsToRules will cover via FIELD_COVERED above;
  // chips all IGNORE → formIgnoresField. Anything else incomplete already returned false.
  return headingStylesOptionalOrComplete(form, level);
}

function fieldResolved(form, rules, category, fieldId) {
  const id = fieldId || category;
  if (category === "heading_styles" && (id === "heading1_style" || id === "heading2_style")) {
    const level = id === "heading1_style" ? 1 : 2;
    return headingStyleFieldResolved(form, rules, level);
  }
  const check = FIELD_COVERED[`${category}:${id}`];
  if (check?.(rules)) return true;
  return formIgnoresField(form, category, id);
}

function issueCovered(issue, form, rules) {
  const category = issue?.category || "";
  const field = issue?.field || "";
  if (!field) {
    const fields = CATEGORY_FIELDS[category] || [];
    return fields.length > 0 && fields.every((id) => fieldResolved(form, rules, category, id));
  }
  return fieldResolved(form, rules, category, field);
}

/** Form-only issues: style chip added but still on Choose… */
function incompleteHeadingStyleIssues(form) {
  const headings = Array.isArray(form?.headings) ? form.headings : [];
  const out = [];
  headings.forEach((heading, index) => {
    const incomplete = incompleteHeadingStyleKeys(heading);
    if (!incomplete.length) return;
    const level = index + 1;
    const labels = incomplete.map((key) => HEADING_STYLE_LABELS[key] || key).join(", ");
    out.push({
      id: `heading_styles:heading${level}_incomplete`,
      category: "heading_styles",
      field: `heading${level}_style`,
      code: "missing_value",
      message: `Heading ${level}: set a value or IGNORE for ${labels}, or remove the rule with ×.`,
      severity: "critical",
      location: { page: 1, line: 1, excerpt: `Heading ${level}`, severity: "critical", section: "Mechanics" },
    });
  });
  return out;
}

/** Drop document issues already resolved by Format Fields values or IGNORE. */
export function filterValidationForForm(validation, form) {
  const issues = Array.isArray(validation?.issues) ? validation.issues : [];
  const rules = formToRules(form || {});
  const remaining = issues.filter((issue) => !issueCovered(issue, form || {}, rules));
  const incomplete = incompleteHeadingStyleIssues(form || {});
  const merged = [...remaining, ...incomplete];
  return { ok: merged.length === 0, issues: merged };
}

export function highlightFromIssue(issue) {
  if (!issue) return null;
  const loc = issue.location || {};
  return {
    page: loc.page ?? 1,
    line: loc.line ?? null,
    excerpt: loc.excerpt || "",
    severity: issue.severity || loc.severity || "critical",
    section: "Mechanics",
    finding: issue.message || "",
  };
}

/** Build ignored_fields payload for /mechanics/save from Format Fields IGNORE choices. */
export function ignoredFieldsFromForm(form) {
  const ignored = [];
  for (const [key, formKeys] of Object.entries(FIELD_FORM_KEYS)) {
    const [category, fieldId] = key.split(":");
    if (formIgnoresField(form, category, fieldId)) ignored.push(key);
  }
  return ignored;
}

/**
 * Re-apply saved ignored_fields as literal "IGNORE" in Format Fields.
 * Rules omit IGNORE on save, so without this Saved Mechanics shows Choose… again.
 * Heading sizes/styles stay empty when ignored — empty already means skip in the UI.
 */
export function applyIgnoredFieldsToForm(form, ignoredFields) {
  const list = Array.isArray(ignoredFields) ? ignoredFields : [];
  if (!form || !list.length) return form;

  const next = {
    ...form,
    headings: Array.isArray(form.headings) ? form.headings.map((heading) => ({ ...heading })) : [],
  };

  for (const raw of list) {
    const key = String(raw || "").trim();
    const formKeys = FIELD_FORM_KEYS[key];
    if (!formKeys?.length) continue;

    for (const formKey of formKeys) {
      if (formKey === "headings") continue;
      if (formKey === "paginationChapterMarkers") {
        const current = next.paginationChapterMarkers;
        const empty =
          current == null ||
          current === "" ||
          (Array.isArray(current) && current.length === 0);
        if (empty) next.paginationChapterMarkers = "IGNORE";
        continue;
      }
      if (!String(next[formKey] ?? "").trim()) {
        next[formKey] = "IGNORE";
      }
    }
  }
  return next;
}
