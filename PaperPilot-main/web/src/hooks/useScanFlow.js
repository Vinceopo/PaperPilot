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

function titleFromFile(file) {
  return file?.name?.replace(/\.(pdf|docx)$/i, "") || "";
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   mechanicsId?: string,
 *   resolveManuscript?: (title: string, documentId: string|null) => ({ id: string, versions?: any[] }|null),
 *   getActiveManuscript?: () => ({ id?: string, title?: string }|null),
 * }} [opts]
 */
export function useScanFlow({ mechanicsId, resolveManuscript, getActiveManuscript } = {}) {
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
   * Uses the uploaded manuscript title/id so My Manuscripts stays consistent.
   */
  const analyze = useCallback(async () => {
    if (!file || fileError || step === "analyzing") return;
    setStep("analyzing");
    setResult(null);
    setError("");
    try {
      const active = getActiveManuscript?.() || {};
      const title = String(active.title || titleFromFile(file) || "").trim();
      const preferredId =
        (active.id && !String(active.id).startsWith("local-") ? active.id : null) ||
        documentId ||
        active.id ||
        null;
      const existing = resolveManuscript?.(title, preferredId) || null;
      const reuseId = existing?.id || preferredId || null;
      const maxVer = Math.max(
        0,
        ...((existing?.versions || []).map((v) => Number(v.versionNumber) || 0))
      );
      const nextVersion = existing || preferredId ? maxVer + 1 : 1;

      const scanResult = await analyzeDocument(file, mechanicsId, reuseId, { title });
      // Keep title from the manuscript form, not only the file name.
      if (title) scanResult.documentTitle = title;
      if (reuseId) scanResult.documentId = reuseId;

      setDocumentId(scanResult.documentId);
      setVersionNumber(nextVersion);
      setResult(scanResult);
      setStep("results");
    } catch (err) {
      setError(err?.message ?? "Analysis failed. Please try again.");
      setStep("error");
    }
  }, [file, fileError, step, mechanicsId, documentId, resolveManuscript, getActiveManuscript]);

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
      await downloadReportFn(result, { versionNumber });
    } catch (err) {
      setDownloadError(err?.message ?? "Download failed. Please try again.");
    } finally {
      setDownloadBusy(false);
    }
  }, [downloadBusy, result, versionNumber]);

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
   * "Back to Dashboard" — clears file/result. Manuscript identity is resolved
   * again on the next scan by title / kept documentId.
   */
  const backToDashboard = useCallback(() => {
    setFileInner(null);
    setFileError("");
    setResult(null);
    setError("");
    setDownloadError("");
    setStep("idle");
  }, []);

  return {
    step,
    file,
    fileError,
    result,
    error,
    documentId,
    versionNumber,
    downloadBusy,
    downloadError,
    selectFile,
    analyze,
    retry,
    downloadReport,
    uploadNewVersion,
    backToDashboard,
  };
}
