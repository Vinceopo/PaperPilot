/**
 * Persist user-scanned manuscripts for the My Manuscripts page.
 * Starts empty — only real scans are added.
 * Re-scans of the same title become new versions, not new rows.
 */

function storageKey(uid) {
  return uid ? `paperpilot.scannedManuscripts.${uid}` : "paperpilot.scannedManuscripts";
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

export function saveScannedManuscripts(items, uid) {
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify(items || []));
  } catch {
    // Ignore quota / private mode failures.
  }
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

  let nextVersion = Math.max(1, Number(versionNumber) || 1);
  if (idx >= 0) {
    const maxVer = Math.max(
      0,
      ...(list[idx].versions || []).map((v) => Number(v.versionNumber) || 0)
    );
    nextVersion = Math.max(nextVersion, maxVer + 1);
  }

  const score = Number(scanResult.overallScore ?? 0);
  const status = score >= 80 ? "compliant" : score >= 50 ? "needs_revision" : "critical";

  const version = {
    id: `ver-${documentId}-${nextVersion}-${Date.now()}`,
    manuscriptId: documentId,
    versionNumber: nextVersion,
    scannedDate: (scanResult.scannedAt || new Date().toISOString()).slice(0, 10),
    score,
    status,
    issues: (scanResult.formatChecks || [])
      .filter((c) => c.result === "FAIL" || c.result === "REVIEW")
      .map((c) => ({
        category: c.name || "Format",
        severity: c.result === "FAIL" ? "critical" : "warning",
        description: c.details || c.description || c.name,
      })),
    breakdown: (scanResult.scoreBreakdown || []).map((b) => ({
      section: b.metric || b.section || "Section",
      score: Number(b.score ?? 0),
    })),
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
  return list;
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
      score: Number(b.score ?? 0),
    })),
    formatChecks: issues.map((issue, idx) => ({
      id: `issue-${idx}`,
      name: issue.category || "Format",
      description: issue.description || issue.category || "",
      details: issue.description || "",
      result: issue.severity === "critical" ? "FAIL" : "REVIEW",
    })),
  };
}
