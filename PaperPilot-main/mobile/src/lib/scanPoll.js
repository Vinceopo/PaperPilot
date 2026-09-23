import { getComplianceScan, getScanProgress } from "../api";

const TERMINAL_FAIL = new Set(["failed"]);
const TERMINAL_DONE = new Set(["done"]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function scanNeedsPolling(scan) {
  if (!scan?.id) return false;
  const stage = String(scan.stage || scan.status || "").toLowerCase();
  if (TERMINAL_FAIL.has(stage)) return false;
  if (TERMINAL_DONE.has(stage) && Array.isArray(scan.issues)) return false;
  if (["queued", "parsing", "checking", "scoring", "running"].includes(stage)) return true;
  if (scan.job_id && !Array.isArray(scan.issues)) return true;
  return false;
}

/**
 * Poll gateway progress until done|failed, then fetch full scan payload.
 * @param {string} scanId
 * @param {(p: { percent: number, stage: string, message: string }) => void} [onProgress]
 */
export async function waitForScanResult(scanId, onProgress) {
  const id = String(scanId || "").trim();
  if (!id) throw new Error("Missing scan id from server.");

  while (true) {
    let progress;
    try {
      progress = await getScanProgress(id);
    } catch (err) {
      if (err?.status === 404) {
        return getComplianceScan(id);
      }
      throw err;
    }

    const stage = String(progress?.stage || progress?.status || "").toLowerCase();
    onProgress?.({
      percent: Number(progress?.percent ?? 0),
      stage: stage || "checking",
      message: String(progress?.message || "Analysing document…"),
    });

    if (TERMINAL_FAIL.has(stage) || progress?.status === "failed") {
      throw new Error(progress?.message || "Analysis failed.");
    }

    if (TERMINAL_DONE.has(stage) || progress?.status === "done") {
      return getComplianceScan(id);
    }

    await sleep(1000);
  }
}
