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

const BREAKDOWN_ORDER = ["Fonts", "Margins", "Indentation", "Spacing", "Alignment"];

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

function deriveCategoryWrongPct(scan, formatChecks) {
  const fromApi = Array.isArray(scan?.category_wrong_pct) ? scan.category_wrong_pct : [];
  if (fromApi.length) {
    return fromApi
      .map((row) => ({
        section: row.section || row.category || "General",
        pct: Number(row.pct_of_wrong ?? row.wrong_pct ?? row.pct ?? 0),
        failedUnits: Number(row.failed_units ?? 0),
      }))
      .filter((row) => Number.isFinite(row.pct));
  }

  const counts = new Map();
  formatChecks.forEach((check) => {
    if (check.result === "PASS") return;
    const locs =
      Array.isArray(check.locations) && check.locations.length
        ? check.locations
        : [{ section: check.section || "General" }];
    locs.forEach((loc) => {
      const key = loc.section || "General";
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  if (!total) return [];
  return [...counts.entries()]
    .map(([section, count]) => ({
      section,
      pct: Math.round((count / total) * 1000) / 10,
      failedUnits: count,
    }))
    .sort((a, b) => b.pct - a.pct);
}

function severityWeight(severity) {
  const v = String(severity || "").toLowerCase();
  if (v === "critical" || v === "major") return 3;
  if (v === "moderate" || v === "warning") return 2;
  return 1;
}

function severityPctLooksEmpty(raw) {
  if (!raw || typeof raw !== "object") return true;
  const c = Number(raw.critical ?? 0);
  const m = Number(raw.moderate ?? 0);
  const n = Number(raw.minor ?? 0);
  return !Number.isFinite(c + m + n) || c + m + n <= 0;
}

function deriveSeverityPct(scan, formatChecks) {
  const fromApi = scan?.severity_pct;
  if (fromApi && typeof fromApi === "object" && !severityPctLooksEmpty(fromApi)) {
    return {
      critical: Number(fromApi.critical ?? 0),
      moderate: Number(fromApi.moderate ?? 0),
      minor: Number(fromApi.minor ?? 0),
    };
  }

  const weights = { critical: 0, moderate: 0, minor: 0 };
  formatChecks.forEach((check) => {
    if (check.result === "PASS") return;
    const sev = String(check.severity || "moderate").toLowerCase();
    const bucket =
      sev === "critical" || sev === "major"
        ? "critical"
        : sev === "moderate" || sev === "warning"
          ? "moderate"
          : "minor";
    const n = Math.max(1, Number(check.count) || check.locations?.length || 1);
    weights[bucket] += n * severityWeight(sev);
  });
  const total = weights.critical + weights.moderate + weights.minor;
  if (!total) {
    return { critical: 0, moderate: 0, minor: 0 };
  }
  return {
    critical: Math.round((weights.critical / total) * 1000) / 10,
    moderate: Math.round((weights.moderate / total) * 1000) / 10,
    minor: Math.round((weights.minor / total) * 1000) / 10,
  };
}

function deriveScoreBreakdown(scan, formatChecks) {
  const sections = Array.isArray(scan?.sections) ? scan.sections : [];
  const usable = sections.filter(
    (section) =>
      section &&
      (section.section || section.section_name) &&
      section.formatting_score != null &&
      Number.isFinite(Number(section.formatting_score))
  );

  if (usable.length) {
    return usable.map((section) => ({
      metric: section.section || section.section_name || "General",
      score: Math.round(Number(section.formatting_score) * 100) / 100,
      issueCount: Number(section.issue_count ?? 0),
      measured: true,
    }));
  }

  // Fallback: estimate category pass rates from issue locations when ML sections are missing.
  const failByCategory = new Map(BREAKDOWN_ORDER.map((name) => [name, 0]));
  let totalLocations = 0;
  formatChecks.forEach((check) => {
    if (check.result === "PASS") return;
    const locs =
      Array.isArray(check.locations) && check.locations.length
        ? check.locations
        : [{ section: check.section || "Fonts" }];
    locs.forEach((loc) => {
      const key = BREAKDOWN_ORDER.includes(loc.section) ? loc.section : "Fonts";
      failByCategory.set(key, (failByCategory.get(key) || 0) + 1);
      totalLocations += 1;
    });
  });

  const overall = Number(scan?.overall_score ?? 0);
  if (!totalLocations) {
    return BREAKDOWN_ORDER.map((metric) => ({
      metric,
      score: overall > 0 ? overall : 100,
      issueCount: 0,
      measured: false,
    }));
  }

  // Distribute overall score: categories with more failures get lower scores.
  const maxFail = Math.max(...failByCategory.values(), 1);
  return BREAKDOWN_ORDER.map((metric) => {
    const fails = failByCategory.get(metric) || 0;
    if (fails === 0) {
      return { metric, score: 100, issueCount: 0, measured: true };
    }
    const severityShare = fails / maxFail;
    const score = Math.max(0, Math.round((overall * (1 - 0.55 * severityShare) + (100 - overall) * (1 - severityShare)) * 10) / 10);
    return { metric, score, issueCount: fails, measured: true };
  });
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
      count: issue.count ?? locations.length,
      section: locations[0]?.section || issue.section || "",
    };
  });

  const maxIssuePage = formatChecks.reduce((max, check) => {
    const pages = (check.locations || []).map((loc) => Number(loc?.page) || 0);
    return Math.max(max, ...pages, 0);
  }, 0);

  const scoreBreakdown = deriveScoreBreakdown(scan, formatChecks);
  const measuredScores = scoreBreakdown.filter((row) => row.measured).map((row) => row.score);
  const overallScore =
    scan?.overall_score != null
      ? Number(scan.overall_score)
      : measuredScores.length
        ? Math.round((measuredScores.reduce((a, b) => a + b, 0) / measuredScores.length) * 100) / 100
        : 0;

  const rightPct =
    scan?.right_pct != null
      ? Number(scan.right_pct)
      : overallScore > 0
        ? overallScore
        : null;
  const wrongPct =
    scan?.wrong_pct != null
      ? Number(scan.wrong_pct)
      : rightPct != null
        ? Math.max(0, Math.round((100 - rightPct) * 10) / 10)
        : null;

  const categoryWrongPct = deriveCategoryWrongPct(scan, formatChecks);
  const severityPct = deriveSeverityPct(scan, formatChecks);

  return {
    documentId: meta.documentId || scan?.manuscript_id || scan?.id || "manuscript",
    documentTitle: meta.documentTitle || "Manuscript",
    campus: meta.campus || "",
    college: meta.college || "",
    scannedAt: scan?.created_at || new Date().toISOString(),
    citationStyle: meta.citationStyle || "APA",
    overallScore,
    rightPct: rightPct ?? overallScore,
    wrongPct: wrongPct ?? Math.max(0, 100 - overallScore),
    categoryWrongPct,
    severityPct,
    scoreBreakdown,
    formatChecks,
    pageCount: Number(scan?.page_count || meta.pageCount || maxIssuePage || 0),
    pagination: scan?.pagination || meta.pagination || null,
    scanId: scan?.id,
    mechanicsId: scan?.mechanics_id || meta.mechanicsId,
    cloudinaryUrl: scan?.cloudinary_url || meta.cloudinaryUrl || "",
    documentPreview: scan?.preview || meta.preview || null,
    unitsChecked: scan?.units_checked != null ? Number(scan.units_checked) : null,
    unitsFailed: scan?.units_failed != null ? Number(scan.units_failed) : null,
  };
}
