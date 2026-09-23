import { getComplianceScan, getScanProgress } from "../api.js";

const TERMINAL_STAGES = new Set(["done", "failed"]);

/**
 * Poll scan progress until done or failed. If the gateway has no progress route yet, returns null.
 * @param {string} scanId
 * @param {(payload: { percent: number, stage: string, message?: string }) => void} [onProgress]
 * @param {{ intervalMs?: number }} [opts]
 */
export async function pollScanUntilDone(scanId, onProgress, { intervalMs = 1000 } = {}) {
  if (!scanId) return null;

  while (true) {
    let payload;
    try {
      payload = await getScanProgress(scanId);
    } catch {
      return null;
    }

    const percent = Number(payload?.percent ?? 0);
    const stage = String(payload?.stage || "queued");
    const message = String(payload?.message || "");
    onProgress?.({ percent, stage, message });

    if (TERMINAL_STAGES.has(stage)) {
      if (stage === "failed") {
        throw new Error(message || "Analysis failed.");
      }
      return payload;
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, intervalMs);
    });
  }
}

/**
 * Start scan, poll progress, return the fullest scan payload available.
 */
export async function fetchScanWithProgress(startScan, onProgress) {
  const started = await startScan();
  const scanId = started?.id || started?.scan_id;
  const hasRichPayload =
    started?.right_pct != null ||
    (Array.isArray(started?.issues) && started.issues.length > 0 && started?.overall_score != null);

  if (scanId) {
    await pollScanUntilDone(scanId, onProgress);
    try {
      const fresh = await getComplianceScan(scanId);
      if (fresh && typeof fresh === "object") return fresh;
    } catch {
      // Fall back to POST body when GET is unavailable.
    }
  }

  return hasRichPayload || !scanId ? started : started;
}
