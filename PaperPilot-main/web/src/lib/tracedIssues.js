/**
 * Shared traced-issue counts for Score Breakdown + Issue Tracing.
 * Both UIs must use this so category “issues found” never drifts from the list.
 */

import { normalizeIssueLocation } from "./scanMapper.js";
import {
  displayScoreCategory,
  filterIssuesByActiveRules,
  resolveScoreCategory,
} from "./scoreFormat.js";

const CATEGORY_ORDER = [
  "Fonts",
  "Margins",
  "Indentation",
  "Line Spacing",
  "Alignment",
  "Pagination",
  "Captions",
  "Citations",
  "Other",
];

function categoryForIssue(entry = {}) {
  const resolved = resolveScoreCategory(entry);
  if (resolved) {
    const known = CATEGORY_ORDER.find((name) => name.toLowerCase() === resolved.toLowerCase());
    return known || resolved;
  }
  return "Other";
}

function normalizeSeverity(raw, result) {
  const v = String(raw || "").toLowerCase();
  if (v === "critical" || v === "major") return "critical";
  if (v === "moderate" || v === "warning") return "moderate";
  if (v === "minor") return "minor";
  if (result === "FAIL") return "critical";
  if (result === "REVIEW") return "moderate";
  return "minor";
}

/** Same card expansion Issue Tracing uses (one card per unique location). */
export function expandDetectedIssueEntries(formatChecks = [], pageCountHint = 0) {
  const entries = [];
  const seenCards = new Set();
  let hiddenLocations = 0;

  (Array.isArray(formatChecks) ? formatChecks : []).forEach((check, checkIdx) => {
    if (!check || check.result === "PASS") return;
    const severity = normalizeSeverity(check.severity, check.result);
    const issueType = check.issue_type || check.id || "";
    const rawLocs =
      Array.isArray(check.locations) && check.locations.length
        ? check.locations
        : [{ page: null, line: null, section: check.section || "General" }];
    const reported = Number(check.count);
    if (Number.isFinite(reported) && reported > rawLocs.length) {
      hiddenLocations += reported - rawLocs.length;
    }

    rawLocs.forEach((loc, locIdx) => {
      const normalized = normalizeIssueLocation(loc);
      const page =
        normalized.page == null || Number.isNaN(normalized.page) ? null : normalized.page;
      const line =
        normalized.line == null || Number.isNaN(normalized.line) ? null : normalized.line;
      const bbox = normalized.bbox;
      const bboxKey = bbox
        ? [bbox.x, bbox.y, bbox.w, bbox.h].map((n) => Number(n || 0).toFixed(3)).join(",")
        : "";
      const excerpt = String(normalized.excerpt || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80)
        .toLowerCase();
      const cardKey = `${issueType}|${page ?? ""}|${line ?? ""}|${bboxKey}|${excerpt}`;
      if (seenCards.has(cardKey)) return;
      seenCards.add(cardKey);

      const locSummary = typeof loc?.summary === "string" ? loc.summary.trim() : "";
      const locExplanation = typeof loc?.explanation === "string" ? loc.explanation.trim() : "";
      const locRecommendation =
        typeof loc?.recommendation === "string" ? loc.recommendation.trim() : "";
      const section = normalized.section || check.section || "General";

      entries.push({
        id: `${check.id || check.issue_type || "chk"}-${checkIdx}-${locIdx}`,
        issue_type: issueType,
        page,
        line,
        section,
        location: normalized,
        severity,
        finding:
          locSummary ||
          check.finding ||
          check.details ||
          check.description ||
          check.name ||
          "Formatting discrepancy detected",
        explanation: locExplanation || check.explanation || "",
        recommendation: locRecommendation || check.recommendation || "",
        excerpt: normalized.excerpt || "",
        category: categoryForIssue({
          section,
          category: check.category || section,
          issue_type: issueType,
        }),
      });
    });
  });

  return { entries, hiddenLocations };
}

/** Case-insensitive lookup onto Score Breakdown display names. */
export function tracedCountForCategory(byCategory = {}, name = "") {
  const display = displayScoreCategory(name);
  if (!display) return 0;
  if (Object.prototype.hasOwnProperty.call(byCategory, display)) {
    return Math.max(0, Number(byCategory[display]) || 0);
  }
  const match = Object.entries(byCategory || {}).find(
    ([key]) => String(key).toLowerCase() === display.toLowerCase()
  );
  return match ? Math.max(0, Number(match[1]) || 0) : 0;
}

/**
 * Authoritative category → count map for Score Breakdown + Issue Tracing chips.
 */
export function countTracedIssuesByCategory(
  formatChecks = [],
  pageCountHint = 0,
  mechanicsRules = null
) {
  const { entries, hiddenLocations } = expandDetectedIssueEntries(formatChecks, pageCountHint);
  const filtered = filterIssuesByActiveRules(entries, mechanicsRules);
  const byCategory = {};
  filtered.forEach((entry) => {
    const key = displayScoreCategory(entry.category || entry.section || "") || "Other";
    byCategory[key] = (byCategory[key] || 0) + 1;
  });
  return { byCategory, total: filtered.length, entries: filtered, hiddenLocations };
}
