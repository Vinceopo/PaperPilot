/**
 * Shared score-band helpers — used by table badges, border bars, stat cards,
 * and the version detail view so colors/labels can never disagree.
 */

export function scoreBand(score) {
  const n = Number(score) || 0;
  if (n >= 80) {
    return {
      key: "compliant",
      label: "COMPLIANT",
      status: "compliant",
      color: "emerald",
      barClass: "bg-emerald-500",
      pillClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
      textClass: "text-emerald-600",
      softClass: "bg-emerald-50 text-emerald-700",
    };
  }
  if (n >= 50) {
    return {
      key: "needs_revision",
      label: "NEEDS REVISION",
      status: "needs_revision",
      color: "amber",
      barClass: "bg-amber-500",
      pillClass: "bg-amber-100 text-amber-800 border-amber-200",
      textClass: "text-amber-600",
      softClass: "bg-amber-50 text-amber-800",
    };
  }
  return {
    key: "critical",
    label: "CRITICAL",
    status: "critical",
    color: "rose",
    barClass: "bg-rose-500",
    pillClass: "bg-rose-100 text-rose-700 border-rose-200",
    textClass: "text-rose-600",
    softClass: "bg-rose-50 text-rose-700",
  };
}

/** Latest version = highest versionNumber, then most recent scannedDate. */
export function latestVersion(manuscript) {
  const versions = Array.isArray(manuscript?.versions) ? [...manuscript.versions] : [];
  if (!versions.length) return null;
  versions.sort((a, b) => {
    const vn = (b.versionNumber || 0) - (a.versionNumber || 0);
    if (vn !== 0) return vn;
    return String(b.scannedDate || "").localeCompare(String(a.scannedDate || ""));
  });
  return versions[0];
}

/** Table-facing fields always derived from the latest version. */
export function manuscriptSummary(manuscript) {
  const latest = latestVersion(manuscript);
  const score = Number(latest?.score ?? 0);
  const band = scoreBand(score);
  const versionCount = Array.isArray(manuscript?.versions) ? manuscript.versions.length : 0;
  return {
    ...manuscript,
    latestScore: score,
    status: band.status,
    band,
    scannedDate: latest?.scannedDate || "",
    latest,
    versionCount,
    latestVersionLabel: latest ? `v${latest.versionNumber}.0` : "—",
  };
}
