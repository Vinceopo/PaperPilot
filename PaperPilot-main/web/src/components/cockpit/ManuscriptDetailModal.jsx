import { useEffect, useMemo, useState } from "react";
import {
  Clock,
  Download,
  Lock,
  Trash2,
} from "lucide-react";
import ConfirmDialog from "../ConfirmDialog.jsx";
import { scoreBand } from "../../lib/scoreBand.js";
import {
  CATEGORY_STATUS_LABEL,
  formatCount,
  formatPct,
  formatScore,
  hasValue,
  plural,
} from "../../lib/scoreFormat.js";
import { downloadReport } from "../../lib/mockAnalysis.js";
import { versionScanId, versionToScanResult } from "../../lib/scannedLibrary.js";
import { isPaidTier } from "../../lib/plans.js";
import { APP_TIME_ZONE } from "../../lib/timeZone.js";
import Spinner from "../Spinner.jsx";

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

function ringStroke(score) {
  if (!hasValue(score)) return "#cbd5e1";
  if (score >= 80) return "#157347";
  if (score >= 50) return "#B57200";
  return "#B02A37";
}

/** Matches Scan Results category cards (ring + label). */
function CategoryRingCard({ section, score, status, unitsChecked, unitsFailed, issueCount }) {
  const evaluated = hasValue(score);
  const safe = evaluated ? Math.max(0, Math.min(100, Number(score))) : 0;
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safe / 100) * circumference;
  const stroke = ringStroke(evaluated ? safe : null);
  const detail = hasValue(unitsChecked)
    ? `Checked ${formatCount(unitsChecked)}${hasValue(unitsFailed) ? ` · failed ${formatCount(unitsFailed)}` : ""}`
    : hasValue(issueCount) && Number(issueCount) > 0
      ? `${formatCount(issueCount)} ${plural(issueCount, "issue")} found`
      : evaluated
        ? null
        : CATEGORY_STATUS_LABEL[status] || "Not evaluated";

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-[#f4f6f8] px-3.5 py-3">
      <div className="relative h-16 w-16 shrink-0">
        <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90" aria-hidden>
          <circle cx="32" cy="32" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="5.5" />
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={evaluated ? offset : circumference}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`text-[12px] font-extrabold tabular-nums leading-none ${evaluated ? "" : "text-slate-400"}`}
            style={evaluated ? { color: stroke } : undefined}
          >
            {evaluated ? formatPct(safe, 1) : "—"}
          </span>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-800">{section}</p>
        {detail ? <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{detail}</p> : null}
      </div>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso + (iso.length <= 10 ? "T12:00:00" : "")).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: APP_TIME_ZONE,
    });
  } catch {
    return iso;
  }
}

/** Date and time of a scan; older entries only stored the day. */
function formatDateTime(iso) {
  if (!iso || iso.length <= 10) return formatDate(iso);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return formatDate(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function severityClass(severity) {
  if (severity === "critical" || severity === "major") return "border-rose-200 bg-rose-50 text-rose-800";
  if (severity === "moderate" || severity === "warning") return "border-orange-200 bg-orange-50 text-orange-800";
  if (severity === "minor") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function formatLocationChip(loc) {
  if (loc?.page == null) return loc?.section || "Document";
  return `Page ${loc.page}${loc.line != null ? `, line ${loc.line}` : ""}`;
}

/** Trimmed / server summaries need a refetch so Score Breakdown + issues can render here. */
function needsScanHydration(version) {
  if (!version || !versionScanId(version)) return false;
  if (version.trimmed) return true;
  if (!(version.breakdown || []).length) return true;
  if ((version.issues || []).length) return false;
  return (version.breakdown || []).some((row) => Number(row.issueCount) > 0);
}

/**
 * Dedicated manuscript detail page (versions + score breakdown).
 * Free plan: only the latest scanned version is accessible. Premium: all versions.
 * Selecting a version updates this short summary in place; "View full results" opens Scan Results.
 */
export default function ManuscriptDetailModal({
  manuscript,
  tier = "free",
  onUpgrade,
  onDeleteVersion,
  onOpenResult,
  resolveResult,
}) {
  const isPremium = isPaidTier(tier);

  const versionsDesc = useMemo(() => {
    const list = [...(manuscript?.versions || [])];
    list.sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0));
    return list;
  }, [manuscript]);

  const latestId = versionsDesc[0]?.id || "";

  const [selectedId, setSelectedId] = useState(latestId);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [openingResult, setOpeningResult] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [hydrating, setHydrating] = useState(false);
  const [hydrateError, setHydrateError] = useState("");

  useEffect(() => {
    setSelectedId(latestId);
  }, [manuscript?.id, latestId]);

  const selectedFromLibrary =
    versionsDesc.find((v) => v.id === selectedId) ||
    versionsDesc.find((v) => v.id === latestId) ||
    versionsDesc[0] ||
    null;

  // Load full scan (breakdown + issues) when this version was stored trimmed / summary-only.
  useEffect(() => {
    if (!manuscript || !selectedFromLibrary || !resolveResult) return undefined;
    if (!needsScanHydration(selectedFromLibrary)) {
      setHydrating(false);
      setHydrateError("");
      return undefined;
    }
    let cancelled = false;
    setHydrating(true);
    setHydrateError("");
    void (async () => {
      try {
        const payload = await resolveResult(manuscript, selectedFromLibrary);
        if (cancelled) return;
        if (!payload) {
          setHydrateError("Could not load the full scan for this version. Check your connection, then try again.");
        }
      } catch (err) {
        if (!cancelled) {
          setHydrateError(err?.message || "Could not load the full scan for this version.");
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    manuscript,
    resolveResult,
    selectedFromLibrary?.id,
    selectedFromLibrary?.trimmed,
    (selectedFromLibrary?.issues || []).length,
    (selectedFromLibrary?.breakdown || []).length,
  ]);

  if (!manuscript) return null;

  const selected = selectedFromLibrary;
  const band = scoreBand(selected?.score);
  const versionLabel = selected ? `v${selected.versionNumber}.0` : "—";

  async function openFullResult(ver) {
    if (!ver || !onOpenResult || openingResult) return;
    setOpeningResult(true);
    try {
      await onOpenResult(ver);
    } finally {
      setOpeningResult(false);
    }
  }

  function selectVersion(ver) {
    const isLatest = ver.id === latestId;
    if (!isPremium && !isLatest) {
      onUpgrade?.(
        "Free plan can only open the most recent scanned version. Upgrade to Premium to access all versions."
      );
      return;
    }
    // Short summary only — full Scan Results open via "View full results".
    setSelectedId(ver.id);
  }

  async function onDownload() {
    if (!selected || downloadBusy) return;
    setDownloadBusy(true);
    setDownloadError("");
    try {
      const payload = resolveResult
        ? await resolveResult(manuscript, selected)
        : versionToScanResult(manuscript, selected);
      if (!payload) throw new Error("This version's report could not be loaded. Check your connection, then try again.");
      await downloadReport(payload, { versionNumber: selected.versionNumber });
    } catch (err) {
      setDownloadError(err?.message || "The report could not be downloaded. Try again in a moment.");
    } finally {
      setDownloadBusy(false);
    }
  }

  const issues = [...(selected?.issues || [])].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4 sm:px-7">
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
              {formatScore(selected?.score, 0)} · {band.label}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">
              {versionLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 gap-0 lg:grid-cols-[220px_1fr]">
        <aside className="border-b border-slate-100 bg-[#F8FAFC] lg:border-b-0 lg:border-r">
          <p className="flex items-center gap-1.5 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <Clock className="h-3.5 w-3.5" /> Versions
          </p>
          <ul className="max-h-56 space-y-1 overflow-y-auto px-3 pb-3 lg:max-h-[min(70vh,36rem)]">
            {versionsDesc.map((ver) => {
              const vb = scoreBand(ver.score);
              const active = ver.id === selected?.id;
              const isLatest = ver.id === latestId;
              const locked = !isPremium && !isLatest;
              return (
                <li key={ver.id} className="flex items-stretch gap-1">
                  <button
                    type="button"
                    onClick={() => selectVersion(ver)}
                    className={`min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left transition ${
                      active
                        ? "bg-[#0F1729] text-white shadow-sm"
                        : locked
                          ? "bg-white text-slate-400 hover:bg-slate-50"
                          : "bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs font-medium ${active ? "text-slate-300" : "text-slate-400"}`}>
                        v{ver.versionNumber}.0
                      </p>
                      {locked ? <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : null}
                    </div>
                    <p className={`mt-0.5 text-[11px] ${active ? "text-slate-300" : "text-slate-400"}`}>
                      {formatDateTime(ver.scannedAt || ver.scannedDate)}
                    </p>
                    <p className={`mt-1 text-[10px] font-semibold ${active ? "text-[#16bfa8]" : locked ? "text-slate-400" : vb.textClass}`}>
                      {locked ? "Premium only" : `Score ${formatScore(ver.score, 0)}`}
                    </p>
                  </button>
                  {onDeleteVersion ? (
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(ver.id)}
                      className="grid w-7 shrink-0 place-items-center self-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label={`Delete version ${ver.versionNumber}`}
                      title="Delete version"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
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

        <div className="min-h-0 px-5 py-5 sm:px-7">
          {!selected ? (
            <p className="text-sm text-slate-400">No versions available.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Selected version</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">
                    {versionLabel} · {formatDateTime(selected.scannedAt || selected.scannedDate)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {downloadError ? (
                    <p className="text-xs text-rose-500" role="alert">
                      {downloadError}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {onOpenResult ? (
                      <button
                        type="button"
                        onClick={() => void openFullResult(selected)}
                        disabled={openingResult}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#16bfa8] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#12ae99] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {openingResult ? "Opening…" : "View full results"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={onDownload}
                      disabled={downloadBusy}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {downloadBusy ? "Generating PDF…" : `Download full report · ${versionLabel}`}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Overall compliance score
                </p>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <div className="flex items-end gap-1">
                    <span className={`text-5xl font-extrabold tabular-nums leading-none ${band.textClass}`}>
                      {formatScore(selected.score, 0)}
                    </span>
                    <span className={`pb-1 text-2xl font-extrabold tabular-nums ${band.textClass}`}>%</span>
                  </div>
                  <span className={`mb-1 inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${band.pillClass}`}>
                    {band.label}
                  </span>
                </div>
              </div>

              <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900">Score Breakdown</h3>
                {hydrating && !(selected.breakdown || []).length ? (
                  <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                    <Spinner className="h-4 w-4 text-[#16bfa8]" />
                    Loading score breakdown…
                  </div>
                ) : null}
                {(selected.breakdown || []).length > 0 &&
                (selected.breakdown || []).every((row) => row.unitsChecked == null) ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Unit counts were not stored with this scan. Re-analyse the manuscript to generate the full scoring breakdown.
                  </p>
                ) : null}
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(selected.breakdown || []).map((row) => (
                    <CategoryRingCard
                      key={row.section}
                      section={row.section}
                      score={row.score}
                      status={row.status}
                      unitsChecked={row.unitsChecked}
                      unitsFailed={row.unitsFailed}
                      issueCount={row.issueCount}
                    />
                  ))}
                </div>
                {!hydrating && !(selected.breakdown || []).length ? (
                  <p className="mt-3 text-sm text-slate-400">No score breakdown recorded for this version.</p>
                ) : null}
              </section>

              <section className="mt-7">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[#0F1729]">
                      Detected issues{" "}
                      <span className="font-normal text-slate-400">({issues.length})</span>
                    </h3>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Each card is one rule finding — expand locations to see every page/line hit.
                    </p>
                  </div>
                </div>

                {hydrateError ? (
                  <p className="mt-3 text-sm text-rose-500" role="alert">
                    {hydrateError}
                  </p>
                ) : null}

                {hydrating && issues.length === 0 ? (
                  <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                    <Spinner className="h-4 w-4 text-[#16bfa8]" />
                    Loading detected issues…
                  </div>
                ) : issues.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-400">No issues recorded for this version.</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {issues.map((issue, idx) => {
                      const locs = Array.isArray(issue.locations) ? issue.locations : [];
                      const pages = [
                        ...new Set(locs.map((loc) => loc.page).filter((p) => p != null)),
                      ].sort((a, b) => a - b);
                      return (
                        <li
                          key={`${issue.category}-${idx}`}
                          className={`rounded-xl border px-4 py-3 ${severityClass(issue.severity)}`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-bold leading-snug">{issue.category}</p>
                              <p className="mt-1 text-xs leading-relaxed opacity-90">
                                {issue.explanation || issue.description}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full border border-current/20 bg-white/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                              {issue.severity}
                            </span>
                          </div>

                          {issue.recommendation ? (
                            <p className="mt-2 rounded-lg border border-emerald-200/60 bg-white/70 px-3 py-2 text-[11px] font-medium text-emerald-800">
                              Fix: {issue.recommendation}
                            </p>
                          ) : null}

                          {locs.length > 0 ? (
                            <details className="mt-3 group">
                              <summary className="cursor-pointer list-none text-[11px] font-bold uppercase tracking-wide opacity-80">
                                <span className="underline-offset-2 group-open:underline">
                                  {locs.length} location{locs.length === 1 ? "" : "s"}
                                  {pages.length
                                    ? ` · pages ${pages.slice(0, 6).join(", ")}${pages.length > 6 ? "…" : ""}`
                                    : ""}
                                </span>
                              </summary>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {locs.slice(0, 40).map((loc, locIdx) => (
                                  <span
                                    key={`${idx}-${locIdx}`}
                                    className="rounded-md border border-current/15 bg-white/80 px-2 py-1 font-mono text-[10px] font-semibold"
                                  >
                                    {formatLocationChip(loc)}
                                    {loc.section ? ` · ${loc.section}` : ""}
                                  </span>
                                ))}
                                {locs.length > 40 ? (
                                  <span className="rounded-md bg-white/60 px-2 py-1 text-[10px] font-semibold">
                                    +{locs.length - 40} more
                                  </span>
                                ) : null}
                              </div>
                            </details>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingDeleteId)}
        title="Delete this version?"
        message="It will be removed on web and mobile. The other versions keep their numbers."
        confirmLabel="Delete version"
        tone="danger"
        busy={deleteBusy}
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={async () => {
          const id = pendingDeleteId;
          if (!id) return;
          setDeleteBusy(true);
          try {
            await onDeleteVersion?.(manuscript.id, id);
          } catch (err) {
            setDeleteError(err?.message || "Could not delete this version.");
          } finally {
            setDeleteBusy(false);
            setPendingDeleteId(null);
          }
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteError)}
        title="Something went wrong"
        message={deleteError}
        confirmLabel="OK"
        cancelLabel={null}
        tone="danger"
        onConfirm={() => setDeleteError("")}
        onCancel={() => setDeleteError("")}
      />
    </div>
  );
}
