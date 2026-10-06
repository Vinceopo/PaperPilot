/**
 * Persist user-scanned manuscripts for the My Manuscripts page.
 * React Native: AsyncStorage instead of localStorage.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { scoreBand } from "./scoreBand";

function storageKey(uid) {
  return uid ? `paperpilot.scannedManuscripts.${uid}` : "paperpilot.scannedManuscripts";
}

function dismissedKey(uid) {
  return uid ? `paperpilot.dismissedScans.${uid}` : "paperpilot.dismissedScans";
}

export function versionScanId(version) {
  return String(version?.scanId || version?.scanResult?.scanId || "");
}

export async function loadDismissedScanIds(uid) {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(dismissedKey(uid))) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

/** Scans the user deleted locally, so GET /scans does not bring them back. */
export async function dismissScanIds(ids, uid) {
  const list = [...(ids || [])].filter(Boolean);
  if (!list.length) return;
  const next = await loadDismissedScanIds(uid);
  list.forEach((id) => next.add(String(id)));
  try {
    await AsyncStorage.setItem(dismissedKey(uid), JSON.stringify([...next]));
  } catch {
    // Ignore storage failures.
  }
}

export function normalizeTitle(title) {
  return String(title || "")
    .trim()
    .toLowerCase()
    .replace(/\.(pdf|docx)$/i, "")
    .replace(/[\s_–—−-]+/g, " ")
    .replace(/\s+/g, " ");
}

export async function loadScannedManuscripts(uid) {
  try {
    const raw = await AsyncStorage.getItem(storageKey(uid));
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return dedupeManuscriptsByTitle(parsed);
  } catch {
    return [];
  }
}

export async function saveScannedManuscripts(items, uid) {
  try {
    await AsyncStorage.setItem(storageKey(uid), JSON.stringify(items || []));
  } catch {
    // Ignore quota failures.
  }
}

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

/** Summaries from GET /scans for scans this device has not stored (scanned on another device). */
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

/** Store a freshly fetched full result on a version that only had a server summary. */
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

  const score =
    scanResult.overallScore == null || !Number.isFinite(Number(scanResult.overallScore))
      ? null
      : Number(scanResult.overallScore);
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
      score: b.score == null || !Number.isFinite(Number(b.score)) ? null : Number(b.score),
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
      ...issues.flatMap((issue) => (issue.locations || []).map((loc) => Number(loc.page) || 0))
    ),
  };
}
