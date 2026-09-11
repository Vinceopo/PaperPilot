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

export function useScanFlow({ mechanicsId, resolveManuscript, getActiveManuscript } = {}) {
  const [step, setStep] = useState("idle");
  const [file, setFileInner] = useState(null);
  const [fileError, setFileError] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [documentId, setDocumentId] = useState(null);
  const [versionNumber, setVersionNumber] = useState(1);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  const selectFile = useCallback((f) => {
    const err = f ? validateFile(f) : "";
    setFileInner(f ?? null);
    setFileError(err);
    setError("");
    setStep(f && !err ? "fileSelected" : "idle");
  }, []);

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
    setStep("idle");
  }, []);

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
