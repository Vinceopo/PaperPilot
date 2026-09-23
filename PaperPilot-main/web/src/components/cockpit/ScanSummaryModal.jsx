/**
 * Post-scan compact summary — right/wrong %, category wrong slices, severity chips.
 * Routes to reference tracing or full ScanResultsScreen.
 */

const SEVERITY_STYLES = {
  critical: "bg-rose-100 text-rose-800 border-rose-200",
  moderate: "bg-orange-100 text-orange-800 border-orange-200",
  minor: "bg-amber-100 text-amber-800 border-amber-200",
};

function pctLabel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n * 10) / 10}%`;
}

function categoryPct(row) {
  return Number(row?.pct ?? row?.pctOfWrong ?? row?.wrong_pct ?? 0);
}

export default function ScanSummaryModal({
  open,
  result,
  onViewDocument,
  onViewFullResult,
}) {
  if (!open || !result) return null;

  const rightPct = Number(result.rightPct ?? result.overallScore ?? 0);
  const wrongPct = Number(result.wrongPct ?? Math.max(0, 100 - rightPct));
  const overall = Number(result.overallScore ?? rightPct ?? 0);
  const categories = (result.categoryWrongPct || [])
    .map((row) => ({ ...row, pct: categoryPct(row) }))
    .filter((row) => row.pct > 0)
    .slice(0, 5);
  const severity = result.severityPct || { critical: 0, moderate: 0, minor: 0 };
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
            <p className="mt-1 text-2xl font-extrabold text-[#172033]">{pctLabel(overall)}</p>
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

        {unitsChecked != null ? (
          <p className="mt-2 text-center text-[11px] text-slate-500">
            Checked {unitsChecked} formatting unit{unitsChecked === 1 ? "" : "s"}
            {unitsFailed != null ? ` · ${unitsFailed} failed` : ""}
          </p>
        ) : null}

        {categories.length ? (
          <div className="mt-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
              Where issues cluster (% of wrong)
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
                  <span className="w-12 shrink-0 text-right text-xs font-bold text-slate-600">
                    {pctLabel(row.pct)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-800">
            No category-level formatting failures stood out — or the manuscript passed the rule checks.
          </div>
        )}

        <div className="mt-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Severity mix</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["critical", "moderate", "minor"]).map((key) => (
              <span
                key={key}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
                  SEVERITY_STYLES[key]
                }`}
              >
                {key} {pctLabel(severity[key])}
              </span>
            ))}
          </div>
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
