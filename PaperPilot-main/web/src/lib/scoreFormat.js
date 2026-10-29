/** Display-only formatting. Values arrive at full precision from the backend. */

export function hasValue(value) {
  return value != null && Number.isFinite(Number(value));
}

/** Percentage for display, or an em dash when the backend had no denominator. */
export function formatPct(value, digits = 1) {
  if (!hasValue(value)) return "—";
  const factor = 10 ** digits;
  return `${Math.round(Number(value) * factor) / factor}%`;
}

/**
 * Compliance % from the same counts shown in the UI:
 * (total − nonCompliant) / total × 100.
 * Example: 66 issues on 218 units → (218 − 66) / 218 → 69.72.
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
  if (!hasValue(value)) return "—";
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
  return hasValue(value) ? Number(value).toLocaleString("en-US") : "—";
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
 * Ring % is (total − issues) / total × 100 using the same issue count shown
 * on the card (Issue Tracing occurrences when available), e.g. 16 of 24 → 33.33%.
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

    // Prefer Issue Tracing occurrence counts so "issues found" and ring % use one formula:
    // (total − issues) / total. Cap issues at total so the arithmetic stays valid.
    const occurrenceIssues = hasValue(row.issueCount)
      ? Math.max(0, Math.round(Number(row.issueCount)))
      : null;
    const displayIssueCount = occurrenceIssues != null ? occurrenceIssues : nonCompliant;
    const failedForScore =
      total != null && hasValue(displayIssueCount)
        ? Math.min(total, Math.max(0, Number(displayIssueCount)))
        : nonCompliant;
    const compliantForScore =
      total != null && failedForScore != null ? total - failedForScore : compliant;
    const displayScore = compliancePercentFromUnits(total, failedForScore);
    return {
      ...row,
      displayTotal: total,
      displayCompliant: compliantForScore,
      displayNonCompliant: failedForScore,
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
 * Category card subtitle. Ring % is (total − min(issueCount, total)) / total from these same figures.
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
  not_evaluated: "Not evaluated",
  not_applicable: "Not applicable",
};
