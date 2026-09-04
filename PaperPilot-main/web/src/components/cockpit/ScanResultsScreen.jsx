/**
 * ScanResultsScreen
 *
 * Full results screen: document header band → 3-column card row
 * (Overall Score ring / Score Breakdown bars / Scan Summary) →
 * Format Checks table → footer actions.
 *
 * All values are derived from the `result` prop — nothing is hardcoded.
 * Ring and bar animations run once on mount.
 */

import { useEffect, useRef, useState } from "react";

// ─── Score helpers ────────────────────────────────────────────────────────────

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

const RESULT_PILL = {
  PASS: "bg-emerald-100 text-emerald-700 border-emerald-200",
  FAIL: "bg-rose-100 text-rose-700 border-rose-200",
  REVIEW: "bg-amber-100 text-amber-700 border-amber-200",
};

// ─── Animated circular ring ───────────────────────────────────────────────────

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
      const eased = 1 - (1 - t) ** 3; // ease-out cubic
      setProgress(eased * score);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [score]); // run once per score value

  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {/* SVG ring */}
      <div className="relative">
        <svg width="148" height="148" viewBox="0 0 148 148" className="-rotate-90">
          {/* Track */}
          <circle cx="74" cy="74" r={RADIUS} fill="none" stroke="#e2e8f0" strokeWidth="14" />
          {/* Progress arc */}
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
            style={{ transition: "stroke-dashoffset 0s" }}
          />
        </svg>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-extrabold text-slate-800">{Math.round(progress)}</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">/100</span>
        </div>
      </div>

      {/* Band badge */}
      <span
        className={`rounded-full border px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider
          ${band.textColor} ${band.badgeBg} ${band.badgeBorder}`}
      >
        {band.label}
      </span>
      <p className="text-center text-xs text-slate-400">Overall compliance score</p>
    </div>
  );
}

// ─── Animated score bar ───────────────────────────────────────────────────────

function ScoreBar({ metric, score }) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    // Defer one frame so the initial 0-width is painted before transitioning
    const raf = requestAnimationFrame(() => {
      setTimeout(() => setWidth(score), 60);
    });
    return () => cancelAnimationFrame(raf);
  }, [score]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-600">{metric}</span>
        <span
          className={`font-bold ${
            score >= 80
              ? "text-emerald-600"
              : score >= 50
              ? "text-amber-600"
              : "text-rose-500"
          }`}
        >
          {score}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-2 rounded-full transition-all duration-700 ease-out ${barColorClass(score)}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ScanResultsScreen({
  result,
  versionNumber = 1,
  downloadBusy = false,
  downloadError = "",
  onDownload,
  onUploadNewVersion,
  onBackToDashboard,
}) {
  // Edge-case guard: never render a broken empty screen
  if (!result) return null;

  const {
    documentTitle = "Untitled Document",
    campus,
    college,
    scannedAt,
    citationStyle = "APA",
    overallScore = 0,
    scoreBreakdown = [],
    formatChecks = [],
  } = result;

  // ── Derived stats ─────────────────────────────────────────────────────────
  const totalErrors = formatChecks.filter((c) => c.result === "FAIL").length;
  const warnings    = formatChecks.filter((c) => c.result === "REVIEW").length;
  const checksRun   = formatChecks.length;
  const issuesFound = totalErrors + warnings;
  const passCount   = checksRun - totalErrors - warnings;

  const scannedDate = scannedAt
    ? new Date(scannedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  const versionLabel = `v${versionNumber}.0`;

  return (
    <div className="space-y-6">
      {/* ── Dark document header band ─────────────────────────────────────── */}
      <div className="rounded-xl bg-[#172033] p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-5">
          {/* Left: title + breadcrumb */}
          <div className="min-w-0">
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

          {/* Right: meta grid */}
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

      {/* ── 3-column card row ─────────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* Card 1 — Overall Score */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Overall Score
          </p>
          <CircularScore score={overallScore} />
        </div>

        {/* Card 2 — Score Breakdown */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Score Breakdown
          </p>
          <div className="mt-5 space-y-4">
            {scoreBreakdown.map((item) => (
              <ScoreBar key={item.metric} metric={item.metric} score={item.score} />
            ))}
          </div>
        </div>

        {/* Card 3 — Scan Summary */}
        <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Scan Summary
          </p>

          {/* Stat grid */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-rose-50 p-3 text-center">
              <p className="text-2xl font-extrabold text-rose-600">{totalErrors}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-500">
                Errors
              </p>
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

          {/* Tags */}
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

          {/* Download error */}
          {downloadError && (
            <p className="mt-3 text-xs text-rose-500" role="alert">
              {downloadError}
            </p>
          )}

          {/* Download button */}
          <button
            type="button"
            onClick={onDownload}
            disabled={downloadBusy}
            className="mt-auto pt-5 w-full rounded-lg border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloadBusy ? "Generating PDF…" : `⬇  Download Analysis (PDF) · ${versionLabel}`}
          </button>
        </div>
      </div>

      {/* ── Format Checks table ───────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Table header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Format Checks</h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Formatting mechanics only — grammar and content are outside this tool&apos;s scope.
            </p>
          </div>
          {issuesFound > 0 && (
            <span className="shrink-0 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">
              {issuesFound} issue{issuesFound === 1 ? "" : "s"} found
            </span>
          )}
        </div>

        {/* Rows */}
        <div className="divide-y divide-slate-100">
          {formatChecks.map((check) => (
            <div
              key={check.id}
              className="flex items-start justify-between gap-4 px-6 py-4"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-700">{check.name}</p>
                <p className="mt-0.5 text-xs text-slate-400">{check.description}</p>
                {check.details && check.result !== "PASS" && (
                  <p className="mt-1.5 text-xs font-medium text-slate-500">{check.details}</p>
                )}
              </div>
              <span
                className={`mt-0.5 shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${
                  RESULT_PILL[check.result] ?? RESULT_PILL.REVIEW
                }`}
              >
                {check.result}
              </span>
            </div>
          ))}

          {formatChecks.length === 0 && (
            <p className="px-6 py-8 text-center text-sm text-slate-400">
              No formatting checks were returned.
            </p>
          )}
        </div>
      </div>

      {/* ── Footer actions ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-end gap-3 pb-6">
        <button
          type="button"
          onClick={onBackToDashboard}
          className="rounded-lg border border-slate-200 bg-white px-6 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          ← Back to Dashboard
        </button>
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
