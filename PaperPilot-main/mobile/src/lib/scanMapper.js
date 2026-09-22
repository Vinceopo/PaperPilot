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

export function mapComplianceScanToResult(scan, meta = {}) {
  const issues = Array.isArray(scan?.issues) ? scan.issues : [];
  const sections = Array.isArray(scan?.sections) ? scan.sections : [];

  const formatChecks = issues.map((issue, index) => {
    const severity = String(issue.severity || "moderate").toLowerCase();
    return {
      id: issue.issue_type || `issue-${index}`,
      name: issue.title || issue.issue_type || "Formatting issue",
      description: issue.summary || "",
      result: severity === "critical" ? "FAIL" : "REVIEW",
      severity,
      finding: issue.summary || issue.title || "",
      explanation: issue.explanation || "",
      recommendation: issue.recommendation || "",
      locations: Array.isArray(issue.locations) ? issue.locations : [],
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
    metric: section.section || "General",
    score: Number(section.formatting_score ?? scan?.overall_score ?? 0),
  }));

  return {
    documentId: meta.documentId || scan?.manuscript_id || scan?.id || "manuscript",
    documentTitle: meta.documentTitle || "Manuscript",
    campus: meta.campus || "",
    college: meta.college || "",
    scannedAt: scan?.created_at || new Date().toISOString(),
    citationStyle: meta.citationStyle || "APA",
    overallScore: Number(scan?.overall_score ?? 0),
    scoreBreakdown,
    formatChecks,
    pageCount: Number(scan?.page_count || meta.pageCount || maxIssuePage || 0),
    pagination: scan?.pagination || meta.pagination || null,
    scanId: scan?.id,
    mechanicsId: scan?.mechanics_id || meta.mechanicsId,
  };
}
