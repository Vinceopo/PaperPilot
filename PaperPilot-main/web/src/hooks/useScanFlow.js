/**
 * useScanFlow — state machine for the upload-to-results scan flow.
 *
 * Steps:
 *   "idle"         – no file selected
 *   "fileSelected" – valid file ready to analyse
 *   "analyzing"    – analysis in flight
 *   "results"      – ScanResult ready to display
 *   "error"        – analysis failed; user can retry
 *
 * Components should be purely presentational and consume this hook.
 * Swapping mock → real API: replace the body of `analyzeDocument` in
 * web/src/lib/mockAnalysis.js only — this hook stays unchanged.
 */

import { useCallback, useState } from "react";
import { analyzeDocument, downloadReport as downloadReportFn, ACCEPTED_EXTENSIONS, MAX_FILE_BYTES } from "../lib/mockAnalysis";

// ─── File validation ──────────────────────────────────────────────────────────

function validateFile(file) {
  if (!file) return "";
  const ext = `.${(file.name.split(".").pop() ?? "").toLowerCase()}`;
  if (!ACCEPTED_EXTENSIONS.includes(ext))
    return `Only ${ACCEPTED_EXTENSIONS.join(" and ")} files are accepted.`;
  if (file.size > MAX_FILE_BYTES)
    return `File must be ${MAX_FILE_BYTES / 1_000_000} MB or smaller.`;
  return "";
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param {{ mechanicsId?: string }} [opts]
 */
export function useScanFlow({ mechanicsId } = {}) {
  // ── Core state machine ────────────────────────────────────────────────────
  const [step, setStep] = useState("idle"); // idle | fileSelected | analyzing | results | error

  // ── File ──────────────────────────────────────────────────────────────────
  const [file, setFileInner] = useState(null);
  const [fileError, setFileError] = useState("");

  // ── Results ───────────────────────────────────────────────────────────────
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // ── Versioning ────────────────────────────────────────────────────────────
  const [documentId, setDocumentId] = useState(null);
  const [versionNumber, setVersionNumber] = useState(1);

  // ── Download ──────────────────────────────────────────────────────────────
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  // ─── Actions ──────────────────────────────────────────────────────────────

  /** Called when the user selects or drops a file. */
  const selectFile = useCallback((f) => {
    const err = f ? validateFile(f) : "";
    setFileInner(f ?? null);
    setFileError(err);
    setError("");
    setStep(f && !err ? "fileSelected" : "idle");
  }, []);

  /**
   * Runs the (mock) analysis.
   * Guards against concurrent calls via the `analyzing` step gate.
   */
  const analyze = useCallback(async () => {
    if (!file || fileError || step === "analyzing") return;
    setStep("analyzing");
    setResult(null); // clear stale data before new analysis
    setError("");
    try {
      const scanResult = await analyzeDocument(file, mechanicsId, documentId);
      if (!documentId) {
        // First scan for this session
        setDocumentId(scanResult.documentId);
        setVersionNumber(1);
      } else {
        // Subsequent version
        setVersionNumber((v) => v + 1);
      }
      setResult(scanResult);
      setStep("results");
    } catch (err) {
      setError(err?.message ?? "Analysis failed. Please try again.");
      setStep("error");
    }
  }, [file, fileError, step, mechanicsId, documentId]);

  /** Returns the user to the upload screen from the error state. */
  const retry = useCallback(() => {
    setError("");
    setStep(file ? "fileSelected" : "idle");
  }, [file]);

  /**
   * Downloads the analysis report.
   * Safe to call multiple times — guarded by `downloadBusy`.
   */
  const downloadReport = useCallback(async () => {
    if (downloadBusy || !result) return;
    setDownloadBusy(true);
    setDownloadError("");
    try {
      // Pass the full result so downloadReport can build a complete PDF
      await downloadReportFn(result);
    } catch (err) {
      setDownloadError(err?.message ?? "Download failed. Please try again.");
    } finally {
      setDownloadBusy(false);
    }
  }, [downloadBusy, result]);

  /**
   * "Upload New Version" — returns to upload, keeps `documentId` so the
   * next successful scan is treated as an incremented version.
   */
  const uploadNewVersion = useCallback(() => {
    setFileInner(null);
    setFileError("");
    setError("");
    setResult(null);
    setStep("idle");
    // documentId intentionally kept
  }, []);

  /**
   * "Back to Dashboard" — fully resets all scan state.
   */
  const backToDashboard = useCallback(() => {
    setFileInner(null);
    setFileError("");
    setResult(null);
    setError("");
    setDocumentId(null);
    setVersionNumber(1);
    setDownloadError("");
    setStep("idle");
  }, []);

  return {
    // ── State ─────────────────────────────────────────────────────────────
    step,
    file,
    fileError,
    result,
    error,
    documentId,
    versionNumber,
    downloadBusy,
    downloadError,
    // ── Actions ───────────────────────────────────────────────────────────
    selectFile,
    analyze,
    retry,
    downloadReport,
    uploadNewVersion,
    backToDashboard,
  };
}
