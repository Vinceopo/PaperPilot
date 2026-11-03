import { getComplianceScan, getScanProgress } from "../api";

const TERMINAL_FAIL = new Set(["failed"]);
const TERMINAL_DONE = new Set(["done"]);
const MAX_POLL_MS = 20 * 60 * 1000;
const MAX_NETWORK_FAILURES = 8;

export const SCAN_TIMEOUT_MESSAGE =
  "The analysis is taking longer than expected. If it finishes, the result will appear in My Manuscripts. If it fails, no scan is used — run it again later.";
export const SCAN_CONNECTION_MESSAGE =
  "Lost connection while waiting for the analysis. Check your internet connection, then open My Manuscripts — the result appears there once it finishes. If the analysis failed, no scan was used.";
const FAILED_MESSAGE = "The analysis could not finish. No scan was used. Run the scan again.";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransient(err) {
  const status = Number(err?.status);
  return !status || status === 408 || status === 429 || status >= 500;
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

/** Full scan once it is done; never a scan that is still running or failed. */
async function fetchFinishedScan(id) {
  let scan = null;
  for (let attempt = 0; attempt < 3 && !scan; attempt += 1) {
    try {
      scan = await getComplianceScan(id);
    } catch (err) {
      if (!isTransient(err) || attempt === 2) throw new Error(SCAN_CONNECTION_MESSAGE);
      await sleep(1500 * (attempt + 1));
    }
  }
  const status = String(scan?.status || "").toLowerCase();
  if (status === "failed") throw new Error(scan?.error || FAILED_MESSAGE);
  if (status && status !== "done") throw new Error(SCAN_TIMEOUT_MESSAGE);
  return scan;
}

/**
 * Poll gateway progress until done|failed, then fetch full scan payload.
 * Network drops are retried with backoff; polling stops after MAX_POLL_MS.
 * @param {string} scanId
 * @param {(p: { percent: number | null, stage: string, message: string }) => void} [onProgress]
 */
export async function waitForScanResult(scanId, onProgress) {
  const id = String(scanId || "").trim();
  if (!id) throw new Error("The server did not start the analysis. No scan was used. Try again.");
  const startedAt = Date.now();
  let failures = 0;

  while (true) {
    if (Date.now() - startedAt > MAX_POLL_MS) throw new Error(SCAN_TIMEOUT_MESSAGE);

    let progress;
    try {
      progress = await getScanProgress(id);
      failures = 0;
    } catch (err) {
      if (err?.status === 404) {
        return fetchFinishedScan(id);
      }
      if (!isTransient(err)) throw err;
      failures += 1;
      if (failures >= MAX_NETWORK_FAILURES) throw new Error(SCAN_CONNECTION_MESSAGE);
      onProgress?.({ percent: null, stage: "reconnecting", message: "Connection lost — retrying…" });
      await sleep(Math.min(10000, 1000 * 2 ** (failures - 1)));
      continue;
    }

    const stage = String(progress?.stage || progress?.status || "").toLowerCase();
    const rawPercent = progress?.percent;
    onProgress?.({
      percent: rawPercent == null ? null : Number(rawPercent),
      stage: stage || "checking",
      message: String(progress?.message || "Analysing document…"),
    });

    if (TERMINAL_FAIL.has(stage) || progress?.status === "failed") {
      throw new Error(progress?.message || FAILED_MESSAGE);
    }

    if (TERMINAL_DONE.has(stage) || progress?.status === "done") {
      return fetchFinishedScan(id);
    }

    await sleep(1000);
  }
}
