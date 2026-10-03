/**
 * Dropdown choices for Format Mechanics fields.
 * The labels must match machinelearning/app/mechanics_options.py; the checker parses them.
 */

export const PAGE_POSITIONS = ["Top left", "Top center", "Top right", "Bottom left", "Bottom center", "Bottom right"];

export const TITLE_PAGE_OPTIONS = ["Hidden but counted", "Hidden and not counted", "Number shown"];

export const CHAPTER_FIRST_PAGE_OPTIONS = ["No page number shown", "Same position as other pages", "Bottom center"];

export const PRELIMINARY_STYLE_OPTIONS = ["Lowercase Roman (i, ii, iii)", "Arabic (1, 2, 3)"];

export const BODY_NUMBERING_OPTIONS = ["Arabic, restart at 1 on Chapter 1", "Arabic, continuous"];

export const CHAPTER_MARKER_OPTIONS = [
  { value: "chapter_roman", label: "CHAPTER I, CHAPTER II…" },
  { value: "chapter_arabic", label: "Chapter 1, Chapter 2…" },
  { value: "back_matter", label: "References, Bibliography, Appendices" },
  { value: "preliminary", label: "Preliminary headings (Abstract, Acknowledgment, Table of Contents…)" },
];

export const WORD_SPACING_OPTIONS = ["One space between words and after periods", "Two spaces after periods"];

export const LANDSCAPE_OPTIONS = ["Not allowed", "Allowed for tables and figures", "Allowed on any page"];

export const HEADING_LEVELS = [
  { key: "heading1", label: "Heading 1" },
  { key: "heading2", label: "Heading 2" },
  { key: "heading3", label: "Heading 3" },
];

export const HEADING_STYLE_FIELDS = [
  { key: "bold", label: "Weight", options: [{ value: "yes", label: "Bold" }, { value: "no", label: "Not bold" }] },
  { key: "italic", label: "Italic", options: [{ value: "yes", label: "Italic" }, { value: "no", label: "Not italic" }] },
  { key: "case", label: "Case", options: [{ value: "upper", label: "ALL CAPS" }, { value: "title", label: "Title Case" }] },
  {
    key: "alignment",
    label: "Alignment",
    options: [{ value: "center", label: "Centered" }, { value: "left", label: "Flush left" }],
  },
];

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const lower = (value) => clean(value).toLowerCase();

export function canonicalPagePosition(value) {
  const text = lower(value);
  const vertical = /\b(top|upper|header)\b/.test(text) ? "Top" : /\b(bottom|lower|footer)\b/.test(text) ? "Bottom" : "";
  const horizontal = /\bleft\b/.test(text)
    ? "left"
    : /\bright\b/.test(text)
      ? "right"
      : /\b(cent(?:er|re|ered|red)|middle)\b/.test(text)
        ? "center"
        : "";
  return vertical && horizontal ? `${vertical} ${horizontal}` : clean(value);
}

export function canonicalChapterFirstPage(value) {
  const text = lower(value);
  if (!text) return "";
  if (/\b(bottom|lower|footer)\b/.test(text) && /cent(?:er|re)|middle/.test(text)) return "Bottom center";
  if (/\b(no|not|without|hidden|hide|suppress\w*|omit\w*|none)\b/.test(text)) return "No page number shown";
  if (/\b(same|shown|show|numbered|visible|display\w*)\b/.test(text)) return "Same position as other pages";
  return clean(value);
}

export function canonicalTitlePage(value) {
  const text = lower(value);
  if (!text) return "";
  if (/not\s+(?:be\s+)?counted|uncounted|(?:does|do)\s+not\s+count|excluded/.test(text)) return "Hidden and not counted";
  if (/\b(no|not|without|hidden|hide|suppress\w*|omit\w*|none)\b/.test(text)) return "Hidden but counted";
  if (/\b(shown|show|numbered|visible|display\w*)\b/.test(text)) return "Number shown";
  return "";
}

export function canonicalPreliminaryStyle(value) {
  const text = lower(value);
  if (/roman|\bi\s*,\s*ii\b/.test(text)) return PRELIMINARY_STYLE_OPTIONS[0];
  if (/arabic|\b1\s*,\s*2\b/.test(text)) return PRELIMINARY_STYLE_OPTIONS[1];
  return "";
}

export function canonicalBodyNumbering(value) {
  const text = lower(value);
  if (/restart|re-start|(?:start|begin)s?\s+(?:again\s+)?(?:at|with|from)\s+(?:1|one)\b/.test(text)) {
    return BODY_NUMBERING_OPTIONS[0];
  }
  if (/continu/.test(text)) return BODY_NUMBERING_OPTIONS[1];
  return "";
}

const MARKER_KEYS = CHAPTER_MARKER_OPTIONS.map((option) => option.value);

export function canonicalChapterMarkers(value) {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n;]+/) : [];
  const keys = [];
  for (const item of items) {
    const raw = clean(item);
    const text = raw.toLowerCase();
    const found = MARKER_KEYS.includes(raw) ? [raw] : [];
    if (!found.length) {
      if (/chapter\s+(?:i\b|ii\b|roman)/.test(text)) found.push("chapter_roman");
      if (/chapter\s+(?:1\b|2\b|arabic)/.test(text)) found.push("chapter_arabic");
      if (/reference|bibliograph|append/.test(text)) found.push("back_matter");
      if (/prelim|abstract|acknowledg|table of contents|dedication/.test(text)) found.push("preliminary");
    }
    for (const key of found) if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

export function canonicalWordSpacing(value) {
  const text = lower(value);
  if (/\b(two|2|double)\s+spaces?\b/.test(text)) return WORD_SPACING_OPTIONS[1];
  if (/\b(one|1|single)\s+space\b|no\s+double\s+spac/.test(text)) return WORD_SPACING_OPTIONS[0];
  return "";
}

export function canonicalLandscapePages(value) {
  const text = lower(value);
  if (!text) return "";
  if (/\b(not|never|no)\b/.test(text)) return LANDSCAPE_OPTIONS[0];
  if (/table|figure|chart|wide/.test(text)) return LANDSCAPE_OPTIONS[1];
  if (/\b(any|all|allowed|yes)\b/.test(text)) return LANDSCAPE_OPTIONS[2];
  return "";
}

export function emptyHeadingStyles() {
  return Object.fromEntries(
    HEADING_LEVELS.map(({ key }) => [key, { bold: "", italic: "", case: "", alignment: "" }])
  );
}

/** Rules `font.heading_styles` → form strings ("yes"/"no", "upper"/"title", "center"/"left", "" = not checked). */
export function headingStylesToForm(raw) {
  const out = emptyHeadingStyles();
  if (!raw || typeof raw !== "object") return out;
  for (const { key } of HEADING_LEVELS) {
    const item = raw[key];
    if (!item || typeof item !== "object") continue;
    for (const flag of ["bold", "italic"]) {
      if (item[flag] === true) out[key][flag] = "yes";
      else if (item[flag] === false) out[key][flag] = "no";
    }
    if (["upper", "title"].includes(item.case)) out[key].case = item.case;
    if (["center", "left"].includes(item.alignment)) out[key].alignment = item.alignment;
  }
  return out;
}

export function headingStylesToRules(form) {
  const out = {};
  for (const { key } of HEADING_LEVELS) {
    const item = form?.[key] || {};
    const style = {};
    for (const flag of ["bold", "italic"]) {
      if (item[flag] === "yes") style[flag] = true;
      else if (item[flag] === "no") style[flag] = false;
    }
    if (item.case) style.case = item.case;
    if (item.alignment) style.alignment = item.alignment;
    if (Object.keys(style).length) out[key] = style;
  }
  return out;
}
