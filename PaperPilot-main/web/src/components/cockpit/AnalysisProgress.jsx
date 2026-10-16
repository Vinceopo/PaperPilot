import { useEffect, useState } from "react";
import { ANALYSIS_STEPS, describeAnalysisProgress } from "../../lib/analysisProgress.js";

const SLOW_STEP_MS = 20_000;

/**
 * Progress bar plus a status line naming the active analysis step.
 * @param {{ progress: { stage?: string, message?: string }, percent: number }} props
 */
export default function AnalysisProgress({ progress, percent }) {
  const { stepIndex, done } = describeAnalysisProgress(progress);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    setSlow(false);
    if (done) return undefined;
    const timer = window.setTimeout(() => setSlow(true), SLOW_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [stepIndex, done]);

  const safePercent = Math.min(100, Math.max(0, Number(percent) || 0));
  const activeStep = ANALYSIS_STEPS[Math.min(stepIndex, ANALYSIS_STEPS.length - 1)];

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
        <span>{done ? "Complete" : "Analyzing…"}</span>
        <span className="tabular-nums">{Math.round(safePercent)}%</span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-[#16bfa8]" style={{ width: `${safePercent}%` }} />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-600" aria-live="polite">
        <span key={done ? "complete" : activeStep.label} className="inline-block animate-fade-in">
          {done ? "Analysis complete" : `${activeStep.label}…`}
        </span>
      </p>
      {slow ? (
        <p className="mt-1 text-[11px] text-slate-400">
          Long documents can take a minute or two. Please keep this page open.
        </p>
      ) : null}
    </div>
  );
}
