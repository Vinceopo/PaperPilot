export function isServerId(id) {
  const value = String(id || "");
  return Boolean(value) && !value.startsWith("local-") && !value.startsWith("doc-");
}

export function scanTargetIds(version, manuscript) {
  const versionId = version?.id;
  const manuscriptId =
    version?.manuscript_id ||
    manuscript?.serverManuscriptId ||
    (isServerId(manuscript?.id) ? manuscript.id : "");
  return {
    versionId,
    manuscriptId,
    ready: isServerId(versionId) && isServerId(manuscriptId),
  };
}

export function isScanReady(version, manuscript) {
  return scanTargetIds(version, manuscript).ready;
}

/** Normalize API location (page/page_index, line/line_index, bbox). */
export function normalizeIssueLocation(loc) {
  if (!loc || typeof loc !== "object") {
    return { page: null, line: null, section: null, bbox: null, pageIndex: null, lineIndex: null };
  }
  const pageIndex = loc.page_index ?? loc.pageIndex;
  const lineIndex = loc.line_index ?? loc.lineIndex;
  let page = loc.page;
  if (page == null && pageIndex != null) page = Number(pageIndex) + 1;
  let line = loc.line;
  if (line == null && lineIndex != null) line = Number(lineIndex) + 1;
  const bboxRaw = loc.bbox;
  const bbox = Array.isArray(bboxRaw)
    ? bboxRaw
    : bboxRaw && typeof bboxRaw === "object"
      ? [bboxRaw.x, bboxRaw.y, bboxRaw.w, bboxRaw.h].filter((v) => v != null)
      : null;

  return {
    page: page == null || page === "" ? null : Number(page),
    line: line == null || line === "" ? null : Number(line),
    section: loc.section || null,
    bbox,
    pageIndex: pageIndex != null ? Number(pageIndex) : null,
    lineIndex: lineIndex != null ? Number(lineIndex) : null,
  };
}

/*
 * Every number is read from the backend scoring payload (`scan.scoring`, built by
 * scoring.py). Nothing is estimated here; a value the backend did not send stays null.
 */

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function categoryRows(scan) {
  const fromScoring = Array.isArray(scan?.scoring?.categories) ? scan.scoring.categories : null;
  if (fromScoring) {
    return fromScoring.map((cat) => ({
      metric: cat.category,
      score: numberOrNull(cat.score?.value),
      status: cat.status || null,
      unitsChecked: numberOrNull(cat.units_checked) ?? 0,
      unitsPassed: numberOrNull(cat.units_passed) ?? 0,
      unitsFailed: numberOrNull(cat.units_failed) ?? 0,
      issueCount: numberOrNull(cat.issue_occurrences) ?? 0,
      failedShare: numberOrNull(cat.failed_share?.value),
    }));
  }
  const sections = Array.isArray(scan?.sections) ? scan.sections : [];
  return sections
    .filter((section) => section && (section.section || section.section_name))
    .map((section) => ({
      metric: section.section || section.section_name,
      score: numberOrNull(section.formatting_score),
      status: section.status || null,
      unitsChecked: numberOrNull(section.units_checked),
      unitsPassed: numberOrNull(section.units_passed),
      unitsFailed: numberOrNull(section.units_failed),
      issueCount: numberOrNull(section.issue_count),
      failedShare: null,
    }));
}

function failedUnitDistribution(scan, breakdown) {
  if (scan?.scoring) {
    return breakdown
      .filter((row) => row.unitsFailed > 0 && row.failedShare != null)
      .map((row) => ({ section: row.metric, pctOfWrong: row.failedShare, failedUnits: row.unitsFailed }));
  }
  const list = Array.isArray(scan?.category_wrong_pct) ? scan.category_wrong_pct : [];
  return list
    .map((item) => ({
      section: item.section || item.category || "General",
      pctOfWrong: numberOrNull(item.pct_of_wrong ?? item.wrong_pct ?? item.pct),
      failedUnits: numberOrNull(item.failed_units) ?? 0,
    }))
    .filter((row) => row.pctOfWrong != null && row.failedUnits > 0);
}

function severityBreakdown(scan) {
  const bySeverity = scan?.scoring?.issues?.by_severity;
  if (bySeverity) {
    const total = numberOrNull(scan.scoring.issues.total_occurrences) ?? 0;
    if (!total) return { severityPct: null, severityCounts: null };
    const pick = (key) => numberOrNull(bySeverity[key]?.share?.value);
    return {
      severityPct: { critical: pick("critical"), moderate: pick("moderate"), minor: pick("minor") },
      severityCounts: {
        critical: numberOrNull(bySeverity.critical?.occurrences) ?? 0,
        moderate: numberOrNull(bySeverity.moderate?.occurrences) ?? 0,
        minor: numberOrNull(bySeverity.minor?.occurrences) ?? 0,
      },
    };
  }
  const raw = scan?.severity_pct;
  if (!raw || typeof raw !== "object") return { severityPct: null, severityCounts: null };
  const values = {
    critical: numberOrNull(raw.critical),
    moderate: numberOrNull(raw.moderate),
    minor: numberOrNull(raw.minor),
  };
  const hasAny = Object.values(values).some((v) => v != null && v > 0);
  return { severityPct: hasAny ? values : null, severityCounts: null };
}

export function mapComplianceScanToResult(scan, meta = {}) {
  const issues = Array.isArray(scan?.issues) ? scan.issues : [];
  const sections = Array.isArray(scan?.sections) ? scan.sections : [];

  const formatChecks = issues.map((issue, index) => {
    const severity = String(issue.severity || "moderate").toLowerCase();
    const locations = (Array.isArray(issue.locations) ? issue.locations : []).map(normalizeIssueLocation);
    return {
      id: issue.issue_type || `issue-${index}`,
      name: issue.title || issue.issue_type || "Formatting issue",
      description: issue.summary || "",
      result: severity === "critical" ? "FAIL" : "REVIEW",
      severity,
      finding: issue.summary || issue.title || "",
      explanation: issue.explanation || "",
      recommendation: issue.recommendation || "",
      locations,
      issue_type: issue.issue_type,
      count: issue.count == null ? null : Number(issue.count),
    };
  });

  const maxIssuePage = formatChecks.reduce((max, check) => {
    const pages = (check.locations || []).map((loc) => Number(loc?.page) || 0);
    return Math.max(max, ...pages, 0);
  }, 0);

  const scoring = scan?.scoring || null;
  const scoreBreakdown = categoryRows(scan);
  const overallScore = numberOrNull(scoring ? scoring.overall?.value : scan?.overall_score);
  const rightPct = numberOrNull(scoring ? scoring.passed_pct?.value : scan?.right_pct);
  const wrongPct = numberOrNull(scoring ? scoring.failed_pct?.value : scan?.wrong_pct);
  const { severityPct, severityCounts } = severityBreakdown(scan);
  const issueTotals = scoring?.issues
    ? {
        occurrences: numberOrNull(scoring.issues.total_occurrences) ?? 0,
        types: numberOrNull(scoring.issues.issue_types) ?? 0,
        withoutUnits: numberOrNull(scoring.issues.occurrences_without_units) ?? 0,
      }
    : null;

  return {
    documentId: meta.documentId || scan?.manuscript_id || scan?.id || "manuscript",
    documentTitle: meta.documentTitle || "Manuscript",
    campus: meta.campus || "",
    college: meta.college || "",
    scannedAt: scan?.created_at || new Date().toISOString(),
    citationStyle: meta.citationStyle || "APA",
    overallScore,
    overallCategories: Array.isArray(scoring?.overall?.categories) ? scoring.overall.categories : null,
    rightPct,
    wrongPct,
    categoryWrongPct: failedUnitDistribution(scan, scoreBreakdown),
    severityPct,
    severityCounts,
    issueTotals,
    scoreBreakdown,
    scoringVersion: scoring?.version || null,
    scoringConsistency: scoring?.consistency
      ? { ok: scoring.consistency.ok !== false, errors: scoring.consistency.errors || [] }
      : null,
    unitsChecked: numberOrNull(scoring ? scoring.units?.checked : scan?.units_checked),
    unitsPassed: numberOrNull(scoring ? scoring.units?.passed : scan?.units_passed),
    unitsFailed: numberOrNull(scoring ? scoring.units?.failed : scan?.units_failed),
    formatChecks,
    pageCount: Number(scan?.page_count || meta.pageCount || maxIssuePage || 0),
    pagination: scan?.pagination || meta.pagination || null,
    scanId: scan?.id,
    mechanicsId: scan?.mechanics_id || meta.mechanicsId,
    cloudinaryUrl: scan?.cloudinary_url || meta.cloudinaryUrl || "",
    documentPreview: meta.documentPreview || scan?.document_preview || null,
  };
}
