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

function normalizeCategoryWrong(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => ({
    section: item.section || item.category || "General",
    pctOfWrong: Number(item.pct_of_wrong ?? item.wrong_pct ?? item.pct ?? 0),
    failedUnits: Number(item.failed_units ?? 0),
  }));
}

function severityLooksEmpty(raw) {
  if (!raw || typeof raw !== "object") return true;
  return Number(raw.critical ?? 0) + Number(raw.moderate ?? 0) + Number(raw.minor ?? 0) <= 0;
}

function normalizeSeverityPct(raw, formatChecks = []) {
  if (raw && typeof raw === "object" && !severityLooksEmpty(raw)) {
    return {
      critical: Number(raw.critical ?? 0),
      moderate: Number(raw.moderate ?? 0),
      minor: Number(raw.minor ?? 0),
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
    weights[bucket] += Math.max(1, Number(check.count) || check.locations?.length || 1);
  });
  const total = weights.critical + weights.moderate + weights.minor;
  if (!total) return { critical: 0, moderate: 0, minor: 0 };
  return {
    critical: Math.round((weights.critical / total) * 1000) / 10,
    moderate: Math.round((weights.moderate / total) * 1000) / 10,
    minor: Math.round((weights.minor / total) * 1000) / 10,
  };
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
      count: issue.count,
    };
  });

  const maxIssuePage = formatChecks.reduce((max, check) => {
    const pages = (check.locations || []).map((loc) => Number(loc?.page) || 0);
    return Math.max(max, ...pages, 0);
  }, 0);

  const scoreBreakdown = (sections.length
    ? sections
    : [
        { section: "Fonts" },
        { section: "Margins" },
        { section: "Indentation" },
        { section: "Spacing" },
        { section: "Alignment" },
      ]
  ).map((section) => ({
    metric: section.section || section.section_name || "General",
    score: Number(
      section.formatting_score != null ? section.formatting_score : scan?.overall_score ?? 0
    ),
    issueCount: Number(section.issue_count ?? 0),
  }));

  const rightPctRaw = scan?.right_pct;
  const wrongPctRaw = scan?.wrong_pct;
  const overallScore = Number(scan?.overall_score ?? 0);
  const rightPct =
    rightPctRaw != null ? Number(rightPctRaw) : overallScore;
  const wrongPct =
    wrongPctRaw != null ? Number(wrongPctRaw) : Math.max(0, 100 - rightPct);

  return {
    documentId: meta.documentId || scan?.manuscript_id || scan?.id || "manuscript",
    documentTitle: meta.documentTitle || "Manuscript",
    campus: meta.campus || "",
    college: meta.college || "",
    scannedAt: scan?.created_at || new Date().toISOString(),
    citationStyle: meta.citationStyle || "APA",
    overallScore,
    rightPct,
    wrongPct,
    categoryWrongPct: normalizeCategoryWrong(scan?.category_wrong_pct),
    severityPct: normalizeSeverityPct(scan?.severity_pct, formatChecks),
    scoreBreakdown,
    formatChecks,
    pageCount: Number(scan?.page_count || meta.pageCount || maxIssuePage || 0),
    pagination: scan?.pagination || meta.pagination || null,
    scanId: scan?.id,
    mechanicsId: scan?.mechanics_id || meta.mechanicsId,
    cloudinaryUrl: scan?.cloudinary_url || meta.cloudinaryUrl || "",
    documentPreview: meta.documentPreview || scan?.document_preview || null,
  };
}
