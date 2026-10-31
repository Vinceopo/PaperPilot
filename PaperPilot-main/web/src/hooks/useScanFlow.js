/**
 * useScanFlow — state machine for the upload-to-results scan flow.
 *
 * Steps:
 *   "idle"         – no file selected
 *   "fileSelected" – valid file ready to analyse
 *   "analyzing"    – analysis in flight (progress polling)
 *   "tracing"      – document + issue reference tracing (legacy; opens full results)
 *   "results"      – full ScanResultsScreen (entered when analysis completes)
 *   "error"        – analysis failed; user can retry
 */

import { useCallback, useRef, useState } from "react";
import { analyzeDocument, downloadReport as downloadReportFn } from "../lib/mockAnalysis";
import { MANUSCRIPT_ACCEPTED_EXTENSIONS, maxUploadBytesForPlan } from "../lib/uploadLimits.js";
import { formatFileSize } from "../lib/formatFileSize.js";
import { planName } from "../lib/plans.js";
import { isServerId } from "../lib/scanMapper";

function validateFile(file, tier) {
  if (!file) return "";
  const maxBytes = maxUploadBytesForPlan(tier);
  const ext = `.${(file.name.split(".").pop() ?? "").toLowerCase()}`;
  if (!MANUSCRIPT_ACCEPTED_EXTENSIONS.includes(ext))
    return "Only PDF files are accepted for manuscripts.";
  if (file.size > maxBytes)
    return `${planName(tier)} plans can upload up to ${formatFileSize(maxBytes)}.`;
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
 *   tier?: string,
 * }} [opts]
 */
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
  const [scanProgress, setScanProgress] = useState(INITIAL_PROGRESS);

  const [documentId, setDocumentId] = useState(null);
  const [versionNumber, setVersionNumber] = useState(1);

  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [persistScan, setPersistScan] = useState(false);
  const resultRef = useRef(null);
  // Bumped whenever the user leaves a scan, so a late result cannot reopen it.
  const runRef = useRef(0);
  const tierRef = useRef(tier);
  tierRef.current = tier;

  const selectFile = useCallback((f) => {
    const plan = tierRef.current;
    const maxBytes = maxUploadBytesForPlan(plan);
    const tooBig = Boolean(f && f.size > maxBytes);
    const err = f && !tooBig ? validateFile(f, plan) : "";
    setFileInner(tooBig ? null : (f ?? null));
    setFileError(
      tooBig ? `${planName(plan)} plans can upload up to ${formatFileSize(maxBytes)}.` : err
    );
    setError("");
    setStep(!tooBig && f && !err ? "fileSelected" : "idle");
  }, []);

  const analyze = useCallback(async () => {
    if ((!file && !getScanTarget) || fileError || step === "analyzing") return;
    const run = ++runRef.current;
    setStep("analyzing");
    resultRef.current = null;
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
          if (run !== runRef.current) return;
          setScanProgress((prev) => ({
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
      if (target.cloudinaryUrl && !scanResult.cloudinaryUrl) {
        scanResult.cloudinaryUrl = target.cloudinaryUrl;
      }

      const serverVersion = Number(target.versionNumber) || 0;
      scanResult.versionNumber = serverVersion > 0 ? serverVersion : nextVersion;

      setDocumentId(scanResult.documentId);
      setVersionNumber(scanResult.versionNumber);
      setPersistScan(true);
      resultRef.current = scanResult;
      setResult(scanResult);
      setScanProgress({ percent: 100, stage: "done", message: "Analysis complete" });
    } catch (err) {
      if (run !== runRef.current) return;
      const raw = err?.message || err?.detail?.message || err?.detail;
      const message =
        typeof raw === "string" && raw.trim()
          ? raw.trim()
          : Array.isArray(raw) && raw[0]?.msg
            ? String(raw[0].msg)
            : "The analysis could not finish. No scan was used. Check your connection, then run the scan again.";
      setError(message);
      setStep("error");
    }
  }, [file, fileError, step, mechanicsId, documentId, resolveManuscript, getActiveManuscript, getScanTarget]);

  /** After analyzing UI finishes, go straight to the full results page (no summary modal). */
  const revealSummary = useCallback(() => {
    if (!resultRef.current) return;
    setStep((current) => (current === "analyzing" ? "results" : current));
  }, []);

  const openReferenceTracing = useCallback(() => {
    if (result) setStep("tracing");
  }, [result]);

  const openFullResults = useCallback(() => {
    if (result) setStep("results");
  }, [result]);

  const backToSummary = useCallback(() => {
    if (result) setStep("results");
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
      setDownloadError(err?.message || "The report could not be downloaded. Try again in a moment.");
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
    setScanProgress(INITIAL_PROGRESS);
    setStep("idle");
  }, []);

  const showSavedResult = useCallback((saved, version) => {
    runRef.current += 1;
    setPersistScan(false);
    setFileInner(null);
    setFileError("");
    const nextResult = saved && typeof saved === "object" ? saved : null;
    resultRef.current = nextResult;
    setResult(nextResult);
    setVersionNumber(Number(version) || 1);
    setError("");
    setDownloadError("");
    setScanProgress(INITIAL_PROGRESS);
    setStep(saved ? "results" : "idle");
  }, []);

  const patchResult = useCallback((patch) => {
    setResult((current) => {
      const next = current ? { ...current, ...patch } : current;
      resultRef.current = next;
      return next;
    });
  }, []);

  const syncVersionNumber = useCallback((version) => {
    const n = Number(version);
    setVersionNumber(Number.isFinite(n) && n > 0 ? n : 1);
  }, []);

  const backToDashboard = useCallback(() => {
    runRef.current += 1;
    setFileInner(null);
    setFileError("");
    resultRef.current = null;
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
    revealSummary,
    openReferenceTracing,
    openFullResults,
    backToSummary,
  };
}
