import { getComplianceScan, getScanProgress } from "../api.js";

const TERMINAL_STAGES = new Set(["done", "failed"]);
const MAX_POLL_MS = 20 * 60 * 1000;
const MAX_NETWORK_FAILURES = 8;

export const SCAN_TIMEOUT_MESSAGE =
  "The analysis is taking longer than expected. If it finishes, the result will appear in My Manuscripts. If it fails, no scan is used — run it again later.";
export const SCAN_CONNECTION_MESSAGE =
  "Lost connection while waiting for the analysis. Check your internet connection, then open My Manuscripts — the result appears there once it finishes. If the analysis failed, no scan was used.";

function isTransient(err) {
  const status = Number(err?.status);
  return !status || status === 408 || status === 429 || status >= 500;
}

/**
 * Poll scan progress until done or failed. If the gateway has no progress route yet, returns null.
 * Network drops are retried with backoff; polling stops after MAX_POLL_MS.
 * @param {string} scanId
 * @param {(payload: { percent: number, stage: string, message?: string }) => void} [onProgress]
 * @param {{ intervalMs?: number }} [opts]
 */
export async function pollScanUntilDone(scanId, onProgress, { intervalMs = 1000 } = {}) {
  if (!scanId) return null;
  const startedAt = Date.now();
  let failures = 0;

  while (true) {
    if (Date.now() - startedAt > MAX_POLL_MS) {
      throw new Error(SCAN_TIMEOUT_MESSAGE);
    }

    let payload;
    try {
      payload = await getScanProgress(scanId);
      failures = 0;
    } catch (err) {
      if (err?.status === 404) return null;
      if (!isTransient(err)) throw err;
      failures += 1;
      if (failures >= MAX_NETWORK_FAILURES) throw new Error(SCAN_CONNECTION_MESSAGE);
      onProgress?.({ percent: null, stage: "reconnecting", message: "Connection lost — retrying…" });
      await new Promise((resolve) => {
        window.setTimeout(resolve, Math.min(10000, 1000 * 2 ** (failures - 1)));
      });
      continue;
    }

    const rawPercent = payload?.percent;
    const percent = rawPercent == null ? null : Number(rawPercent);
    const stage = String(payload?.stage || "queued");
    const message = String(payload?.message || "");
    onProgress?.({ percent, stage, message });

    if (TERMINAL_STAGES.has(stage)) {
      if (stage === "failed") {
        throw new Error(message || "The analysis could not finish. No scan was used. Run the scan again.");
      }
      return payload;
    }

    // Background tabs throttle timers; check again as soon as the tab is shown.
    await new Promise((resolve) => {
      const done = () => {
        window.clearTimeout(timer);
        document.removeEventListener("visibilitychange", onVisible);
        resolve();
      };
      const onVisible = () => {
        if (document.visibilityState === "visible") done();
      };
      const timer = window.setTimeout(done, intervalMs);
      document.addEventListener("visibilitychange", onVisible);
    });
  }
}

/**
 * Start scan, poll progress, return the fullest scan payload available.
 * Never returns a scan that is still running or has failed.
 */
export async function fetchScanWithProgress(startScan, onProgress) {
  const started = await startScan();
  const scanId = started?.id || started?.scan_id;
  if (!scanId) return started;

  await pollScanUntilDone(scanId, onProgress);

  let fresh = null;
  for (let attempt = 0; attempt < 3 && !fresh; attempt += 1) {
    try {
      fresh = await getComplianceScan(scanId);
    } catch (err) {
      if (!isTransient(err) || attempt === 2) {
        if (String(started?.status || "").toLowerCase() === "done") return started;
        throw new Error(SCAN_CONNECTION_MESSAGE);
      }
      await new Promise((resolve) => {
        window.setTimeout(resolve, 1500 * (attempt + 1));
      });
    }
  }

  const status = String(fresh?.status || "").toLowerCase();
  if (status === "failed") {
    throw new Error(fresh?.error || "The analysis could not finish. No scan was used. Run the scan again.");
  }
  if (status && status !== "done") {
    throw new Error(SCAN_TIMEOUT_MESSAGE);
  }
  return fresh && typeof fresh === "object" ? fresh : started;
}
