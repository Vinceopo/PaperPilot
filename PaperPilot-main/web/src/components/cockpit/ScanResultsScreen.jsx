/**
 * ScanResultsScreen — report-style results matching the compliance design:
 * brand lockup, meta strip, overall score + Right/Incorrect bar, breakdown,
 * and Issues detected (XAI). Why/Fix labels appear in the downloaded PDF only.
 */

import { useEffect, useState } from "react";
import DocumentPagePreview from "./DocumentPagePreview.jsx";
import IssuesDetectedPanel from "./IssuesDetectedPanel.jsx";
import { PaperPilotMark } from "../PaperPilotLogo.jsx";
import {
  CATEGORY_STATUS_LABEL,
  formatCount,
  formatPct,
  formatScore,
  hasValue,
  plural,
  roundSharesToTotal,
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

function barColorClass(score) {
  if (score >= 80) return "bg-[#157347]";
  if (score >= 60) return "bg-[#B57200]";
  return "bg-[#B02A37]";
}

function barTextClass(score) {
  if (score >= 80) return "text-[#157347]";
  if (score >= 60) return "text-[#B57200]";
  return "text-[#B02A37]";
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

function ScoreBar({ metric, score, status }) {
  const [width, setWidth] = useState(0);
  const evaluated = hasValue(score);
  const safe = evaluated ? Math.max(0, Math.min(100, Number(score))) : 0;

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setTimeout(() => setWidth(safe), 60);
    });
    return () => cancelAnimationFrame(raf);
  }, [safe]);

  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_3.25rem] items-center gap-3 sm:grid-cols-[9rem_minmax(0,1fr)_3.5rem]">
      <span className="truncate text-sm font-semibold text-slate-700">
        {metric}
        {!evaluated ? (
          <span className="ml-1 font-normal text-slate-400">
            · {CATEGORY_STATUS_LABEL[status] || "N/A"}
          </span>
        ) : null}
      </span>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#eeeeee]">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${
            evaluated ? barColorClass(safe) : "bg-slate-300"
          }`}
          style={{ width: evaluated ? `${width}%` : "0%" }}
        />
      </div>
      <span
        className={`text-right text-sm font-bold tabular-nums ${
          evaluated ? barTextClass(safe) : "text-slate-400"
        }`}
      >
        {evaluated ? formatPct(safe) : "N/A"}
      </span>
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
  onUploadNewVersion,
  onBackToDashboard,
  onViewDocument,
  onBackToSummary,
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
    pageCount = 0,
    pagination = null,
    cloudinaryUrl = "",
    documentName = "",
    documentPreview = null,
    unitsChecked,
    issueTotals = null,
    scoringConsistency = null,
    scoringVersion = null,
  } = result;

  const [shownRight, shownIncorrect] = roundSharesToTotal([rightPct, wrongPct]);
  const criticalTypes = formatChecks.filter((c) => c.result === "FAIL").length;
  const warningTypes = formatChecks.filter((c) => c.result === "REVIEW").length;
  const issueTypes = formatChecks.filter((c) => c.result === "FAIL" || c.result === "REVIEW").length;
  const band = scoreBand(overallScore);
  const evaluated = hasValue(overallScore);
  const rightShare = hasValue(shownRight) ? Math.max(0, Math.min(100, Number(shownRight))) : 0;
  const incorrectShare = hasValue(shownIncorrect)
    ? Math.max(0, Math.min(100, Number(shownIncorrect)))
    : 0;

  const versionLabel = `v${versionNumber}.0`;
  const scannedLabel = formatReportDate(scannedAt);
  const generatedLabel = formatReportDate(new Date().toISOString());
  const hasPreview = Boolean(file || documentLoading || cloudinaryUrl || documentPreview);

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

      {(onBackToSummary || onViewDocument) && (
        <div className="flex flex-wrap gap-3">
          {onBackToSummary ? (
            <button
              type="button"
              onClick={onBackToSummary}
              className="text-[11px] font-semibold text-[#16bfa8] hover:underline"
            >
              ← Back to summary
            </button>
          ) : null}
          {onViewDocument ? (
            <button
              type="button"
              onClick={onViewDocument}
              className="text-[11px] font-semibold text-slate-500 hover:text-[#172033] hover:underline"
            >
              Open reference tracing
            </button>
          ) : null}
        </div>
      )}

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
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <span className={`text-5xl font-extrabold tabular-nums leading-none ${band.scoreColor}`}>
                {evaluated ? formatScore(overallScore, 0) : "—"}
              </span>
              <span className="pb-1 text-base font-semibold text-slate-400">/ 100</span>
            </div>
            <span
              className={`mt-3 inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${band.textColor} ${band.badgeBg} ${band.badgeBorder}`}
            >
              {band.label}
            </span>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
              <span className="text-[#157347]">
                Right {formatPct(shownRight)}
              </span>
              <span className="text-[#B02A37]">
                Incorrect {formatPct(shownIncorrect)}
              </span>
            </div>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-[#eeeeee]">
              {hasValue(shownRight) || hasValue(shownIncorrect) ? (
                <>
                  <div
                    className="h-full bg-[#157347] transition-all duration-700"
                    style={{ width: `${rightShare}%` }}
                  />
                  <div
                    className="h-full bg-[#B02A37] transition-all duration-700"
                    style={{ width: `${incorrectShare}%` }}
                  />
                </>
              ) : null}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-slate-200 px-3 py-3 text-center">
                <p className="text-xl font-extrabold tabular-nums text-[#B02A37]">{criticalTypes}</p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Errors
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 px-3 py-3 text-center">
                <p className="text-xl font-extrabold tabular-nums text-[#B57200]">{warningTypes}</p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Warnings
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 px-3 py-3 text-center">
                <p className="text-xl font-extrabold tabular-nums text-slate-800">{issueTypes}</p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Issue types
                </p>
              </div>
            </div>
          </div>
        </div>

        {hasValue(unitsChecked) ? (
          <p className="mt-4 text-center text-[11px] text-slate-500">
            {Number(unitsChecked) === 0
              ? "No formatting unit could be measured in this document."
              : `Based on ${formatCount(unitsChecked)} measured formatting ${plural(unitsChecked, "unit")}`}
            {issueTotals
              ? ` · ${formatCount(issueTotals.occurrences)} ${plural(issueTotals.occurrences, "issue")} found`
              : ""}
          </p>
        ) : null}
        {scoringConsistency && !scoringConsistency.ok ? (
          <p
            className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] text-amber-800"
            role="alert"
          >
            These results failed an internal consistency check. Re-run the analysis before relying on
            them.
          </p>
        ) : null}
        {!scoringVersion ? (
          <p className="mt-3 text-center text-[11px] text-slate-500">
            This scan was saved without the full scoring breakdown. Re-analyse the manuscript to
            generate checked, passed, and failed unit counts.
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Score breakdown</h3>
            <p className="mt-0.5 text-sm text-slate-500">
              Share of measured text that matched the format in each category
            </p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-[#157347]" /> 80% and above
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-[#B57200]" /> 60–79%
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-[#B02A37]" /> Below 60%
            </span>
          </div>
        </div>
        <div className="mt-5 space-y-4">
          {scoreBreakdown.map((item) => (
            <ScoreBar
              key={item.metric || item.section}
              metric={item.metric || item.section}
              score={item.score}
              status={item.status}
            />
          ))}
        </div>
      </div>

      {hasPreview || onViewDocument ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-[#f8fffd] px-5 py-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Document preview</h3>
              <p className="text-[11px] text-slate-500">
                Starts on page 1. Scroll to read every page, or trace an issue to jump to it.
              </p>
            </div>
            {onViewDocument ? (
              <button
                type="button"
                onClick={onViewDocument}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-700"
              >
                Trace issues in document
              </button>
            ) : null}
          </div>
          {hasPreview ? (
            <div className="bg-[#e8ecf1] p-3">
              <DocumentPagePreview
                file={file}
                loading={documentLoading}
                documentUrl={cloudinaryUrl}
                documentName={documentName}
                preview={documentPreview}
                emptyLabel="Preview unavailable for this version."
                paged
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Issues detected</h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Grouped by page with explanations and fix suggestions. Each page starts at line 1.
            </p>
          </div>
          {issueTypes > 0 ? (
            <span className="shrink-0 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">
              {issueTypes} issue type{issueTypes === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        <IssuesDetectedPanel
          formatChecks={formatChecks}
          pageCount={pageCount}
          pagination={pagination}
        />
      </div>

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
        <button
          type="button"
          onClick={onUploadNewVersion}
          className="rounded-xl bg-[#16bfa8] px-6 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#12ae99]"
        >
          Upload New Version
        </button>
        {onBackToDashboard ? (
          <button
            type="button"
            onClick={onBackToDashboard}
            className="rounded-xl bg-[#172033] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#243049]"
          >
            Back to dashboard
          </button>
        ) : null}
      </div>
    </div>
  );
}
