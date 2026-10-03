/**
 * Turns the analyzer's progress updates (stage, message, percent) into the
 * active step of the "Analysing your document" screen.
 */

export const ANALYSIS_STEPS = [
  { label: "Sending your document" },
  { label: "Reading your document" },
  { label: "Checking formatting rules" },
  { label: "Calculating your results" },
];

const STAGE_STEP = {
  queued: 0,
  uploading: 0,
  starting: 0,
  parsing: 1,
  checking: 2,
  running: 2,
  scoring: 3,
};

/**
 * Lowest on-screen percent for each step. The screen shows 15 + 0.85 × the analyzer's
 * percent (see analyzeDocument), and the analyzer reports reading from 12%,
 * checks from 48%, and scoring at 92%.
 */
const PERCENT_STEP = [
  [93, 3],
  [55, 2],
  [25, 1],
];

function stepFromMessage(message) {
  if (/scor|summar|comput/i.test(message)) return 3;
  if (/checking the file/i.test(message)) return 1;
  if (/complian|rule|check/i.test(message)) return 2;
  if (/pars|read/i.test(message)) return 1;
  return 0;
}

function stepFromPercent(percent) {
  const value = Number(percent) || 0;
  return PERCENT_STEP.find(([min]) => value >= min)?.[1] ?? 0;
}

/**
 * @param {{ stage?: string, message?: string, percent?: number }} progress
 * @returns {{ stepIndex: number, done: boolean }}
 *   stepIndex is the active index into ANALYSIS_STEPS (ANALYSIS_STEPS.length once done).
 */
export function describeAnalysisProgress(progress) {
  const stage = String(progress?.stage || "queued").toLowerCase();
  const message = String(progress?.message || "");

  if (stage === "done") {
    return { stepIndex: ANALYSIS_STEPS.length, done: true };
  }

  const stepIndex = Math.max(
    STAGE_STEP[stage] ?? 0,
    stepFromMessage(message),
    stepFromPercent(progress?.percent)
  );
  return { stepIndex, done: false };
}
