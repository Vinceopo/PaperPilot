/**
 * useScanFlow — state machine for the upload-to-results scan flow (RN port).
 * File shape: { uri, name, mimeType, size }
 */

import { useCallback, useRef, useState } from "react";
import { analyzeDocument, downloadReport as downloadReportFn } from "../lib/mockAnalysis";
import { MANUSCRIPT_ACCEPTED_EXTENSIONS, maxUploadBytesForPlan } from "../lib/uploadLimits";
import { formatFileSize } from "../lib/formatFileSize";
import { planName } from "../lib/plans";
import { isServerId } from "../lib/scanMapper";

function validateFile(file, tier) {
  if (!file) return "";
  const maxBytes = maxUploadBytesForPlan(tier);
  const ext = `.${(file.name.split(".").pop() ?? "").toLowerCase()}`;
  if (!MANUSCRIPT_ACCEPTED_EXTENSIONS.includes(ext)) {
    return "Only PDF files are accepted for manuscripts.";
  }
  if (file.size > maxBytes) {
    return `${planName(tier)} plans can upload up to ${formatFileSize(maxBytes)}.`;
  }
  return "";
}

function titleFromFile(file) {
  return file?.name?.replace(/\.(pdf|docx)$/i, "") || "";
}

const INITIAL_PROGRESS = { percent: 0, stage: "queued", message: "Starting analysis…" };

/** Page/line plus everything the document viewer needs to paint the issue. */
function traceTarget(entry) {
  const loc = entry.location || {};
  return {
    id: entry.id,
    page: entry.page ?? loc.page ?? null,
    line: entry.line ?? loc.line ?? null,
    bbox: entry.bbox || loc.bbox || null,
    excerpt: entry.excerpt || loc.excerpt || "",
    severity: entry.severity || "minor",
    finding: entry.finding || "",
    section: entry.section || loc.section || "",
  };
}

export function useScanFlow({
  mechanicsId,
  resolveManuscript,
  getActiveManuscript,
  getScanTarget,
  tier = "free",
} = {}) {
  const [step, setStep] = useState("idle");
  const [file, setFileInner] = useState(null);
  const [fileError, setFileError] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [documentId, setDocumentId] = useState(null);
  const [versionNumber, setVersionNumber] = useState(1);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [analyzeProgress, setAnalyzeProgress] = useState(INITIAL_PROGRESS);
  const [traceHighlight, setTraceHighlight] = useState(null);
  const [persistScan, setPersistScan] = useState(false);
  const resultRef = useRef(null);
  // Bumped whenever the user leaves a scan, so a late result cannot reopen it.
  const runRef = useRef(0);
  const tierRef = useRef(tier);
  tierRef.current = tier;

  const selectFile = useCallback((f) => {
    const err = f ? validateFile(f, tierRef.current) : "";
    setFileInner(f ?? null);
    setFileError(err);
    setError("");
    setTraceHighlight(null);
    setStep(f && !err ? "fileSelected" : "idle");
  }, []);

  const analyze = useCallback(async () => {
    if ((!file && !getScanTarget) || fileError || step === "analyzing") return;
    const run = ++runRef.current;
    setStep("analyzing");
    resultRef.current = null;
    setResult(null);
    setPersistScan(false);
    setError("");
    setTraceHighlight(null);
    setAnalyzeProgress({ percent: 0, stage: "queued", message: "Starting analysis…" });
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
      const target = (await getScanTarget?.()) || {};

      const scanResult = await analyzeDocument(file, mechanicsId, reuseId, {
        title,
        manuscriptId: target.manuscriptId,
        versionId: target.versionId,
        citationStyle: target.citationStyle,
        pageCount: target.pageCount,
        cloudinaryUrl: target.cloudinaryUrl,
        documentPreview: target.documentPreview,
        documentName: file?.name || target.sourceFilename,
        onProgress: (payload) => {
          if (run !== runRef.current) return;
          setAnalyzeProgress((prev) => ({
            percent: payload?.percent == null ? prev.percent : Number(payload.percent),
            stage: String(payload?.stage || "queued"),
            message: String(payload?.message || ""),
          }));
        },
      });
      if (run !== runRef.current) return;
      if (title) scanResult.documentTitle = title;
      if (reuseId) scanResult.documentId = reuseId;
      if (isServerId(target.manuscriptId)) scanResult.documentId = target.manuscriptId;

      const serverVersion = Number(target.versionNumber) || 0;
      scanResult.versionNumber = serverVersion > 0 ? serverVersion : nextVersion;

      setDocumentId(scanResult.documentId);
      setVersionNumber(scanResult.versionNumber);
      resultRef.current = scanResult;
      setPersistScan(true);
      setResult(scanResult);
      setAnalyzeProgress({ percent: 100, stage: "done", message: "Analysis complete" });
    } catch (err) {
      if (run !== runRef.current) return;
      setError(
        err?.message || "The analysis could not finish. No scan was used. Check your connection, then run the scan again."
      );
      setStep("error");
    }
  }, [file, fileError, step, mechanicsId, documentId, resolveManuscript, getActiveManuscript, getScanTarget]);

  /** After analyzing UI finishes, go straight to the full results page (no summary modal). */
  const revealSummary = useCallback(() => {
    if (!resultRef.current) return;
    setStep((current) => (current === "analyzing" ? "results" : current));
  }, []);

  const openFullResult = useCallback(() => {
    if (!result) return;
    setStep("results");
  }, [result]);

  const openDocumentTrace = useCallback((highlight) => {
    // null clears any prior pin so the preview does not jump until the user picks an issue.
    setTraceHighlight(highlight ? traceTarget(highlight) : null);
    setStep("documentTrace");
  }, []);

  const dismissSummary = useCallback(() => {
    setStep(file ? "fileSelected" : "idle");
  }, [file]);

  const selectTraceIssue = useCallback((entry) => {
    if (!entry) return;
    setTraceHighlight(traceTarget(entry));
  }, []);

  const retry = useCallback(() => {
    setError("");
    setStep(file ? "fileSelected" : "idle");
  }, [file]);

  const downloadReport = useCallback(async () => {
    if (downloadBusy || !result) return null;
    setDownloadBusy(true);
    setDownloadError("");
    try {
      return await downloadReportFn(result, { versionNumber });
    } catch (err) {
      setDownloadError(err?.message || "The report could not be downloaded. Try again in a moment.");
      return null;
    } finally {
      setDownloadBusy(false);
    }
  }, [downloadBusy, result, versionNumber]);

  const uploadNewVersion = useCallback(() => {
    runRef.current += 1;
    setFileInner(null);
    setFileError("");
    setError("");
    resultRef.current = null;
    setResult(null);
    setPersistScan(false);
    setTraceHighlight(null);
    setAnalyzeProgress(INITIAL_PROGRESS);
    setStep("idle");
  }, []);

  const showSavedResult = useCallback((saved, version) => {
    runRef.current += 1;
    // The previewer prefers a local file, which belongs to the last upload, not this result.
    setFileInner(null);
    setFileError("");
    setPersistScan(false);
    const nextResult = saved && typeof saved === "object" ? saved : null;
    resultRef.current = nextResult;
    setResult(nextResult);
    setVersionNumber(Number(version) || 1);
    setError("");
    setDownloadError("");
    setTraceHighlight(null);
    setAnalyzeProgress(INITIAL_PROGRESS);
    setStep(saved ? "results" : "idle");
  }, []);

  const patchResult = useCallback((patch) => {
    if (!patch) return;
    setResult((prev) => {
      const next = prev ? { ...prev, ...patch } : prev;
      resultRef.current = next;
      return next;
    });
  }, []);

  const backToSummary = useCallback(() => {
    if (result) setStep("results");
  }, [result]);

  const backToDashboard = useCallback(() => {
    runRef.current += 1;
    setFileInner(null);
    setFileError("");
    resultRef.current = null;
    setResult(null);
    setPersistScan(false);
    setError("");
    setDownloadError("");
    setTraceHighlight(null);
    setAnalyzeProgress(INITIAL_PROGRESS);
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
    persistScan,
    downloadBusy,
    downloadError,
    analyzeProgress,
    traceHighlight,
    selectFile,
    analyze,
    retry,
    downloadReport,
    uploadNewVersion,
    backToDashboard,
    showSavedResult,
    patchResult,
    revealSummary,
    backToSummary,
    openFullResult,
    openDocumentTrace,
    dismissSummary,
    selectTraceIssue,
  };
};
