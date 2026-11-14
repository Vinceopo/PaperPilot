/** Display-only formatting. Values arrive at full precision from the backend. */

export function hasValue(value) {
  return value != null && Number.isFinite(Number(value));
}

/** Score Breakdown categories (matches backend BREAKDOWN_ORDER). */
export const SCORE_BREAKDOWN_ORDER = [
  "Fonts",
  "Margins",
  "Indentation",
  "Spacing",
  "Alignment",
  "Pagination",
  "Citations",
];

/**
 * True when a mechanics field is blank / IGNORE / NA (no rule to enforce).
 * Mirrors api/app/mechanics_options._rule_unset for client-side filtering.
 */
export function isMechanicsRuleUnset(value) {
  if (value == null) return true;
  if (typeof value === "boolean") return false;
  if (typeof value === "number") return false;
  if (Array.isArray(value)) {
    return !value.length || value.every((item) => isMechanicsRuleUnset(item));
  }
  if (typeof value === "object") {
    const entries = Object.values(value);
    return !entries.length || entries.every((item) => isMechanicsRuleUnset(item));
  }
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return (
    !text ||
    text === "ignore" ||
    text === "na" ||
    text === "n/a" ||
    text === "n.a." ||
    text === "n.a" ||
    text === "not checked" ||
    text === "not check" ||
    text === "none" ||
    text === "-" ||
    text === "—"
  );
}

/**
 * Which Score Breakdown categories have at least one configured (non-IGNORE) rule
 * in the selected Format Mechanics profile.
 */
export function activeScoreCategoriesFromRules(rules) {
  const active = new Set();
  if (!rules || typeof rules !== "object") return active;

  const font = rules.font && typeof rules.font === "object" ? rules.font : {};
  const families = Array.isArray(font.families) ? font.families : [];
  const sizes = Array.isArray(font.sizes_points) ? font.sizes_points : [];
  const headingSizes = Object.keys(font).some(
    (key) => /^heading\d+_size$/i.test(key) && !isMechanicsRuleUnset(font[key]),
  );
  const headingStyles =
    font.heading_styles &&
    typeof font.heading_styles === "object" &&
    Object.values(font.heading_styles).some((style) => !isMechanicsRuleUnset(style));
  const color = String(font.color || "").trim();
  const hasColor =
    color &&
    !isMechanicsRuleUnset(color) &&
    !/^(na|n\/a|n\.a\.?|none|not checked|-|—)$/i.test(color);
  if (
    !isMechanicsRuleUnset(font.type) ||
    families.some((family) => !isMechanicsRuleUnset(family)) ||
    font.body_size != null ||
    sizes.some((size) => size != null && !isMechanicsRuleUnset(size)) ||
    headingSizes ||
    headingStyles ||
    hasColor
  ) {
    active.add("Fonts");
  }

  const margins =
    rules.margins_inches && typeof rules.margins_inches === "object" ? rules.margins_inches : {};
  const hasMargins = ["top", "bottom", "left", "right"].some(
    (side) => margins[side] != null && !isMechanicsRuleUnset(margins[side]),
  );
  const paper = rules.paper && typeof rules.paper === "object" ? rules.paper : {};
  const hasPaperSize =
    !isMechanicsRuleUnset(paper.size) ||
    (rules.paper_size && !isMechanicsRuleUnset(rules.paper_size));
  if (hasMargins || hasPaperSize || !isMechanicsRuleUnset(paper.orientation)) {
    active.add("Margins");
  }

  if (
    (rules.first_line_indent_inches != null &&
      !isMechanicsRuleUnset(rules.first_line_indent_inches)) ||
    !isMechanicsRuleUnset(rules.indention)
  ) {
    active.add("Indentation");
  }

  const spacings = Array.isArray(rules.line_spacings) ? rules.line_spacings : [];
  if (
    (rules.line_spacing != null && !isMechanicsRuleUnset(rules.line_spacing)) ||
    !isMechanicsRuleUnset(rules.spacing) ||
    spacings.some((value) => value != null && !isMechanicsRuleUnset(value)) ||
    !isMechanicsRuleUnset(rules.word_spacing)
  ) {
    active.add("Spacing");
  }

  if (!isMechanicsRuleUnset(rules.alignment)) {
    active.add("Alignment");
  }

  const pagination =
    rules.pagination && typeof rules.pagination === "object" ? rules.pagination : {};
  const paginationReqs = Array.isArray(rules.pagination_requirements)
    ? rules.pagination_requirements
    : [];
  if (
    Object.values(pagination).some((value) => !isMechanicsRuleUnset(value)) ||
    paginationReqs.some((value) => !isMechanicsRuleUnset(value))
  ) {
    active.add("Pagination");
  }

  if (!isMechanicsRuleUnset(rules.citation_style)) {
    active.add("Citations");
  }

  return active;
}

/**
 * Keep only Score Breakdown rows whose category has configured/enabled rules.
 * When `rules` is null/undefined (legacy scans), rows stay as returned by the API.
 */
export function filterScoreBreakdownByRules(scoreBreakdown = [], rules) {
  const list = Array.isArray(scoreBreakdown) ? scoreBreakdown : [];
  if (rules == null) return list;
  const active = activeScoreCategoriesFromRules(rules);
  if (!active.size) return [];
  return list.filter((row) => {
    const name = String(row?.metric || row?.section || "").trim();
    if (!active.has(name)) return false;
    // Hide IGNORE / not_applicable only. Unreliable stays visible (notice, no ring).
    const status = String(row?.status || "").toLowerCase();
    if (status === "not_applicable") return false;
    return true;
  });
}

/** Drop issue cards for categories that have no configured/enabled rule. */
export function filterIssuesByActiveRules(issues = [], rules) {
  const list = Array.isArray(issues) ? issues : [];
  if (rules == null) return list;
  const active = activeScoreCategoriesFromRules(rules);
  if (!active.size) return [];
  return list.filter((issue) => {
    const section = String(issue?.section || issue?.category || "").trim();
    if (!section) return true;
    const known = [...active].find((name) => name.toLowerCase() === section.toLowerCase());
    return Boolean(known);
  });
}

/** Percentage for display, or an em dash when the backend had no denominator. */
export function formatPct(value, digits = 1) {
  if (!hasValue(value)) return "-";
  const factor = 10 ** digits;
  return `${Math.round(Number(value) * factor) / factor}%`;
}

/**
 * Compliance % from unit counts (not issue findings):
 * (unitsChecked − unitsFailed) / unitsChecked × 100.
 * Example: 66 failed units on 218 checked → (218 − 66) / 218 → 69.72.
 */
export function compliancePercentFromUnits(total, nonCompliant) {
  if (!hasValue(total) || Number(total) <= 0) return null;
  const units = Math.max(0, Number(total));
  const failed = hasValue(nonCompliant)
    ? Math.min(units, Math.max(0, Number(nonCompliant)))
    : 0;
  return ((units - failed) / units) * 100;
}

export function formatScore(value, digits = 1) {
  if (!hasValue(value)) return "-";
  const factor = 10 ** digits;
  return String(Math.round(Number(value) * factor) / factor);
}

/**
 * Round shares of one whole so the displayed values still add up to exactly 100
 * (largest-remainder method). Rounding each share on its own can show 99.9 or 100.1.
 * Inputs that are not shares of one whole are rounded individually.
 */
export function roundSharesToTotal(values, digits = 1) {
  const factor = 10 ** digits;
  const numbers = values.map((v) => (hasValue(v) ? Number(v) : null));
  const present = numbers.filter((v) => v != null);
  const sum = present.reduce((a, b) => a + b, 0);
  if (!present.length || Math.abs(sum - 100) > 0.5) {
    return numbers.map((v) => (v == null ? null : Math.round(v * factor) / factor));
  }
  const scaled = numbers.map((v) => (v == null ? null : v * factor));
  const floors = scaled.map((v) => (v == null ? null : Math.floor(v)));
  let remaining = Math.round(100 * factor) - floors.reduce((a, b) => a + (b ?? 0), 0);
  const order = scaled
    .map((v, i) => ({ i, rest: v == null ? -1 : v - floors[i] }))
    .sort((a, b) => b.rest - a.rest);
  for (const { i, rest } of order) {
    if (remaining <= 0 || rest < 0) break;
    floors[i] += 1;
    remaining -= 1;
  }
  return floors.map((v) => (v == null ? null : v / factor));
}

export function formatCount(value) {
  return hasValue(value) ? Number(value).toLocaleString("en-US") : "-";
}

/**
 * Display unit totals so Compliant + Non-Compliant always equals Total when possible.
 * Prefers `unitsChecked` as Total and derives Non-Compliant from Total − Compliant.
 */
export function resolveUnitCounts({ unitsChecked, unitsPassed, unitsFailed } = {}) {
  const total = hasValue(unitsChecked) ? Math.max(0, Math.round(Number(unitsChecked))) : null;
  const passed = hasValue(unitsPassed) ? Math.max(0, Math.round(Number(unitsPassed))) : null;
  const failed = hasValue(unitsFailed) ? Math.max(0, Math.round(Number(unitsFailed))) : null;

  if (total != null && passed != null) {
    const compliant = Math.min(passed, total);
    return { total, compliant, nonCompliant: total - compliant };
  }
  if (total != null && failed != null) {
    const nonCompliant = Math.min(failed, total);
    return { total, compliant: total - nonCompliant, nonCompliant };
  }
  if (passed != null && failed != null) {
    return { total: passed + failed, compliant: passed, nonCompliant: failed };
  }
  if (total != null) return { total, compliant: null, nonCompliant: null };
  return { total: null, compliant: null, nonCompliant: null };
}

function rowUnitFields(row = {}) {
  return {
    unitsChecked: row.unitsChecked ?? row.units_checked,
    unitsPassed: row.unitsPassed ?? row.units_passed,
    unitsFailed: row.unitsFailed ?? row.units_failed,
  };
}

function issuesFromScore(total, score) {
  if (!hasValue(total) || total <= 0 || !hasValue(score)) return 0;
  const safe = Math.max(0, Math.min(100, Number(score)));
  return Math.max(0, Math.min(total, Math.round((total * (100 - safe)) / 100)));
}

/**
 * Per-category display counts from the backend unit fields.
 * Ring % uses failed units: (total − unitsFailed) / total × 100.
 * Displayed issue counts follow non-compliant units so the Issues headline
 * matches the compliance summary.
 *
 * Never invent unit totals from score alone (that made category sums diverge
 * from the header Total Units). Missing counts stay null → N/A on the card.
 */
export function resolveCategoryUnitDisplays(rows = []) {
  const list = Array.isArray(rows) ? rows : [];

  return list.map((row) => {
    let { total, compliant, nonCompliant } = resolveUnitCounts(rowUnitFields(row));

    // Legacy scans: recover only when we have both a score and an issue count,
    // and never invent a fake "1 unit" for a perfect score with no counts.
    if (total == null && hasValue(row.score)) {
      const issues = hasValue(row.issueCount) ? Math.max(0, Math.round(Number(row.issueCount))) : 0;
      const score = Math.max(0, Math.min(100, Number(row.score)));
      if (issues > 0 && score < 100) {
        const failRate = (100 - score) / 100;
        total = Math.max(issues, Math.round(issues / failRate));
        nonCompliant = Math.min(total, issues);
        compliant = total - nonCompliant;
      }
    }

    if (total != null && nonCompliant == null) {
      nonCompliant = issuesFromScore(total, row.score);
      compliant = total - nonCompliant;
    }
    if (total != null && nonCompliant != null) {
      nonCompliant = Math.min(total, Math.max(0, nonCompliant));
      compliant = total - nonCompliant;
    }

    // Findings are informational only — never drive the ring % / unit totals.
    const occurrenceIssues = hasValue(row.issueCount)
      ? Math.max(0, Math.round(Number(row.issueCount)))
      : null;
    const displayIssueCount = occurrenceIssues != null ? occurrenceIssues : nonCompliant;
    const displayScore = compliancePercentFromUnits(total, nonCompliant);
    return {
      ...row,
      displayTotal: total,
      displayCompliant: compliant,
      displayNonCompliant: nonCompliant,
      displayIssueCount,
      displayScore: displayScore != null ? displayScore : hasValue(row.score) ? Number(row.score) : null,
    };
  });
}

/** Sum of per-category checked units (same totals shown on each card). */
export function sumCategoryChecked(rows = []) {
  return (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
    if (!hasValue(row?.displayTotal)) return acc;
    return acc + Math.max(0, Math.round(Number(row.displayTotal)));
  }, 0);
}

/** Sum of per-category non-compliant units (same figures shown on each card). */
export function sumCategoryNonCompliant(rows = []) {
  return (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
    if (!hasValue(row?.displayNonCompliant)) return acc;
    return acc + Math.max(0, Math.round(Number(row.displayNonCompliant)));
  }, 0);
}

/**
 * Header Total / Compliant / Non-Compliant must equal the sum of category cards.
 * Prefer category sums whenever any category reports units; otherwise use overall.
 */
export function reconcileDisplayedUnits(overall = {}, categoryDisplays = []) {
  const fromOverall = resolveUnitCounts(overall);
  const categoryTotal = sumCategoryChecked(categoryDisplays);
  const categoryFailed = sumCategoryNonCompliant(categoryDisplays);
  const hasCategoryUnits = categoryDisplays.some(
    (row) => hasValue(row?.displayTotal) && Number(row.displayTotal) >= 0,
  );
  const anyChecked = categoryDisplays.some(
    (row) => hasValue(row?.displayTotal) && Number(row.displayTotal) > 0,
  );

  if (hasCategoryUnits && (anyChecked || categoryTotal === 0)) {
    const total = categoryTotal;
    const nonCompliant = Math.min(total, Math.max(0, categoryFailed));
    return {
      total,
      nonCompliant,
      compliant: Math.max(0, total - nonCompliant),
    };
  }

  return {
    total: fromOverall.total,
    compliant: fromOverall.compliant,
    nonCompliant: fromOverall.nonCompliant,
  };
}

/**
 * Category card subtitle for findings vs units checked.
 * Prefer passing non-compliant units as issueCount so totals stay consistent.
 */
export function formatCategoryIssuesDetail(issueCount, total) {
  if (!hasValue(total)) return null;
  const issues = hasValue(issueCount) ? Math.max(0, Math.round(Number(issueCount))) : 0;
  const units = Math.max(0, Math.round(Number(total)));
  return `${formatCount(issues)} ${plural(issues, "issue")} found on ${formatCount(units)} total ${plural(units, "unit")} checked`;
}

export function plural(count, word, pluralWord = `${word}s`) {
  return Number(count) === 1 ? word : pluralWord;
}

export const CATEGORY_STATUS_LABEL = {
  could_not_check_reliably: "Could not check reliably",

  not_evaluated: "Not evaluated",
  not_applicable: "Not applicable",
};
