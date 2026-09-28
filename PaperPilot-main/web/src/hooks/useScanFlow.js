/**
 * useScanFlow — state machine for the upload-to-results scan flow.
 *
 * Steps:
 *   "idle"         – no file selected
 *   "fileSelected" – valid file ready to analyse
 *   "analyzing"    – analysis in flight (progress polling)
 *   "summary"      – compact score modal after scan
 *   "tracing"      – document + issue reference tracing
 *   "results"      – full ScanResultsScreen
 *   "error"        – analysis failed; user can retry
 */

import { useCallback, useState } from "react";
import { analyzeDocument, downloadReport as downloadReportFn, ACCEPTED_EXTENSIONS, MAX_FILE_BYTES } from "../lib/mockAnalysis";
import { formatFileSize } from "../lib/formatFileSize.js";
import { isServerId } from "../lib/scanMapper";

function validateFile(file) {
  if (!file) return "";
  const ext = `.${(file.name.split(".").pop() ?? "").toLowerCase()}`;
  if (!ACCEPTED_EXTENSIONS.includes(ext))
    return `Only ${ACCEPTED_EXTENSIONS.join(" and ")} files are accepted.`;
  if (file.size > MAX_FILE_BYTES)
    return `File must be ${formatFileSize(MAX_FILE_BYTES)} or smaller.`;
  return "";
}

function titleFromFile(file) {
  return file?.name?.replace(/\.(pdf|docx)$/i, "") || "";
}

const INITIAL_PROGRESS = { percent: 0, stage: "queued", message: "Starting analysis…" };

/**
 * @param {{
 *   mechanicsId?: string,
 *   resolveManuscript?: (title: string, documentId: string|null) => ({ id: string, versions?: any[] }|null),
 *   getActiveManuscript?: () => ({ id?: string, title?: string }|null),
 *   getScanTarget?: () => Promise<{
 *     manuscriptId?: string,
 *     versionId?: string,
 *     citationStyle?: string,
 *     pageCount?: number,
 *     versionNumber?: number,
 *     cloudinaryUrl?: string,
 *     preview?: object,
 *   }|null>,
 * }} [opts]
 */
export function useScanFlow({ mechanicsId, resolveManuscript, getActiveManuscript, getScanTarget } = {}) {
  const [step, setStep] = useState("idle");

  const [file, setFileInner] = useState(null);
  const [fileError, setFileError] = useState("");

  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [scanProgress, setScanProgress] = useState(INITIAL_PROGRESS);

  const [documentId, setDocumentId] = useState(null);
  const [versionNumber, setVersionNumber] = useState(1);

  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [persistScan, setPersistScan] = useState(false);

  const selectFile = useCallback((f) => {
    const tooBig = Boolean(f && f.size > MAX_FILE_BYTES);
    const err = f && !tooBig ? validateFile(f) : "";
    setFileInner(tooBig ? null : (f ?? null));
    setFileError(tooBig ? `File must be ${formatFileSize(MAX_FILE_BYTES)} or smaller.` : err);
    setError("");
    setStep(!tooBig && f && !err ? "fileSelected" : "idle");
  }, []);

  const analyze = useCallback(async () => {
    if ((!file && !getScanTarget) || fileError || step === "analyzing") return;
    setStep("analyzing");
    setResult(null);
    setError("");
    setScanProgress(INITIAL_PROGRESS);
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
        preview: target.preview,
        documentName: target.sourceFilename,
        onProgress: (payload) => {
          setScanProgress({
            percent: Number(payload?.percent ?? 0),
            stage: String(payload?.stage || "queued"),
            message: String(payload?.message || ""),
          });
        },
      });
      if (title) scanResult.documentTitle = title;
      if (reuseId) scanResult.documentId = reuseId;
      if (isServerId(target.manuscriptId)) scanResult.documentId = target.manuscriptId;
      if (target.cloudinaryUrl && !scanResult.cloudinaryUrl) {
        scanResult.cloudinaryUrl = target.cloudinaryUrl;
      }

      setDocumentId(scanResult.documentId);
      setVersionNumber(nextVersion);
      setPersistScan(true);
      setResult(scanResult);
      setScanProgress({ percent: 100, stage: "done", message: "Analysis complete" });
      setStep("summary");
    } catch (err) {
      setError(err?.message ?? "Analysis failed. Please try again.");
      setStep("error");
    }
  }, [file, fileError, step, mechanicsId, documentId, resolveManuscript, getActiveManuscript, getScanTarget]);

  const openReferenceTracing = useCallback(() => {
    if (result) setStep("tracing");
  }, [result]);

  const openFullResults = useCallback(() => {
    if (result) setStep("results");
  }, [result]);

  const backToSummary = useCallback(() => {
    if (result) setStep("summary");
  }, [result]);

  const retry = useCallback(() => {
    setError("");
    setStep(file ? "fileSelected" : "idle");
  }, [file]);

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

  const uploadNewVersion = useCallback(() => {
    setFileInner(null);
    setFileError("");
    setError("");
    setResult(null);
    setPersistScan(false);
    setScanProgress(INITIAL_PROGRESS);
    setStep("idle");
  }, []);

  const showSavedResult = useCallback((saved, version) => {
    setPersistScan(false);
    setFileInner(null);
    setFileError("");
    setResult(saved && typeof saved === "object" ? saved : null);
    setVersionNumber(Number(version) || 1);
    setError("");
    setDownloadError("");
    setScanProgress(INITIAL_PROGRESS);
    setStep(saved ? "results" : "idle");
  }, []);

  const patchResult = useCallback((patch) => {
    setResult((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const syncVersionNumber = useCallback((version) => {
    const n = Number(version);
    setVersionNumber(Number.isFinite(n) && n > 0 ? n : 1);
  }, []);

  const backToDashboard = useCallback(() => {
    setFileInner(null);
    setFileError("");
    setResult(null);
    setError("");
    setDownloadError("");
    setScanProgress(INITIAL_PROGRESS);
    setPersistScan(false);
    setStep("idle");
  }, []);

  return {
    step,
    file,
    fileError,
    result,
    error,
    scanProgress,
    documentId,
    versionNumber,
    persistScan,
    downloadBusy,
    downloadError,
    selectFile,
    analyze,
    retry,
    downloadReport,
    uploadNewVersion,
    backToDashboard,
    showSavedResult,
    patchResult,
    syncVersionNumber,
    openReferenceTracing,
    openFullResults,
    backToSummary,
  };
}
