/**
 * Document analysis helpers.
 * analyzeDocument calls the compliance API with optional progress polling.
 */

import { runComplianceScan, uploadManuscriptVersion } from "../api";
import { isServerId, mapComplianceScanToResult } from "./scanMapper";
import { scanNeedsPolling, waitForScanResult } from "./scanPoll";

function titleFromFile(file) {
  return file?.name?.replace(/\.(pdf|docx)$/i, "") || "Manuscript";
}

export async function analyzeDocument(file, mechanicsId, documentId, opts = {}) {
  if (!mechanicsId) {
    throw new Error("Select a format mechanics profile before analysing.");
  }

  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
  const report = (percent, stage, message) => onProgress?.({ percent, stage, message });

  let manuscriptId = isServerId(opts.manuscriptId) ? opts.manuscriptId : "";
  let versionId = isServerId(opts.versionId) ? opts.versionId : "";
  const title = String(opts.title || titleFromFile(file) || "").trim();
  let uploadedUrl = "";

  if (!manuscriptId || !versionId) {
    if (!file) {
      throw new Error("Upload a manuscript before analysing.");
    }
    report(2, "uploading", "Uploading your document…");
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
    uploadedUrl = version.cloudinary_url || "";
  }

  if (!isServerId(manuscriptId) || !isServerId(versionId)) {
    throw new Error("The manuscript is not saved on the server yet. Upload it again, then analyse.");
  }

  report(10, "starting", "Sending your document to the analyser…");
  const started = await runComplianceScan({ manuscriptId, versionId, mechanicsId });

  let scan = started;
  if (String(started?.status || started?.stage || "").toLowerCase() === "failed") {
    throw new Error(started?.error || "The analysis could not finish. No scan was used. Run the scan again.");
  }
  if (scanNeedsPolling(started)) {
    scan = await waitForScanResult(started.id, (payload) => {
      if (payload?.percent == null) {
        report(null, payload?.stage, payload?.message);
        return;
      }
      const serverPct = Math.min(100, Math.max(0, Number(payload.percent) || 0));
      const done = payload?.stage === "done";
      report(done ? 100 : 15 + serverPct * 0.85, payload?.stage, payload?.message);
    });
  } else {
    report(100, "done", "Analysis complete");
  }

  return mapComplianceScanToResult(scan, {
    documentId: manuscriptId,
    documentTitle: title,
    citationStyle: opts.citationStyle || "APA",
    pageCount: opts.pageCount,
    mechanicsId,
    cloudinaryUrl: scan?.cloudinary_url || opts.cloudinaryUrl || uploadedUrl || "",
    documentPreview: opts.documentPreview,
    versionId,
    documentName: opts.documentName || file?.name || "",
  });
}

export async function downloadReport(result, opts = {}) {
  const versionNumber = Number(opts.versionNumber ?? result?.versionNumber ?? 1) || 1;
  const title = result?.documentTitle || "Untitled";
  const fmt = (value, suffix = "") =>
    value != null && Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 10) / 10}${suffix}` : "—";
  const total = result?.unitsChecked;
  const passed = result?.unitsPassed;
  const failed =
    total != null && passed != null && Number.isFinite(Number(total)) && Number.isFinite(Number(passed))
      ? Math.max(0, Math.round(Number(total)) - Math.min(Math.round(Number(passed)), Math.round(Number(total))))
      : result?.unitsFailed;
  const summary = [
    "PaperPilot compliance report",
    `Title: ${title}`,
    `Version: v${versionNumber}.0`,
    `Score: ${fmt(result?.overallScore)}`,
    `Compliant: ${fmt(result?.rightPct, "%")} · Non-Compliant: ${fmt(result?.wrongPct, "%")}`,
    `Total Units: ${fmt(total)} · Compliant Units: ${fmt(passed)} · Non-Compliant Units: ${fmt(failed)}`,
    "",
    "Full PDF download is available on the web app.",
  ].join("\n");
  return { summary, versionNumber, title };
}
