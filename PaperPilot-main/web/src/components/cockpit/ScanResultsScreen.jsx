/**
 * ScanResultsScreen — full results with right/wrong, per-category scores,
 * issues panel, and optional document preview for jump-back.
 */

import { useEffect, useRef, useState } from "react";
import IssuesDetectedPanel from "./IssuesDetectedPanel.jsx";
import DocumentPagePreview from "./DocumentPagePreview.jsx";

function scoreBand(score) {
  if (score >= 80)
    return {
      label: "COMPLIANT",
      textColor: "text-emerald-600",
      ringColor: "#16bfa8",
      badgeBorder: "border-emerald-200",
      badgeBg: "bg-emerald-50",
    };
  if (score >= 50)
    return {
      label: "NEEDS REVISION",
      textColor: "text-amber-600",
      ringColor: "#f59e0b",
      badgeBorder: "border-amber-200",
      badgeBg: "bg-amber-50",
    };
  return {
    label: "CRITICAL ISSUES",
    textColor: "text-rose-600",
    ringColor: "#ef4444",
    badgeBorder: "border-rose-200",
    badgeBg: "bg-rose-50",
  };
}

function barColorClass(score) {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-400";
  return "bg-rose-500";
}

function CircularScore({ score }) {
  const RADIUS = 52;
  const circumference = 2 * Math.PI * RADIUS;
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(null);
  const band = scoreBand(score);

  useEffect(() => {
    const DURATION = 1100;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / DURATION, 1);
      const eased = 1 - (1 - t) ** 3;
      setProgress(eased * score);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [score]);

  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="relative">
        <svg width="148" height="148" viewBox="0 0 148 148" className="-rotate-90">
          <circle cx="74" cy="74" r={RADIUS} fill="none" stroke="#e2e8f0" strokeWidth="14" />
          <circle
            cx="74"
            cy="74"
            r={RADIUS}
            fill="none"
            stroke={band.ringColor}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-extrabold text-slate-800">{Math.round(progress)}</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">/100</span>
        </div>
      </div>
      <span
        className={`rounded-full border px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider
          ${band.textColor} ${band.badgeBg} ${band.badgeBorder}`}
      >
        {band.label}
      </span>
      <p className="text-center text-xs text-slate-400">
        Average of categories that were actually measured
      </p>
    </div>
  );
}

function ScoreBar({ metric, score, issueCount = 0 }) {
  const [width, setWidth] = useState(0);
  const safe = Math.max(0, Math.min(100, Number(score) || 0));

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setTimeout(() => setWidth(safe), 60);
    });
    return () => cancelAnimationFrame(raf);
  }, [safe]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-600">
          {metric}
          {issueCount > 0 ? (
            <span className="ml-1.5 font-normal text-slate-400">
              · {issueCount} issue{issueCount === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="ml-1.5 font-normal text-emerald-600">· pass</span>
          )}
        </span>
        <span
          className={`font-bold tabular-nums ${
            safe >= 80 ? "text-emerald-600" : safe >= 50 ? "text-amber-600" : "text-rose-500"
          }`}
        >
          {Math.round(safe * 10) / 10}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-2 rounded-full transition-all duration-700 ease-out ${barColorClass(safe)}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export default function ScanResultsScreen({
  result,
  versionNumber = 1,
  file = null,
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
    overallScore = 0,
    rightPct,
    wrongPct,
    scoreBreakdown = [],
    formatChecks = [],
    pageCount = 0,
    pagination = null,
    cloudinaryUrl = "",
    documentPreview = null,
    unitsChecked,
    unitsFailed,
  } = result;

  const totalErrors = formatChecks.filter((c) => c.result === "FAIL").length;
  const warnings = formatChecks.filter((c) => c.result === "REVIEW").length;
  const checksRun = formatChecks.length;
  const issuesFound = totalErrors + warnings;
  const passCount = Math.max(0, checksRun - totalErrors - warnings);
  const right = Number(rightPct ?? overallScore ?? 0);
  const wrong = Number(wrongPct ?? Math.max(0, 100 - right));

  const scannedDate = scannedAt
    ? new Date(scannedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  const versionLabel = `v${versionNumber}.0`;
  const hasPreview = Boolean(file || cloudinaryUrl || documentPreview);

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-[#172033] p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            {(onBackToSummary || onBackToDashboard) && (
              <div className="mb-2 flex flex-wrap gap-3">
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
                    className="text-[11px] font-semibold text-slate-300 hover:text-white hover:underline"
                  >
                    Open reference tracing
                  </button>
                ) : null}
              </div>
            )}
            <span className="inline-block rounded-full border border-[#16bfa8]/40 bg-[#16bfa8]/10 px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#16bfa8]">
              SCOPE: FORMATTING ONLY
            </span>
            <h2 className="mt-2 text-xl font-bold leading-snug text-white">{documentTitle}</h2>
            {(campus || college) && (
              <p className="mt-1 text-sm text-slate-400">
                {[college, campus].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>

          <div className="shrink-0">
            <table className="text-xs">
              <tbody>
                <tr>
                  <td className="pr-4 text-slate-500">Scanned</td>
                  <td className="font-medium text-slate-200">{scannedDate}</td>
                </tr>
                <tr>
                  <td className="pr-4 pt-1 text-slate-500">Version</td>
                  <td className="pt-1 font-medium text-slate-200">{versionLabel}</td>
                </tr>
                <tr>
                  <td className="pr-4 pt-1 text-slate-500">Citation style</td>
                  <td className="pt-1 font-medium text-slate-200">{citationStyle}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Structure and content are not evaluated — results reflect formatting compliance only.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Right (passed units)</p>
          <p className="mt-1 text-3xl font-extrabold text-emerald-700">{Math.round(right * 10) / 10}%</p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wide text-rose-700">Wrong (failed units)</p>
          <p className="mt-1 text-3xl font-extrabold text-rose-700">{Math.round(wrong * 10) / 10}%</p>
        </div>
      </div>
      {unitsChecked != null ? (
        <p className="-mt-3 text-center text-[11px] text-slate-500">
          Based on {unitsChecked} measured formatting unit{unitsChecked === 1 ? "" : "s"}
          {unitsFailed != null ? ` (${unitsFailed} failed)` : ""}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Overall Score</p>
          <CircularScore score={overallScore} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Score Breakdown
            </p>
            <p className="text-[10px] font-medium text-slate-400">Per category</p>
          </div>
          <div className="mt-5 space-y-4">
            {scoreBreakdown.map((item) => (
              <ScoreBar
                key={item.metric}
                metric={item.metric}
                score={item.score}
                issueCount={item.issueCount}
              />
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Good (≥80%)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400" /> Needs review (50–79%)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500" /> Critical (&lt;50%)
            </span>
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Scan Summary</p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-rose-50 p-3 text-center">
              <p className="text-2xl font-extrabold text-rose-600">{totalErrors}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-500">Errors</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-3 text-center">
              <p className="text-2xl font-extrabold text-amber-600">{warnings}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-500">
                Warnings
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-2xl font-extrabold text-slate-700">{checksRun}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Checks
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
              {passCount} passed
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              {citationStyle}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              Format only
            </span>
          </div>

          {downloadError && (
            <p className="mt-3 text-xs text-rose-500" role="alert">
              {downloadError}
            </p>
          )}

          <button
            type="button"
            onClick={onDownload}
            disabled={downloadBusy}
            className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl bg-[#172033] py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#243049] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0 4-4m-4 4-4-4M4 20h16" />
            </svg>
            {downloadBusy ? "Generating PDF…" : `Download full report · ${versionLabel}`}
          </button>
        </div>
      </div>

      {hasPreview ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-[#f8fffd] px-5 py-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Document preview</h3>
              <p className="text-[11px] text-slate-500">
                Use reference tracing to jump to a page and highlight a finding.
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
          <div className="bg-[#e8ecf1] p-3">
            <DocumentPagePreview
              file={file}
              documentUrl={cloudinaryUrl}
              preview={documentPreview}
              emptyLabel="Preview unavailable for this version."
            />
          </div>
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
          {issuesFound > 0 && (
            <span className="shrink-0 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">
              {issuesFound} issue type{issuesFound === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <IssuesDetectedPanel
          formatChecks={formatChecks}
          pageCount={pageCount}
          pagination={pagination}
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 pb-6">
        <button
          type="button"
          onClick={onUploadNewVersion}
          className="rounded-lg bg-[#16bfa8] px-6 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#12ae99]"
        >
          Upload New Version
        </button>
      </div>
    </div>
  );
}
