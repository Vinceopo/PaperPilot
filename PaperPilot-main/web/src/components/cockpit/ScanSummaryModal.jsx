/**
 * Post-scan compact summary — right/wrong %, category wrong slices, severity chips.
 * Routes to reference tracing or full ScanResultsScreen.
 */

import {
  formatCount,
  formatPct as pctLabel,
  formatScore,
  hasValue,
  plural,
  roundSharesToTotal,
} from "../../lib/scoreFormat.js";

const SEVERITY_STYLES = {
  critical: "bg-rose-100 text-rose-800 border-rose-200",
  moderate: "bg-orange-100 text-orange-800 border-orange-200",
  minor: "bg-amber-100 text-amber-800 border-amber-200",
};

const SEVERITY_KEYS = ["critical", "moderate", "minor"];

export default function ScanSummaryModal({
  open,
  result,
  onViewDocument,
  onViewFullResult,
}) {
  if (!open || !result) return null;

  const [rightPct, wrongPct] = roundSharesToTotal([result.rightPct, result.wrongPct]);
  const overall = result.overallScore;
  const clusterRows = (result.categoryWrongPct || [])
    .filter((row) => hasValue(row.pct) && row.failedUnits > 0)
    .sort((a, b) => b.pct - a.pct);
  const clusterShown = roundSharesToTotal(clusterRows.map((row) => row.pct));
  const categories = clusterRows.map((row, i) => ({ ...row, shown: clusterShown[i] }));
  const severityShown = result.severityPct
    ? roundSharesToTotal(SEVERITY_KEYS.map((key) => result.severityPct[key]))
    : null;
  const severity = severityShown
    ? Object.fromEntries(SEVERITY_KEYS.map((key, i) => [key, severityShown[i]]))
    : null;
  const severityCounts = result.severityCounts;
  const issueCount = (result.formatChecks || []).filter(
    (c) => c.result === "FAIL" || c.result === "REVIEW"
  ).length;
  const unitsChecked = result.unitsChecked;
  const unitsFailed = result.unitsFailed;

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scan-summary-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#16bfa8]">Scan complete</p>
        <h2 id="scan-summary-title" className="mt-1 text-xl font-bold text-[#172033]">
          {result.documentTitle || "Your manuscript"}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Formatting compliance summary — not grammar or content.
          {issueCount > 0 ? ` ${issueCount} issue type${issueCount === 1 ? "" : "s"} flagged.` : " No format issues flagged."}
        </p>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Overall</p>
            <p className="mt-1 text-2xl font-extrabold text-[#172033]">
              {hasValue(overall) ? `${formatScore(overall, 0)}%` : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Right</p>
            <p className="mt-1 text-2xl font-extrabold text-emerald-700">{pctLabel(rightPct)}</p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide text-rose-700">Wrong</p>
            <p className="mt-1 text-2xl font-extrabold text-rose-700">{pctLabel(wrongPct)}</p>
          </div>
        </div>

        {hasValue(unitsChecked) ? (
          <p className="mt-2 text-center text-[11px] text-slate-500">
            Checked {formatCount(unitsChecked)} formatting {plural(unitsChecked, "unit")}
            {hasValue(unitsFailed) ? ` · ${formatCount(unitsFailed)} failed` : ""}
          </p>
        ) : null}
        {!result.scoringVersion ? (
          <p className="mt-2 text-center text-[11px] text-slate-500">
            Full unit counts are not stored for this scan. Re-analyse the manuscript to generate them.
          </p>
        ) : null}
        {result.scoringConsistency && result.scoringConsistency.ok === false ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] text-amber-800" role="alert">
            These results failed an internal consistency check. Re-run the analysis before relying on them.
          </p>
        ) : null}

        {categories.length ? (
          <div className="mt-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
              Where issues cluster (% of failed units)
            </p>
            <ul className="mt-2 space-y-2">
              {categories.map((row) => (
                <li key={row.section} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 font-semibold text-slate-700">{row.section}</span>
                  <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-rose-400"
                      style={{ width: `${Math.min(100, Math.max(0, row.pct))}%` }}
                    />
                  </div>
                  <span
                    className="w-12 shrink-0 text-right text-xs font-bold text-slate-600"
                    title={`${formatCount(row.failedUnits)} of ${formatCount(unitsFailed)} failed units`}
                  >
                    {pctLabel(row.shown)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : result.scoringVersion || (hasValue(unitsChecked) && Number(unitsChecked) === 0) ? (
          <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-800">
            {hasValue(unitsChecked) && Number(unitsChecked) === 0
              ? "No formatting unit could be measured, so there is no failure breakdown."
              : "No measured formatting unit failed."}
          </div>
        ) : null}

        <div className="mt-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
            Severity mix (% of issues found)
          </p>
          {severity ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {SEVERITY_KEYS.map((key) => (
                <span
                  key={key}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
                    SEVERITY_STYLES[key]
                  }`}
                  title={severityCounts ? `${formatCount(severityCounts[key])} ${plural(severityCounts[key], "issue")}` : undefined}
                >
                  {key} {pctLabel(severity[key])}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">No issues found.</p>
          )}
        </div>

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-stretch">
          <button
            type="button"
            onClick={onViewDocument}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            View Document
          </button>
          <button
            type="button"
            onClick={onViewFullResult}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
          >
            View Full Result
          </button>
        </div>
      </div>
    </div>
  );
}
