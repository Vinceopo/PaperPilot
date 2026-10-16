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

/** Convert PDF-point bbox [x0,y0,x1,y1] or {x,y,w,h} into normalized fractions. */
export function normalizeBbox(raw, pageWidth = 612, pageHeight = 792) {
  if (!raw) return null;
  const pw = Number(pageWidth) > 0 ? Number(pageWidth) : 612;
  const ph = Number(pageHeight) > 0 ? Number(pageHeight) : 792;

  if (Array.isArray(raw) && raw.length >= 4) {
    const [x0, y0, x1, y1] = raw.map((v) => Number(v) || 0);
    // Heuristic: values > 1.5 look like PDF points, not already-normalized fractions.
    const looksLikePoints = Math.max(Math.abs(x0), Math.abs(y0), Math.abs(x1), Math.abs(y1)) > 1.5;
    if (looksLikePoints) {
      return {
        x: Math.max(0, Math.min(1, x0 / pw)),
        y: Math.max(0, Math.min(1, y0 / ph)),
        w: Math.max(0, Math.min(1, (x1 - x0) / pw)),
        h: Math.max(0, Math.min(1, (y1 - y0) / ph)),
      };
    }
    return {
      x: Number(x0) || 0,
      y: Number(y0) || 0,
      w: Number(x1 - x0) || 0,
      h: Number(y1 - y0) || 0,
    };
  }

  if (typeof raw === "object") {
    const x = Number(raw.x) || 0;
    const y = Number(raw.y) || 0;
    const w = Number(raw.w ?? raw.width) || 0;
    const h = Number(raw.h ?? raw.height) || 0;
    if (Math.max(x, y, w, h) > 1.5) {
      return {
        x: Math.max(0, Math.min(1, x / pw)),
        y: Math.max(0, Math.min(1, y / ph)),
        w: Math.max(0, Math.min(1, w / pw)),
        h: Math.max(0, Math.min(1, h / ph)),
      };
    }
    return { x, y, w, h };
  }
  return null;
}

/** Normalize API / ML location payloads to 1-based page & line + optional bbox. */
export function normalizeIssueLocation(loc = {}) {
  if (!loc || typeof loc !== "object") {
    return { page: null, line: null, section: "", bbox: null, excerpt: "", pageWidth: null, pageHeight: null };
  }
  const hasExplicitPage = loc.page != null && loc.page !== "";
  const hasExplicitLine = loc.line != null && loc.line !== "";
  let page =
    hasExplicitPage ? Number(loc.page) : loc.page_index != null ? Number(loc.page_index) + 1 : null;
  let line =
    hasExplicitLine ? Number(loc.line) : loc.line_index != null ? Number(loc.line_index) + 1 : null;

  if (page != null && !Number.isNaN(page)) page = Math.max(1, Math.round(page));
  else page = null;
  if (line != null && !Number.isNaN(line)) line = Math.max(1, Math.round(line));
  else line = null;

  const pageWidth = loc.page_width ?? loc.pageWidth ?? null;
  const pageHeight = loc.page_height ?? loc.pageHeight ?? null;
  const rawBbox = loc.bbox || loc.highlight?.bbox || null;
  const bbox = normalizeBbox(rawBbox, pageWidth || 612, pageHeight || 792);

  return {
    page,
    line,
    section: String(loc.section || loc.category || "").trim(),
    bbox,
    excerpt: String(loc.excerpt || loc.text || "").trim(),
    pageWidth: pageWidth != null ? Number(pageWidth) : null,
    pageHeight: pageHeight != null ? Number(pageHeight) : null,
  };
}

/*
 * Every number below is read from the backend scoring payload (`scan.scoring`, built by
 * scoring.py). The frontend never estimates, re-weights or re-derives a percentage; a
 * value the backend did not send is shown as unavailable.
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
      measured: (numberOrNull(cat.units_checked) ?? 0) > 0,
    }));
  }
  // Scans saved before the scoring payload existed: show the stored rows as they are.
  const sections = Array.isArray(scan?.sections) ? scan.sections : [];
  return sections
    .filter((section) => section && (section.section || section.section_name))
    .map((section) => {
      const unitsChecked = numberOrNull(section.units_checked);
      return {
        metric: section.section || section.section_name,
        score: numberOrNull(section.formatting_score),
        status: section.status || null,
        unitsChecked,
        unitsPassed: numberOrNull(section.units_passed),
        unitsFailed: numberOrNull(section.units_failed),
        issueCount: numberOrNull(section.issue_count) ?? 0,
        failedShare: null,
        measured: unitsChecked == null ? section.formatting_score != null : unitsChecked > 0,
      };
    });
}

function failedUnitDistribution(scan, breakdown) {
  if (scan?.scoring) {
    return breakdown
      .filter((row) => row.unitsFailed > 0 && row.failedShare != null)
      .map((row) => ({ section: row.metric, pct: row.failedShare, failedUnits: row.unitsFailed }));
  }
  const fromApi = Array.isArray(scan?.category_wrong_pct) ? scan.category_wrong_pct : [];
  return fromApi
    .map((row) => ({
      section: row.section || row.category || "General",
      pct: numberOrNull(row.pct_of_wrong ?? row.wrong_pct ?? row.pct),
      failedUnits: numberOrNull(row.failed_units) ?? 0,
    }))
    .filter((row) => row.pct != null && row.failedUnits > 0);
}

function severityBreakdown(scan) {
  const bySeverity = scan?.scoring?.issues?.by_severity;
  if (bySeverity) {
    const pick = (key) => numberOrNull(bySeverity[key]?.share?.value);
    const total = numberOrNull(scan.scoring.issues.total_occurrences) ?? 0;
    return {
      severityPct: total ? { critical: pick("critical"), moderate: pick("moderate"), minor: pick("minor") } : null,
      severityCounts: {
        critical: numberOrNull(bySeverity.critical?.occurrences) ?? 0,
        moderate: numberOrNull(bySeverity.moderate?.occurrences) ?? 0,
        minor: numberOrNull(bySeverity.minor?.occurrences) ?? 0,
      },
    };
  }
  const raw = scan?.severity_pct;
  const values = raw && typeof raw === "object"
    ? { critical: numberOrNull(raw.critical), moderate: numberOrNull(raw.moderate), minor: numberOrNull(raw.minor) }
    : null;
  const hasAny = values && Object.values(values).some((v) => v != null && v > 0);
  return { severityPct: hasAny ? values : null, severityCounts: null };
}

export function mapComplianceScanToResult(scan, meta = {}) {
  const issues = Array.isArray(scan?.issues) ? scan.issues : [];

  const formatChecks = issues.map((issue, index) => {
    const severity = String(issue.severity || "moderate").toLowerCase();
    const locations = (Array.isArray(issue.locations) ? issue.locations : []).map(normalizeIssueLocation);
    return {
      id: issue.issue_type || `issue-${index}`,
      name: issue.title || issue.issue_type || "Formatting issue",
      description: issue.summary || issue.message || "",
      result: severity === "critical" ? "FAIL" : "REVIEW",
      severity,
      finding: issue.summary || issue.message || issue.title || "",
      explanation: issue.explanation || "",
      recommendation: issue.recommendation || "",
      locations,
      issue_type: issue.issue_type,
      count: issue.count == null ? null : Number(issue.count),
      section: locations[0]?.section || issue.section || "",
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
  const unitsChecked = numberOrNull(scoring ? scoring.units?.checked : scan?.units_checked);
  const unitsFailed = numberOrNull(scoring ? scoring.units?.failed : scan?.units_failed);
  const unitsPassed = numberOrNull(scoring ? scoring.units?.passed : scan?.units_passed);
  const categoryWrongPct = failedUnitDistribution(scan, scoreBreakdown);
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
    categoryWrongPct,
    severityPct,
    severityCounts,
    issueTotals,
    scoreBreakdown,
    scoringVersion: scoring?.version || null,
    scoringConsistency: scoring?.consistency
      ? { ok: scoring.consistency.ok !== false, errors: scoring.consistency.errors || [] }
      : null,
    formatChecks,
    pageCount: Number(scan?.page_count || meta.pageCount || maxIssuePage || 0),
    pagination: scan?.pagination || meta.pagination || null,
    scanId: scan?.id,
    versionId: scan?.manuscript_version_id || meta.versionId || "",
    documentName: meta.documentName || "",
    mechanicsId: scan?.mechanics_id || meta.mechanicsId,
    cloudinaryUrl: scan?.cloudinary_url || meta.cloudinaryUrl || "",
    documentPreview: scan?.preview || meta.preview || null,
    unitsChecked,
    unitsPassed,
    unitsFailed,
  };
}
