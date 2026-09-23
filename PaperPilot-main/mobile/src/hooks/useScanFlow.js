/**
 * useScanFlow — state machine for the upload-to-results scan flow (RN port).
 * File shape: { uri, name, mimeType, size }
 */

import { useCallback, useState } from "react";
import {
  analyzeDocument,
  downloadReport as downloadReportFn,
  ACCEPTED_EXTENSIONS,
  MAX_FILE_BYTES,
} from "../lib/mockAnalysis";
import { isServerId } from "../lib/scanMapper";

function validateFile(file) {
  if (!file) return "";
  const ext = `.${(file.name.split(".").pop() ?? "").toLowerCase()}`;
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    return `Only ${ACCEPTED_EXTENSIONS.join(" and ")} files are accepted.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `File must be ${MAX_FILE_BYTES / 1_000_000} MB or smaller.`;
  }
  return "";
}

function titleFromFile(file) {
  return file?.name?.replace(/\.(pdf|docx)$/i, "") || "";
}

const INITIAL_PROGRESS = { percent: 0, stage: "queued", message: "" };

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
    setResult(null);
    setError("");
    setTraceHighlight(null);
    setAnalyzeProgress({ percent: 0, stage: "queued", message: "Preparing analysis…" });
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
        onProgress: setAnalyzeProgress,
      });
      if (title) scanResult.documentTitle = title;
      if (reuseId) scanResult.documentId = reuseId;
      if (isServerId(target.manuscriptId)) scanResult.documentId = target.manuscriptId;

      setDocumentId(scanResult.documentId);
      setVersionNumber(Number(target.versionNumber) || nextVersion);
      setResult(scanResult);
      setAnalyzeProgress({ percent: 100, stage: "done", message: "Analysis complete." });
      setStep("summary");
    } catch (err) {
      setError(err?.message ?? "Analysis failed. Please try again.");
      setStep("error");
    }
  }, [file, fileError, step, mechanicsId, documentId, resolveManuscript, getActiveManuscript, getScanTarget]);

  const openFullResult = useCallback(() => {
    if (!result) return;
    setStep("results");
  }, [result]);

  const openDocumentTrace = useCallback((highlight) => {
    if (highlight) setTraceHighlight(highlight);
    setStep("documentTrace");
  }, []);

  const dismissSummary = useCallback(() => {
    setStep(file ? "fileSelected" : "idle");
  }, [file]);

  const selectTraceIssue = useCallback((entry) => {
    if (!entry) return;
    setTraceHighlight({ page: entry.page, line: entry.line, id: entry.id });
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
    setResult(null);
    setTraceHighlight(null);
    setAnalyzeProgress(INITIAL_PROGRESS);
    setStep("idle");
  }, []);

  const backToDashboard = useCallback(() => {
    setFileInner(null);
    setFileError("");
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
    openFullResult,
    openDocumentTrace,
    dismissSummary,
    selectTraceIssue,
  };
};
