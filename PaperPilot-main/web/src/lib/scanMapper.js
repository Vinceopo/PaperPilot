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

/** Stable key for one violation occurrence (post-normalize locations). */
export function locationDedupKey(loc = {}, issueType = "") {
  const page = loc?.page ?? "";
  const line = loc?.line ?? "";
  const bbox = loc?.bbox;
  const bboxKey = bbox
    ? [bbox.x, bbox.y, bbox.w, bbox.h].map((n) => Number(n || 0).toFixed(3)).join(",")
    : "";
  const excerpt = String(loc?.excerpt || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .toLowerCase();
  return `${issueType}|${page}|${line}|${bboxKey}|${excerpt}`;
}

/** Keep first occurrence of each location; preserve truncated-count extras in `count`. */
export function dedupeIssueLocations(locations, issueType, reportedCount) {
  const list = Array.isArray(locations) ? locations : [];
  const seen = new Set();
  const unique = [];
  for (const loc of list) {
    const key = locationDedupKey(loc, issueType);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(loc);
  }
  const rawLen = list.length;
  const reported = Number(reportedCount);
  const hidden = Number.isFinite(reported) && reported > rawLen ? reported - rawLen : 0;
  return { locations: unique, count: unique.length + hidden };
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

  const summary = String(loc.summary || "").trim();
  const explanation = String(loc.explanation || "").trim();
  const recommendation = String(loc.recommendation || "").trim();
  const marginSide = String(loc.margin_side || loc.marginSide || "").trim().toLowerCase();
  const pageRegion = String(loc.page_region || loc.pageRegion || "").trim().toLowerCase();
  return {
    page,
    line,
    section: String(loc.section || loc.category || "").trim(),
    bbox,
    excerpt: String(loc.excerpt || loc.text || "").trim(),
    pageWidth: pageWidth != null ? Number(pageWidth) : null,
    pageHeight: pageHeight != null ? Number(pageHeight) : null,
    ...(summary ? { summary } : {}),
    ...(explanation ? { explanation } : {}),
    ...(recommendation ? { recommendation } : {}),
    ...(marginSide ? { margin_side: marginSide, marginSide } : {}),
    ...(pageRegion ? { page_region: pageRegion, pageRegion } : {}),
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

function sectionUnitField(section, key) {
  return numberOrNull(section?.[key] ?? section?.[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())]);
}

function categoryRows(scan) {
  const sections = Array.isArray(scan?.sections) ? scan.sections : [];
  const sectionByName = new Map(
    sections
      .filter((section) => section && (section.section || section.section_name))
      .map((section) => [String(section.section || section.section_name), section]),
  );

  const fromScoring = Array.isArray(scan?.scoring?.categories) ? scan.scoring.categories : null;
  if (fromScoring?.length) {
    return fromScoring.map((cat) => {
      const name = cat.category;
      const section = sectionByName.get(String(name)) || {};
      const unitsChecked =
        numberOrNull(cat.units_checked ?? cat.unitsChecked) ??
        sectionUnitField(section, "units_checked");
      const unitsPassed =
        numberOrNull(cat.units_passed ?? cat.unitsPassed) ??
        sectionUnitField(section, "units_passed");
      const unitsFailed =
        numberOrNull(cat.units_failed ?? cat.unitsFailed) ??
        sectionUnitField(section, "units_failed");
      const score =
        numberOrNull(cat.score?.value ?? cat.score) ??
        numberOrNull(section.formatting_score);
      return {
        metric: name,
        score,
        status: cat.status || section.status || null,
        unitsChecked,
        unitsPassed,
        unitsFailed,
        issueCount:
          numberOrNull(cat.issue_occurrences ?? cat.issueCount) ??
          numberOrNull(section.issue_count) ??
          0,
        failedShare: numberOrNull(cat.failed_share?.value ?? cat.failedShare),
        measured: (unitsChecked ?? 0) > 0 || score != null,
      };
    });
  }

  // Scans saved before the scoring payload existed: show the stored rows as they are.
  return sections
    .filter((section) => section && (section.section || section.section_name))
    .map((section) => {
      const unitsChecked = sectionUnitField(section, "units_checked");
      return {
        metric: section.section || section.section_name,
        score: numberOrNull(section.formatting_score),
        status: section.status || null,
        unitsChecked,
        unitsPassed: sectionUnitField(section, "units_passed"),
        unitsFailed: sectionUnitField(section, "units_failed"),
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
    const issueType = issue.issue_type || `issue-${index}`;
    const normalized = (Array.isArray(issue.locations) ? issue.locations : []).map(normalizeIssueLocation);
    const { locations, count } = dedupeIssueLocations(normalized, issueType, issue.count);
    return {
      id: issueType,
      name: issue.title || issue.issue_type || "Formatting issue",
      description: issue.summary || issue.message || "",
      result: severity === "critical" ? "FAIL" : "REVIEW",
      severity,
      finding: issue.summary || issue.message || issue.title || "",
      explanation: issue.explanation || "",
      recommendation: issue.recommendation || "",
      locations,
      issue_type: issue.issue_type,
      count,
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
  // Prefer the sum of category unit fields so header totals always match the breakdown.
  const fromCategories = scoreBreakdown.reduce(
    (acc, row) => {
      const checked = numberOrNull(row.unitsChecked);
      const passed = numberOrNull(row.unitsPassed);
      const failed = numberOrNull(row.unitsFailed);
      if (checked != null) acc.checked += checked;
      if (passed != null) acc.passed += passed;
      if (failed != null) acc.failed += failed;
      if (checked != null || passed != null || failed != null) acc.any = true;
      return acc;
    },
    { checked: 0, passed: 0, failed: 0, any: false },
  );
  let unitsChecked = numberOrNull(scoring ? scoring.units?.checked : scan?.units_checked);
  let unitsFailed = numberOrNull(scoring ? scoring.units?.failed : scan?.units_failed);
  let unitsPassed = numberOrNull(scoring ? scoring.units?.passed : scan?.units_passed);
  if (fromCategories.any) {
    unitsChecked = fromCategories.checked;
    unitsPassed = fromCategories.passed;
    unitsFailed = fromCategories.failed;
  }
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
