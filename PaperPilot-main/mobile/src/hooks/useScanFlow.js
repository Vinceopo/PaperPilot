/**
 * useScanFlow — state machine for the upload-to-results scan flow (RN port).
 * File shape: { uri, name, mimeType, size }
 */

import { useCallback, useRef, useState } from "react";
import { analyzeDocument, downloadReport as downloadReportFn } from "../lib/mockAnalysis";
import { ACCEPTED_EXTENSIONS, MAX_FILE_SIZE_BYTES } from "../lib/uploadLimits";
import { formatFileSize } from "../lib/formatFileSize";
import { isServerId } from "../lib/scanMapper";

function validateFile(file) {
  if (!file) return "";
  const ext = `.${(file.name.split(".").pop() ?? "").toLowerCase()}`;
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    return `Only ${ACCEPTED_EXTENSIONS.join(" and ")} files are accepted.`;
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File must be ${formatFileSize(MAX_FILE_SIZE_BYTES)} or smaller.`;
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

export function useScanFlow({ mechanicsId, resolveManuscript, getActiveManuscript, getScanTarget } = {}) {
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
  const resultRef = useRef(null);

  const selectFile = useCallback((f) => {
    const err = f ? validateFile(f) : "";
    setFileInner(f ?? null);
    setFileError(err);
    setError("");
    setTraceHighlight(null);
    setStep(f && !err ? "fileSelected" : "idle");
  }, []);

  const analyze = useCallback(async () => {
    if ((!file && !getScanTarget) || fileError || step === "analyzing") return;
    setStep("analyzing");
    resultRef.current = null;
    setResult(null);
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
          setAnalyzeProgress({
            percent: Number(payload?.percent ?? 0),
            stage: String(payload?.stage || "queued"),
            message: String(payload?.message || ""),
          });
        },
      });
      if (title) scanResult.documentTitle = title;
      if (reuseId) scanResult.documentId = reuseId;
      if (isServerId(target.manuscriptId)) scanResult.documentId = target.manuscriptId;

      setDocumentId(scanResult.documentId);
      setVersionNumber(Number(target.versionNumber) || nextVersion);
      resultRef.current = scanResult;
      setResult(scanResult);
      setAnalyzeProgress({ percent: 100, stage: "done", message: "Analysis complete" });
    } catch (err) {
      setError(err?.message ?? "Analysis failed. Please try again.");
      setStep("error");
    }
  }, [file, fileError, step, mechanicsId, documentId, resolveManuscript, getActiveManuscript, getScanTarget]);

  const revealSummary = useCallback(() => {
    if (!resultRef.current) return;
    setStep((current) => (current === "analyzing" ? "summary" : current));
  }, []);

  const openFullResult = useCallback(() => {
    if (!result) return;
    setStep("results");
  }, [result]);

  const openDocumentTrace = useCallback((highlight) => {
    if (highlight) setTraceHighlight(traceTarget(highlight));
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
      setDownloadError(err?.message ?? "Download failed. Please try again.");
      return null;
    } finally {
      setDownloadBusy(false);
    }
  }, [downloadBusy, result, versionNumber]);

  const uploadNewVersion = useCallback(() => {
    setFileInner(null);
    setFileError("");
    setError("");
    resultRef.current = null;
    setResult(null);
    setTraceHighlight(null);
    setAnalyzeProgress(INITIAL_PROGRESS);
    setStep("idle");
  }, []);

  const showSavedResult = useCallback((saved, version) => {
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
    if (result) setStep("summary");
  }, [result]);

  const backToDashboard = useCallback(() => {
    setFileInner(null);
    setFileError("");
    resultRef.current = null;
    setResult(null);
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
