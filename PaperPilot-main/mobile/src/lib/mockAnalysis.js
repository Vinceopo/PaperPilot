/**
 * Document analysis helpers.
 * analyzeDocument calls the compliance API with optional progress polling.
 */

import { runComplianceScan, uploadManuscriptVersion } from "../api";
import { isServerId, mapComplianceScanToResult } from "./scanMapper";
import { scanNeedsPolling, waitForScanResult } from "./scanPoll";

export const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];
export const MAX_FILE_BYTES = 25_000_000;

function titleFromFile(file) {
  return file?.name?.replace(/\.(pdf|docx)$/i, "") || "Manuscript";
}

export async function analyzeDocument(file, mechanicsId, documentId, opts = {}) {
  if (!mechanicsId) {
    throw new Error("Select a format mechanics profile before analysing.");
  }

  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;

  let manuscriptId = isServerId(opts.manuscriptId) ? opts.manuscriptId : "";
  let versionId = isServerId(opts.versionId) ? opts.versionId : "";
  const title = String(opts.title || titleFromFile(file) || "").trim();

  if (!manuscriptId || !versionId) {
    if (!file) {
      throw new Error("Upload a manuscript before analysing.");
    }
    onProgress?.({ percent: 5, stage: "parsing", message: "Uploading manuscript…" });
    const created = await uploadManuscriptVersion({
      file,
      mechanicsId,
      title,
      manuscriptId: isServerId(documentId) ? documentId : manuscriptId || undefined,
    });
    const version = created.version || created;
    manuscriptId =
      version.manuscript_id ||
      created.manuscript_id ||
      created.manuscript?.id ||
      created.created_manuscript?.id ||
      manuscriptId;
    versionId = version.id || created.version_id || versionId;
  }

  if (!isServerId(manuscriptId) || !isServerId(versionId)) {
    throw new Error("The manuscript is not saved on the server yet. Upload it again, then analyse.");
  }

  onProgress?.({ percent: 12, stage: "queued", message: "Starting compliance scan…" });
  const started = await runComplianceScan({ manuscriptId, versionId, mechanicsId });

  let scan = started;
  if (scanNeedsPolling(started)) {
    scan = await waitForScanResult(started.id, onProgress);
  } else {
    onProgress?.({ percent: 100, stage: "done", message: "Analysis complete." });
  }

  return mapComplianceScanToResult(scan, {
    documentId: manuscriptId,
    documentTitle: title,
    citationStyle: opts.citationStyle || "APA",
    pageCount: opts.pageCount,
    mechanicsId,
    cloudinaryUrl: opts.cloudinaryUrl,
    documentPreview: opts.documentPreview,
  });
}

export async function downloadReport(result, opts = {}) {
  const versionNumber = Number(opts.versionNumber ?? result?.versionNumber ?? 1) || 1;
  const title = result?.documentTitle || "Untitled";
  const score = Number(result?.overallScore ?? result?.rightPct ?? 0);
  const checks = Array.isArray(result?.formatChecks) ? result.formatChecks : [];
  const errors = checks.filter((c) => c.result === "FAIL").length;
  const warnings = checks.filter((c) => c.result === "REVIEW").length;
  const summary = [
    "PaperPilot compliance report",
    `Title: ${title}`,
    `Version: v${versionNumber}.0`,
    `Score: ${score} / 100`,
    `Right: ${result?.rightPct ?? score}% · Wrong: ${result?.wrongPct ?? ""}%`,
    `Errors: ${errors} · Warnings: ${warnings} · Checks: ${checks.length}`,
    "",
    "Full PDF download is available on the web app.",
  ].join("\n");
  return { summary, versionNumber, title };
}
