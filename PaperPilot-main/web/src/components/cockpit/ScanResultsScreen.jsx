/**
 * ScanResultsScreen — report-style results matching the compliance design:
 * brand lockup, meta strip, overall score + Compliant/Non-Compliant bar, breakdown,
 * and Issue tracing & XAI (preview + clickable findings in one section).
 */

import BackToDashboardButton from "../BackToDashboardButton.jsx";
import IssueTracingSection from "./IssueTracingSection.jsx";
import { PaperPilotMark } from "../PaperPilotLogo.jsx";
import {
  CATEGORY_STATUS_LABEL,
  formatCategoryIssuesDetail,
  formatCount,
  compliancePercentFromUnits,
  formatPct,
  formatScore,
  hasValue,
  plural,
  resolveCategoryUnitDisplays,
  resolveUnitCounts,
  roundSharesToTotal,
  sumCategoryNonCompliant,
} from "../../lib/scoreFormat.js";
import { APP_TIME_ZONE } from "../../lib/timeZone.js";

function scoreBand(score) {
  if (!hasValue(score))
    return {
      label: "NOT EVALUATED",
      textColor: "text-slate-500",
      badgeBorder: "border-slate-200",
      badgeBg: "bg-slate-50",
      scoreColor: "text-slate-500",
    };
  if (score >= 80)
    return {
      label: "COMPLIANT",
      textColor: "text-[#157347]",
      badgeBorder: "border-[#b7e4c7]",
      badgeBg: "bg-[#eaf7ef]",
      scoreColor: "text-[#157347]",
    };
  if (score >= 50)
    return {
      label: "NEEDS REVISION",
      textColor: "text-[#B57200]",
      badgeBorder: "border-[#f0d9a0]",
      badgeBg: "bg-[#fff8e8]",
      scoreColor: "text-[#B57200]",
    };
  return {
    label: "CRITICAL ISSUES",
    textColor: "text-[#B02A37]",
    badgeBorder: "border-[#f0c2c7]",
    badgeBg: "bg-[#fdf0f1]",
    scoreColor: "text-[#B02A37]",
  };
}

function ringStroke(score) {
  if (!hasValue(score)) return "#cbd5e1";
  if (score >= 80) return "#157347";
  if (score >= 50) return "#B57200";
  return "#B02A37";
}

function formatReportDate(value) {
  if (!value) return "—";
  const raw = String(value);
  const d = new Date(raw.length <= 10 ? `${raw}T12:00:00` : raw);
  if (Number.isNaN(d.getTime())) return "—";
  const datePart = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: APP_TIME_ZONE,
  });
  if (raw.length <= 10) return datePart;
  const timePart = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  });
  return `${datePart} · ${timePart}`;
}

function CategoryScoreCard({ metric, score, status, displayTotal, displayNonCompliant, displayScore }) {
  const fromUnits = compliancePercentFromUnits(displayTotal, displayNonCompliant);
  const pct = fromUnits != null ? fromUnits : hasValue(displayScore) ? Number(displayScore) : hasValue(score) ? Number(score) : null;
  const evaluated = hasValue(pct);
  const safe = evaluated ? Math.max(0, Math.min(100, Number(pct))) : 0;
  const name = String(metric || "Category").trim() || "Category";
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safe / 100) * circumference;
  const stroke = ringStroke(evaluated ? safe : null);
  const detail = formatCategoryIssuesDetail(displayNonCompliant, displayTotal)
    || (evaluated ? null : CATEGORY_STATUS_LABEL[status] || "Not evaluated")
    || (evaluated ? "0 issues found on 0 total units checked" : "Not evaluated");

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
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`text-[12px] font-extrabold tabular-nums leading-none ${
              evaluated ? "" : "text-slate-400"
            }`}
            style={evaluated ? { color: stroke } : undefined}
          >
            {evaluated ? formatPct(safe, 2) : "—"}
          </span>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-800">{name}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

export default function ScanResultsScreen({
  result,
  versionNumber = 1,
  file = null,
  documentLoading = false,
  downloadBusy = false,
  downloadError = "",
  onDownload,
  onBackToDashboard,
}) {
  if (!result) return null;

  const {
    documentTitle = "Untitled Document",
    campus,
    college,
    scannedAt,
    citationStyle = "APA",
    overallScore = null,
    rightPct,
    wrongPct,
    scoreBreakdown = [],
    formatChecks = [],
    unitsChecked,
    unitsPassed,
    unitsFailed,
    issueTotals = null,
    scoringConsistency = null,
  } = result;

  const overallUnits = resolveUnitCounts({ unitsChecked, unitsPassed, unitsFailed });
  const categoryDisplays = resolveCategoryUnitDisplays(scoreBreakdown);
  const categoryTotalSum = categoryDisplays.reduce(
    (acc, row) => acc + (hasValue(row.displayTotal) ? Number(row.displayTotal) : 0),
    0,
  );
  // Same non-compliant units the category cards show — must add up to this figure.
  const categoryIssueSum = sumCategoryNonCompliant(categoryDisplays);
  const totalUnits = overallUnits.total ?? (categoryTotalSum > 0 ? categoryTotalSum : null);
  const rawNonCompliant =
    categoryIssueSum > 0 ? categoryIssueSum : overallUnits.nonCompliant ?? null;
  const nonCompliantUnits =
    hasValue(totalUnits) && hasValue(rawNonCompliant)
      ? Math.min(Number(totalUnits), Math.max(0, Number(rawNonCompliant)))
      : rawNonCompliant;
  const compliantUnits =
    hasValue(totalUnits) && hasValue(nonCompliantUnits)
      ? Math.max(0, Number(totalUnits) - Number(nonCompliantUnits))
      : overallUnits.compliant;
  // Compliant / Non-Compliant % from those unit totals (not a separate occurrence count).
  const fromOverallUnits =
    hasValue(totalUnits) && totalUnits > 0 && hasValue(nonCompliantUnits)
      ? [
          compliancePercentFromUnits(totalUnits, nonCompliantUnits),
          (Number(nonCompliantUnits) / Number(totalUnits)) * 100,
        ]
      : [rightPct, wrongPct];
  const [shownCompliant, shownNonCompliant] = roundSharesToTotal(fromOverallUnits, 2);
  const band = scoreBand(overallScore);
  const evaluated = hasValue(overallScore);
  const compliantShare = hasValue(shownCompliant)
    ? Math.max(0, Math.min(100, Number(shownCompliant)))
    : 0;
  const nonCompliantShare = hasValue(shownNonCompliant)
    ? Math.max(0, Math.min(100, Number(shownNonCompliant)))
    : 0;
  // Match the Non-Compliant Units card / category issue lines (failed units), not occurrence tallies.
  const issuesFound = hasValue(nonCompliantUnits)
    ? Number(nonCompliantUnits)
    : hasValue(issueTotals?.occurrences)
      ? Number(issueTotals.occurrences)
      : formatChecks.filter((c) => c.result === "FAIL" || c.result === "REVIEW").length;

  const versionLabel = `v${versionNumber}.0`;
  const scannedLabel = formatReportDate(scannedAt);
  const generatedLabel = formatReportDate(new Date().toISOString());

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <PaperPilotMark className="h-10 w-10 sm:h-11 sm:w-11" />
        <span className="font-['Quicksand',sans-serif] text-lg font-bold tracking-[0.08em] text-[#172033] sm:text-xl">
          PAPERPILOT
        </span>
        <span className="font-['Quicksand',sans-serif] text-sm font-semibold tracking-[0.1em] text-[#4a5568] sm:text-base">
          * RESULTS
        </span>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Document</p>
            <p className="mt-1 truncate text-sm font-bold text-slate-900" title={documentTitle}>
              {documentTitle}
            </p>
            {(campus || college) && (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {[college, campus].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Citation style
            </p>
            <p className="mt-1 text-sm font-bold text-slate-900">
              {citationStyle} · {versionLabel}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Scanned</p>
            <p className="mt-1 text-sm font-bold text-slate-900">{scannedLabel}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Generated</p>
            <p className="mt-1 text-sm font-bold text-slate-900">{generatedLabel}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(12rem,0.9fr)_minmax(0,1.4fr)] lg:items-center">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              Overall compliance score
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-1">
              <span className={`text-5xl font-extrabold tabular-nums leading-none ${band.scoreColor}`}>
                {evaluated ? formatScore(overallScore, 0) : "—"}
              </span>
              {evaluated ? (
                <span className={`pb-1 text-2xl font-extrabold tabular-nums ${band.scoreColor}`}>%</span>
              ) : null}
            </div>
            <span
              className={`mt-3 inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${band.textColor} ${band.badgeBg} ${band.badgeBorder}`}
            >
              {band.label}
            </span>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 text-sm font-semibold">
              <div className="text-[#157347]">
                <p>Compliant {formatPct(shownCompliant, 2)}</p>
                {hasValue(unitsPassed) ? (
                  <p className="mt-0.5 text-[11px] font-medium text-[#157347]/90">
                    {formatCount(unitsPassed)} {plural(unitsPassed, "unit")} compliant
                    {hasValue(unitsChecked) ? ` of ${formatCount(unitsChecked)}` : ""}
                  </p>
                ) : null}
              </div>
              <div className="text-right text-[#B02A37]">
                <p>Non-Compliant {formatPct(shownNonCompliant, 2)}</p>
                <p className="mt-0.5 text-[11px] font-medium text-[#B02A37]/90">
                  {formatCount(issuesFound)} {plural(issuesFound, "issue")}
                </p>
              </div>
            </div>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-[#eeeeee]">
              {hasValue(shownCompliant) || hasValue(shownNonCompliant) ? (
                <>
                  <div
                    className="h-full bg-[#157347] transition-all duration-700"
                    style={{ width: `${compliantShare}%` }}
                  />
                  <div
                    className="h-full bg-[#B02A37] transition-all duration-700"
                    style={{ width: `${nonCompliantShare}%` }}
                  />
                </>
              ) : null}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-slate-200 px-3 py-3 text-center">
                <p className="text-xl font-extrabold tabular-nums text-slate-800">
                  {formatCount(totalUnits)}
                </p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Total Units
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 px-3 py-3 text-center">
                <p className="text-xl font-extrabold tabular-nums text-[#157347]">
                  {formatCount(compliantUnits)}
                </p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Compliant Units
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 px-3 py-3 text-center">
                <p className="text-xl font-extrabold tabular-nums text-[#B02A37]">
                  {formatCount(nonCompliantUnits)}
                </p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Non-Compliant Units
                </p>
              </div>
            </div>
          </div>
        </div>

        {scoringConsistency && !scoringConsistency.ok ? (
          <p
            className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] text-amber-800"
            role="alert"
          >
            These results failed an internal consistency check. Re-run the analysis before relying on
            them.
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-lg font-bold text-slate-900">Score Breakdown</h3>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categoryDisplays.map((item) => (
            <CategoryScoreCard
              key={item.metric || item.section}
              metric={item.metric || item.section}
              score={item.displayScore ?? item.score}
              status={item.status}
              displayTotal={item.displayTotal}
              displayNonCompliant={item.displayNonCompliant}
              displayScore={item.displayScore}
            />
          ))}
        </div>
      </div>

      <IssueTracingSection
        result={result}
        file={file}
        documentLoading={documentLoading}
      />

      <div className="flex flex-wrap items-center justify-end gap-3 pb-6">
        {downloadError ? (
          <p className="mr-auto text-xs text-rose-500" role="alert">
            {downloadError}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onDownload}
          disabled={downloadBusy}
          className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {downloadBusy ? "Generating PDF…" : `Download full report · ${versionLabel}`}
        </button>
        <BackToDashboardButton onClick={onBackToDashboard} />
      </div>
    </div>
  );
}
