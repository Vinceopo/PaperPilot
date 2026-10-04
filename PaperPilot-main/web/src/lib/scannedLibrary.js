/**
 * Persist user-scanned manuscripts for the My Manuscripts page.
 * Starts empty — only real scans are added.
 * Re-scans of the same title become new versions, not new rows.
 */

import { scoreBand } from "./scoreBand.js";

function storageKey(uid) {
  return uid ? `paperpilot.scannedManuscripts.${uid}` : "paperpilot.scannedManuscripts";
}

function dismissedKey(uid) {
  return uid ? `paperpilot.dismissedScans.${uid}` : "paperpilot.dismissedScans";
}

// Browser storage is ~5 MB per site; a long thesis can report thousands of issue
// locations, so stored copies are capped and the full result is refetched by scanId.
const LOCATION_CAPS = [300, 80, 15, 0];

export function versionScanId(version) {
  return String(version?.scanId || version?.scanResult?.scanId || "");
}

function capLocations(list, cap) {
  const locations = Array.isArray(list) ? list : [];
  return locations.length > cap ? locations.slice(0, cap) : locations;
}

function compactVersion(version, cap) {
  let trimmed = Boolean(version.trimmed);
  const issues = (version.issues || []).map((issue) => {
    const locations = capLocations(issue.locations, cap);
    if (locations.length !== (issue.locations || []).length) trimmed = true;
    return { ...issue, locations, count: issue.count == null ? null : issue.count };
  });
  let scanResult = version.scanResult;
  if (scanResult && typeof scanResult === "object") {
    const { documentPreview: _preview, ...rest } = scanResult;
    scanResult = {
      ...rest,
      formatChecks: (rest.formatChecks || []).map((check) => {
        const locations = capLocations(check.locations, cap);
        if (locations.length !== (check.locations || []).length) trimmed = true;
        return { ...check, locations, count: check.count == null ? null : check.count };
      }),
    };
  }
  return { ...version, scanId: versionScanId(version) || undefined, issues, scanResult, trimmed };
}

function compactLibrary(items, cap) {
  return (items || []).map((m) => ({
    ...m,
    versions: (m.versions || []).map((v) => compactVersion(v, cap)),
  }));
}

function summaryOnlyLibrary(items) {
  return (items || []).map((m) => ({
    ...m,
    versions: (m.versions || []).map((v) => ({
      ...v,
      scanId: versionScanId(v) || undefined,
      issues: (v.issues || []).map(({ locations: _locations, ...issue }) => issue),
      scanResult: null,
      trimmed: true,
    })),
  }));
}

export function loadDismissedScanIds(uid) {
  try {
    const parsed = JSON.parse(localStorage.getItem(dismissedKey(uid)) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

export function dismissScanIds(ids, uid) {
  const list = [...(ids || [])].filter(Boolean);
  if (!list.length) return;
  const next = loadDismissedScanIds(uid);
  list.forEach((id) => next.add(String(id)));
  try {
    localStorage.setItem(dismissedKey(uid), JSON.stringify([...next]));
  } catch {
    // Ignore quota / private mode failures.
  }
}

/** Normalize titles so the same file name always matches (e.g. PAPERPILOT–FINAL_MANUSCRIPT). */
export function normalizeTitle(title) {
  return String(title || "")
    .trim()
    .toLowerCase()
    .replace(/\.(pdf|docx)$/i, "")
    .replace(/[\s_–—−-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function loadScannedManuscripts(uid) {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return dedupeManuscriptsByTitle(parsed);
  } catch {
    return [];
  }
}

/** Returns false only when even the summary-only copy could not be written. */
export function saveScannedManuscripts(items, uid) {
  const attempts = [...LOCATION_CAPS.map((cap) => () => compactLibrary(items, cap)), () => summaryOnlyLibrary(items)];
  for (const build of attempts) {
    try {
      localStorage.setItem(storageKey(uid), JSON.stringify(build()));
      return true;
    } catch {
      // Quota exceeded — retry with a smaller copy.
    }
  }
  return false;
}

/** Summaries from GET /scans for scans this browser has not stored (other device, or lost to quota). */
export function mergeServerScans(items, summaries, dismissed = new Set()) {
  const list = (Array.isArray(items) ? items : []).map((m) => ({ ...m, versions: [...(m.versions || [])] }));
  const known = new Set(list.flatMap((m) => m.versions.map(versionScanId)).filter(Boolean));
  const monthPrefix = new Date().toISOString().slice(0, 7);
  let added = 0;

  for (const scan of Array.isArray(summaries) ? summaries : []) {
    const scanId = String(scan?.id || "");
    if (!scanId || known.has(scanId) || dismissed.has(scanId)) continue;
    const manuscriptId = String(scan.manuscript_id || "");
    const title = String(scan.title || "").trim() || "Untitled manuscript";
    const titleKey = normalizeTitle(title);
    let idx = list.findIndex(
      (m) =>
        m.id === manuscriptId ||
        m.serverManuscriptId === manuscriptId ||
        (titleKey && normalizeTitle(m.title) === titleKey)
    );
    if (idx < 0) {
      list.push({
        id: manuscriptId || `doc-${scanId}`,
        serverManuscriptId: manuscriptId || undefined,
        title,
        institution: "—",
        citationStyle: "APA",
        createdThisMonth: String(scan.created_at || "").startsWith(monthPrefix),
        versions: [],
      });
      idx = list.length - 1;
    } else if (!list[idx].serverManuscriptId && manuscriptId) {
      list[idx] = { ...list[idx], serverManuscriptId: manuscriptId };
    }
    const score = scan.overall_score == null ? null : Number(scan.overall_score);
    list[idx].versions.push({
      id: `ver-${scanId}`,
      manuscriptId: list[idx].id,
      versionNumber: Number(scan.version_number) || 0,
      scannedDate: String(scan.created_at || new Date().toISOString()).slice(0, 10),
      score,
      status: scoreBand(score).status,
      issues: [],
      breakdown: [],
      scanId,
      versionId: scan.manuscript_version_id || "",
      scanResult: null,
      trimmed: true,
    });
    known.add(scanId);
    added += 1;
  }
  return { items: added ? dedupeManuscriptsByTitle(list) : items, added };
}

/** Store a freshly fetched full result on its version (after it was trimmed or server-only). */
export function attachScanResult(items, manuscriptId, versionId, scanResult) {
  return (items || []).map((m) => {
    if (m.id !== manuscriptId) return m;
    return {
      ...m,
      versions: (m.versions || []).map((v) => {
        if (v.id !== versionId) return v;
        return {
          ...v,
          ...versionPartsFromResult(scanResult),
          scanId: versionScanId(v) || scanResult.scanId,
          scanResult: { ...scanResult, documentId: m.id, versionNumber: v.versionNumber },
          trimmed: false,
        };
      }),
    };
  });
}

function versionPartsFromResult(scanResult) {
  return {
    issues: (scanResult.formatChecks || [])
      .filter((c) => c.result === "FAIL" || c.result === "REVIEW")
      .map((c) => ({
        category: c.name || "Format",
        severity:
          c.severity === "minor"
            ? "minor"
            : c.severity === "moderate" || c.result === "REVIEW"
              ? "moderate"
              : "critical",
        description: c.finding || c.details || c.description || c.name,
        finding: c.finding || c.details || "",
        explanation: c.explanation || c.details || c.description || "",
        recommendation: c.recommendation || "",
        locations: Array.isArray(c.locations) ? c.locations : [],
        count: c.count,
      })),
    breakdown: (scanResult.scoreBreakdown || []).map((b) => ({
      section: b.metric || b.section || "Section",
      score: b.score == null ? null : Number(b.score),
      status: b.status || null,
      unitsChecked: b.unitsChecked == null ? null : Number(b.unitsChecked),
      unitsPassed: b.unitsPassed == null ? null : Number(b.unitsPassed),
      unitsFailed: b.unitsFailed == null ? null : Number(b.unitsFailed),
      issueCount: b.issueCount == null ? null : Number(b.issueCount),
      failedShare: b.failedShare == null ? null : Number(b.failedShare),
    })),
  };
}

/**
 * Merge rows that share the same normalized title into one manuscript with versions.
 * Fixes earlier duplicates created when each scan got a fresh documentId.
 */
export function dedupeManuscriptsByTitle(items) {
  const map = new Map();
  for (const m of items || []) {
    const key = normalizeTitle(m.title) || m.id;
    if (!map.has(key)) {
      map.set(key, {
        ...m,
        versions: [...(m.versions || [])],
      });
      continue;
    }
    const existing = map.get(key);
    existing.versions = [...(existing.versions || []), ...(m.versions || [])];
    if (m.createdThisMonth) existing.createdThisMonth = true;
  }

  return [...map.values()].map((m) => {
    const chronological = [...(m.versions || [])].sort((a, b) => {
      const da = String(a.scannedDate || "");
      const db = String(b.scannedDate || "");
      if (da !== db) return da.localeCompare(db);
      return (Number(a.versionNumber) || 0) - (Number(b.versionNumber) || 0);
    });
    const versions = chronological
      .map((v, i) => ({
        ...v,
        manuscriptId: m.id,
        versionNumber: i + 1,
      }))
      .reverse();
    return { ...m, versions };
  });
}

/**
 * Map a scan-flow ScanResult into a ManuscriptVersion + upsert into the library.
 * Matches by documentId first, then by normalized title so re-scans become versions.
 */
export function upsertFromScanResult(items, scanResult, versionNumber = 1) {
  const list = dedupeManuscriptsByTitle(Array.isArray(items) ? items : []);
  const title = scanResult.documentTitle || "Untitled manuscript";
  const titleKey = normalizeTitle(title);

  let idx = list.findIndex((m) => m.id === scanResult.documentId);
  if (idx < 0 && titleKey) {
    idx = list.findIndex((m) => normalizeTitle(m.title) === titleKey);
  }

  const documentId =
    (idx >= 0 ? list[idx].id : null) || scanResult.documentId || `doc-${Date.now()}`;

  const maxVer =
    idx >= 0
      ? Math.max(0, ...(list[idx].versions || []).map((v) => Number(v.versionNumber) || 0))
      : 0;
  const nextVersion = maxVer + 1;
  void versionNumber;

  const score = scanResult.overallScore == null ? null : Number(scanResult.overallScore);
  const status = scoreBand(score).status;

  const version = {
    id: `ver-${documentId}-${nextVersion}-${Date.now()}`,
    manuscriptId: documentId,
    versionNumber: nextVersion,
    scannedDate: (scanResult.scannedAt || new Date().toISOString()).slice(0, 10),
    score,
    status,
    ...versionPartsFromResult(scanResult),
    scanId: scanResult.scanId || undefined,
    versionId: scanResult.versionId || "",
    // Full scan payload so My Manuscripts can download the same PDF as Scan Results.
    scanResult: {
      ...scanResult,
      documentId,
      documentTitle: scanResult.documentTitle || title,
      versionNumber: nextVersion,
    },
  };

  if (idx >= 0) {
    const existing = list[idx];
    list[idx] = {
      ...existing,
      id: documentId,
      title: title || existing.title,
      institution: scanResult.campus || existing.institution || "—",
      citationStyle: scanResult.citationStyle || existing.citationStyle || "APA",
      versions: [version, ...(existing.versions || [])],
    };
  } else {
    list.unshift({
      id: documentId,
      title,
      institution: scanResult.campus || scanResult.college || "—",
      citationStyle: scanResult.citationStyle || "APA",
      createdThisMonth: true,
      versions: [version],
    });
  }
  return dedupeManuscriptsByTitle(list);
}

/**
 * Drop one stored version and renumber the rest with the same chronological
 * rules as dedupeManuscriptsByTitle. An empty manuscript is removed.
 */
export function removeManuscriptVersion(items, manuscriptId, versionId) {
  const stripped = (items || [])
    .map((m) => {
      if (m.id !== manuscriptId) return m;
      return {
        ...m,
        versions: (m.versions || []).filter((v) => v.id !== versionId),
      };
    })
    .filter((m) => Array.isArray(m.versions) && m.versions.length > 0);
  return dedupeManuscriptsByTitle(stripped);
}

/**
 * Rebuild a ScanResult-shaped object for PDF download from a stored version.
 * Prefers the full `scanResult` snapshot when present.
 */
export function versionToScanResult(manuscript, version) {
  if (!version) return null;
  if (version.scanResult && typeof version.scanResult === "object") {
    return {
      ...version.scanResult,
      documentTitle: version.scanResult.documentTitle || manuscript?.title || "Untitled",
      campus: version.scanResult.campus || manuscript?.institution,
      citationStyle: version.scanResult.citationStyle || manuscript?.citationStyle,
      versionNumber: version.versionNumber,
    };
  }

  const issues = version.issues || [];
  return {
    documentId: manuscript?.id || version.manuscriptId,
    documentTitle: manuscript?.title || "Untitled",
    campus: manuscript?.institution || "—",
    citationStyle: manuscript?.citationStyle || "APA",
    scannedAt: version.scannedDate,
    overallScore: version.score,
    versionNumber: version.versionNumber,
    scoreBreakdown: (version.breakdown || []).map((b) => ({
      metric: b.section,
      score: b.score == null ? null : Number(b.score),
      status: b.status || null,
      unitsChecked: b.unitsChecked == null ? null : Number(b.unitsChecked),
      unitsPassed: b.unitsPassed == null ? null : Number(b.unitsPassed),
      unitsFailed: b.unitsFailed == null ? null : Number(b.unitsFailed),
      issueCount: b.issueCount == null ? null : Number(b.issueCount),
      failedShare: b.failedShare == null ? null : Number(b.failedShare),
    })),
    formatChecks: issues.map((issue, idx) => ({
      id: `issue-${idx}`,
      name: issue.category || "Format",
      description: issue.description || issue.category || "",
      details: issue.finding || issue.description || "",
      finding: issue.finding || issue.description || "",
      explanation: issue.explanation || issue.description || "",
      recommendation: issue.recommendation || "",
      severity: issue.severity || "moderate",
      locations: Array.isArray(issue.locations) ? issue.locations : [],
      result: issue.severity === "critical" || issue.severity === "major" ? "FAIL" : "REVIEW",
    })),
    pageCount: Math.max(
      0,
      ...issues.flatMap((issue) =>
        (issue.locations || []).map((loc) => Number(loc.page) || 0)
      )
    ),
  };
}
