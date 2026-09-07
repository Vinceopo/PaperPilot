import { useEffect, useMemo, useState } from "react";
import {
  Clock,
  Download,
  Lock,
  X,
} from "lucide-react";
import { scoreBand } from "../../lib/scoreBand.js";
import { downloadReport } from "../../lib/mockAnalysis.js";
import { versionToScanResult } from "../../lib/scannedLibrary.js";

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso + (iso.length <= 10 ? "T12:00:00" : "")).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function severityClass(severity) {
  if (severity === "critical") return "border-rose-200 bg-rose-50 text-rose-700";
  if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

/**
 * Read-only version detail sheet/modal for one manuscript.
 * Free plan: only the latest scanned version is accessible.
 * Premium: all versions.
 * PDF download uses the same generator + version label as Scan Results.
 */
export default function ManuscriptDetailModal({ manuscript, tier = "free", onUpgrade, onClose }) {
  const isPremium = String(tier || "free").toLowerCase() === "premium";

  const versionsDesc = useMemo(() => {
    const list = [...(manuscript?.versions || [])];
    list.sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0));
    return list;
  }, [manuscript]);

  const latestId = versionsDesc[0]?.id || "";

  const [selectedId, setSelectedId] = useState(latestId);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    setSelectedId(latestId);
  }, [manuscript?.id, latestId]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!manuscript) return null;

  const selected =
    versionsDesc.find((v) => v.id === selectedId) ||
    versionsDesc.find((v) => v.id === latestId) ||
    versionsDesc[0];
  const band = scoreBand(selected?.score);
  const versionLabel = selected ? `v${selected.versionNumber}.0` : "—";

  function selectVersion(ver) {
    const isLatest = ver.id === latestId;
    if (!isPremium && !isLatest) {
      onUpgrade?.(
        "Free plan can only open the most recent scanned version. Upgrade to Premium to access all versions."
      );
      return;
    }
    setSelectedId(ver.id);
  }

  async function onDownload() {
    if (!selected || downloadBusy) return;
    setDownloadBusy(true);
    setDownloadError("");
    try {
      const payload = versionToScanResult(manuscript, selected);
      await downloadReport(payload, { versionNumber: selected.versionNumber });
    } catch (err) {
      setDownloadError(err?.message || "Download failed.");
    } finally {
      setDownloadBusy(false);
    }
  }

  const issues = [...(selected?.issues || [])].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-slate-900/40 sm:items-center sm:justify-center sm:p-6">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ms-detail-title"
        className="relative z-10 flex h-full w-full max-w-4xl flex-col overflow-hidden bg-white shadow-xl sm:h-auto sm:max-h-[90vh] sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Manuscript detail</p>
            <h2 id="ms-detail-title" className="mt-1 truncate text-lg font-bold text-[#0F1729]">
              {manuscript.title}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {manuscript.institution} · {manuscript.citationStyle}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${band.pillClass}`}>
                {selected?.score ?? "—"} · {band.label}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">
                {versionLabel}
              </span>
              <span className="text-[11px] text-slate-400">Read-only checker view</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
            aria-label="Close detail"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[220px_1fr]">
          {/* Version selector — always shown, even for a single version */}
          <aside className="border-b border-slate-100 bg-[#F8FAFC] lg:border-b-0 lg:border-r">
            <p className="flex items-center gap-1.5 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              <Clock className="h-3.5 w-3.5" /> Versions
            </p>
            <ul className="max-h-40 space-y-1 overflow-y-auto px-3 pb-3 lg:max-h-none">
              {versionsDesc.map((ver) => {
                const vb = scoreBand(ver.score);
                const active = ver.id === selected?.id;
                const isLatest = ver.id === latestId;
                const locked = !isPremium && !isLatest;
                return (
                  <li key={ver.id}>
                    <button
                      type="button"
                      onClick={() => selectVersion(ver)}
                      className={`w-full rounded-xl px-3 py-2.5 text-left transition ${
                        active
                          ? "bg-[#0F1729] text-white shadow-sm"
                          : locked
                            ? "bg-white text-slate-400 hover:bg-slate-50"
                            : "bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold">v{ver.versionNumber}.0</p>
                        {locked ? <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : null}
                        {isLatest ? (
                          <span
                            className={`text-[9px] font-semibold uppercase tracking-wide ${
                              active ? "text-[#16bfa8]" : "text-emerald-600"
                            }`}
                          >
                            Latest
                          </span>
                        ) : null}
                      </div>
                      <p className={`mt-0.5 text-[11px] ${active ? "text-slate-300" : "text-slate-400"}`}>
                        {formatDate(ver.scannedDate)}
                      </p>
                      <p className={`mt-1 text-[10px] font-semibold ${active ? "text-[#16bfa8]" : locked ? "text-slate-400" : vb.textClass}`}>
                        {locked ? "Premium only" : `Score ${ver.score}`}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
            {!isPremium && versionsDesc.length > 1 ? (
              <p className="border-t border-slate-200/80 px-4 py-2 text-[10px] leading-relaxed text-slate-500">
                Free plan: only the latest version is viewable. Upgrade for full history.
              </p>
            ) : null}
          </aside>

          <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-7">
            {!selected ? (
              <p className="text-sm text-slate-400">No versions available.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Selected version</p>
                    <p className="text-base font-bold text-[#0F1729]">
                      {versionLabel} · {formatDate(selected.scannedDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-3xl font-bold tabular-nums ${band.textClass}`}>{selected.score}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Overall score</p>
                  </div>
                </div>

                <section className="mt-6">
                  <h3 className="text-sm font-bold text-[#0F1729]">Score breakdown</h3>
                  <ul className="mt-3 space-y-3">
                    {(selected.breakdown || []).map((row) => {
                      const rb = scoreBand(row.score);
                      return (
                        <li key={row.section}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-600">{row.section}</span>
                            <span className={`font-bold tabular-nums ${rb.textClass}`}>{row.score}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full transition-all ${rb.barClass}`}
                              style={{ width: `${Math.min(100, Math.max(0, row.score))}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                <section className="mt-7">
                  <h3 className="text-sm font-bold text-[#0F1729]">
                    Detected issues{" "}
                    <span className="font-normal text-slate-400">({issues.length})</span>
                  </h3>
                  {issues.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-400">No issues recorded for this version.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {issues.map((issue, idx) => (
                        <li
                          key={`${issue.category}-${idx}`}
                          className={`rounded-xl border px-3 py-2.5 text-xs ${severityClass(issue.severity)}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold">{issue.category}</span>
                            <span className="uppercase tracking-wide opacity-80">{issue.severity}</span>
                          </div>
                          <p className="mt-1 leading-relaxed opacity-90">{issue.description}</p>
                          {Array.isArray(issue.locations) && issue.locations.length > 0 && (
                            <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                              {issue.locations
                                .map((loc) =>
                                  loc.page != null
                                    ? `p.${loc.page}${loc.line != null ? ` · line ${loc.line}` : ""}`
                                    : loc.section || "Document"
                                )
                                .join(" · ")}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <div className="mt-8 border-t border-slate-100 pt-5">
                  {downloadError && (
                    <p className="mb-2 text-xs text-rose-500" role="alert">
                      {downloadError}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={onDownload}
                    disabled={downloadBusy}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#16bfa8] px-5 py-2.5 text-xs font-bold text-[#0F1729] shadow-sm transition hover:bg-[#12ae99] disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {downloadBusy
                      ? "Generating PDF…"
                      : `Download Report (PDF) · ${versionLabel}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
