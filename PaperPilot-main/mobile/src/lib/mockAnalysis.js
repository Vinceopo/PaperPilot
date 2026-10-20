/**
 * Document analysis helpers.
 * analyzeDocument calls the compliance API with optional progress polling.
 * downloadReport builds a PDF (logo + PAPERPILOT branding) matching the web export.
 */

import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { runComplianceScan, uploadManuscriptVersion } from "../api";
import { isServerId, mapComplianceScanToResult } from "./scanMapper";
import { scanNeedsPolling, waitForScanResult } from "./scanPoll";
import { CATEGORY_STATUS_LABEL, formatPct, formatScore, hasValue } from "./scoreFormat";
import { APP_TIME_ZONE } from "./timeZone";

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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatLocations(locations = []) {
  return (locations || [])
    .slice(0, 12)
    .map((loc) =>
      loc?.page != null
        ? `p.${loc.page}${loc.line != null ? ` L${loc.line}` : ""}`
        : loc?.section || ""
    )
    .filter(Boolean)
    .join(", ");
}

function formatReportDate(value) {
  if (!value) return "—";
  const raw = String(value);
  const d = new Date(raw.length <= 10 ? `${raw}T12:00:00` : raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: raw.length > 10 ? "short" : undefined,
    timeZone: APP_TIME_ZONE,
  });
}

function scoreBandLabel(score) {
  if (score == null) return "NOT EVALUATED";
  if (score >= 80) return "COMPLIANT";
  if (score >= 50) return "NEEDS REVISION";
  return "CRITICAL ISSUES";
}

function scoreColor(score) {
  if (score == null) return "#64748b";
  if (score >= 80) return "#157347";
  if (score >= 50) return "#B57200";
  return "#B02A37";
}

function barColor(score) {
  if (score >= 80) return "#157347";
  if (score >= 60) return "#B57200";
  return "#B02A37";
}

async function loadLogoDataUri() {
  try {
    const asset = Asset.fromModule(require("../../assets/icon.png"));
    await asset.downloadAsync();
    const uri = asset.localUri || asset.uri;
    if (!uri) return "";
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:image/png;base64,${b64}`;
  } catch {
    return "";
  }
}

function buildReportHtml(result, opts = {}) {
  const versionNumber = Number(opts.versionNumber ?? result?.versionNumber ?? 1) || 1;
  const versionLabel = `v${versionNumber}.0`;
  const title = result?.documentTitle || "Untitled";
  const citationStyle = result?.citationStyle || "APA";
  const scoreValue = hasValue(result?.overallScore) ? Number(result.overallScore) : null;
  const band = scoreBandLabel(scoreValue);
  const bandC = scoreColor(scoreValue);
  const checks = Array.isArray(result?.formatChecks) ? result.formatChecks : [];
  const issueRows = checks.filter((c) => c && c.result !== "PASS");
  const errors = issueRows.filter((c) => c.result === "FAIL").length;
  const warnings = issueRows.filter((c) => c.result === "REVIEW").length;
  const rightPct = result?.rightPct;
  const wrongPct = result?.wrongPct;
  const rightShare = Math.max(0, Math.min(100, Number(rightPct) || 0));
  const wrongShare = Math.max(0, Math.min(100, Number(wrongPct) || 0));
  const logo = opts.logoDataUri || "";
  const breakdown = Array.isArray(result?.scoreBreakdown) ? result.scoreBreakdown : [];

  const breakdownRows = breakdown
    .map((item) => {
      const evaluated = hasValue(item.score);
      const score = evaluated ? Number(item.score) : 0;
      const color = evaluated ? barColor(score) : "#94a3b8";
      const label = escapeHtml(item.metric || item.section || "");
      const pct = evaluated
        ? escapeHtml(formatPct(score))
        : escapeHtml(CATEGORY_STATUS_LABEL[item.status] || "Not evaluated");
      return `<tr>
        <td class="metric">${label}</td>
        <td class="track"><div class="bar"><div class="fill" style="width:${evaluated ? score : 0}%;background:${color}"></div></div></td>
        <td class="pct" style="color:${color}">${pct}</td>
      </tr>`;
    })
    .join("");

  const issueHtml = issueRows.length
    ? issueRows
        .map((c) => {
          const detail = [
            c.finding || c.description || "",
            c.explanation ? `Why: ${c.explanation}` : "",
            c.recommendation ? `Fix: ${c.recommendation}` : "",
          ]
            .filter(Boolean)
            .join("\n");
          const findingCell = escapeHtml(`${c.name || ""}\n${detail}`.trim());
          const locs = escapeHtml(formatLocations(c.locations) || "—");
          const result = escapeHtml(c.result || "REVIEW");
          const badge =
            c.result === "FAIL" ? "fail" : c.result === "PASS" ? "pass" : "review";
          return `<tr>
            <td><span class="badge ${badge}">${result}</span></td>
            <td class="finding-cell">${findingCell.replace(/\n/g, "<br/>")}</td>
            <td class="locs">${locs}</td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="3" style="text-align:center;color:#64748b;padding:16px">No formatting issues detected</td></tr>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Helvetica, Arial, sans-serif; color: #172033; margin: 28px; font-size: 12px; }
    .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
    .brand img { width: 36px; height: 36px; border-radius: 8px; }
    .brand-name { font-size: 18px; font-weight: 700; letter-spacing: 0.06em; }
    .brand-sub { font-size: 13px; font-weight: 600; color: #4a5568; letter-spacing: 0.08em; margin-left: 6px; }
    .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; }
    .meta .k { font-size: 9px; font-weight: 700; letter-spacing: 0.12em; color: #94a3b8; text-transform: uppercase; }
    .meta .v { font-size: 12px; font-weight: 700; margin-top: 4px; }
    .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
    .kicker { font-size: 9px; font-weight: 700; letter-spacing: 0.14em; color: #94a3b8; text-transform: uppercase; }
    .score { font-size: 42px; font-weight: 800; color: ${bandC}; line-height: 1; margin-top: 6px; }
    .out { font-size: 14px; color: #94a3b8; font-weight: 600; }
    .pill { display: inline-block; margin-top: 8px; padding: 4px 10px; border-radius: 999px; background: #eaf7ef; color: ${bandC}; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; }
    .share { display: flex; justify-content: space-between; font-weight: 700; margin-top: 10px; }
    .right { color: #157347; } .incorrect { color: #B02A37; }
    .share-bar { height: 4px; background: #eeeeee; border-radius: 999px; overflow: hidden; margin-top: 6px; display: flex; }
    .share-bar .r { background: #157347; height: 100%; }
    .share-bar .w { background: #B02A37; height: 100%; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
    .stat { border: 1px solid #e2e8f0; border-radius: 10px; text-align: center; padding: 10px 6px; }
    .stat .n { font-size: 20px; font-weight: 800; }
    .stat .l { font-size: 9px; font-weight: 700; letter-spacing: 0.08em; color: #64748b; text-transform: uppercase; margin-top: 2px; }
    h2 { font-size: 16px; margin: 0 0 4px; }
    .sub { color: #64748b; font-size: 12px; margin-bottom: 10px; }
    table.breakdown { width: 100%; border-collapse: collapse; }
    table.breakdown td { padding: 6px 0; vertical-align: middle; }
    td.metric { width: 22%; font-weight: 600; color: #334155; }
    td.track { width: 62%; }
    td.pct { width: 16%; text-align: right; font-weight: 700; }
    .bar { height: 4px; background: #eeeeee; border-radius: 999px; overflow: hidden; }
    .fill { height: 100%; border-radius: 999px; }
    table.issues { width: 100%; border-collapse: collapse; margin-top: 8px; }
    table.issues th { text-align: left; font-size: 10px; letter-spacing: 0.12em; color: #94a3b8; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding: 8px 6px; background: #f8fafc; }
    table.issues td { border-bottom: 1px solid #f1f5f9; padding: 10px 6px; vertical-align: top; font-size: 11px; color: #475569; }
    .badge { display: inline-block; padding: 3px 7px; border-radius: 6px; font-size: 9px; font-weight: 700; letter-spacing: 0.06em; }
    .badge.fail { background: #fdf0f1; color: #B02A37; }
    .badge.review { background: #fff8e8; color: #B57200; }
    .badge.pass { background: #eaf7ef; color: #157347; }
    .finding-cell { color: #475569; line-height: 1.45; white-space: normal; }
    .locs { width: 22%; color: #64748b; font-size: 10px; }
    .foot { margin-top: 16px; font-size: 10px; color: #94a3b8; border-top: 2px solid #16bfa8; padding-top: 10px; }
    .page-foot { margin-top: 24px; font-size: 9px; color: #94a3b8; text-align: center; line-height: 1.4; }
  </style>
</head>
<body>
  <div class="brand">
    ${logo ? `<img src="${logo}" alt="PaperPilot" />` : ""}
    <div><span class="brand-name">PAPERPILOT</span><span class="brand-sub">* RESULTS</span></div>
  </div>

  <div class="meta">
    <div><div class="k">Document</div><div class="v">${escapeHtml(title)}</div></div>
    <div><div class="k">Citation style</div><div class="v">${escapeHtml(citationStyle)} · ${versionLabel}</div></div>
    <div><div class="k">Scanned</div><div class="v">${escapeHtml(formatReportDate(result?.scannedAt))}</div></div>
    <div><div class="k">Generated</div><div class="v">${escapeHtml(formatReportDate(new Date().toISOString()))}</div></div>
  </div>

  <div class="card">
    <div class="kicker">Overall compliance score</div>
    <div><span class="score">${scoreValue == null ? "—" : escapeHtml(formatScore(scoreValue, 0))}</span> <span class="out">/ 100</span></div>
    <div class="pill">${band}</div>
    <div class="share"><span class="right">Right ${escapeHtml(formatPct(rightPct))}</span><span class="incorrect">Incorrect ${escapeHtml(formatPct(wrongPct))}</span></div>
    <div class="share-bar"><div class="r" style="width:${rightShare}%"></div><div class="w" style="width:${wrongShare}%"></div></div>
    <div class="stats">
      <div class="stat"><div class="n" style="color:#B02A37">${errors}</div><div class="l">Errors</div></div>
      <div class="stat"><div class="n" style="color:#B57200">${warnings}</div><div class="l">Warnings</div></div>
      <div class="stat"><div class="n">${issueRows.length}</div><div class="l">Issue types</div></div>
    </div>
  </div>

  ${
    breakdown.length
      ? `<div class="card"><h2>Score breakdown</h2><p class="sub">Share of measured text that matched the format in each category</p><table class="breakdown">${breakdownRows}</table></div>`
      : ""
  }

  <div class="card">
    <h2>Format Checks</h2>
    <p class="sub">${issueRows.length} issue type${issueRows.length === 1 ? "" : "s"} found</p>
    <table class="issues">
      <thead><tr><th>Result</th><th>Finding</th><th>Locations</th></tr></thead>
      <tbody>${issueHtml}</tbody>
    </table>
  </div>

  <div class="foot">
    This report covers formatting mechanics only: fonts, margins, spacing, indentation, alignment, pagination, and citation format.
    It does not evaluate grammar, writing quality, plagiarism, or the accuracy of cited content.
  </div>
  <p class="page-foot">PaperPilot · Formatting compliance only — grammar, content, and plagiarism are not evaluated.</p>
</body>
</html>`;
}

/**
 * Builds and shares a PDF report. Why/Fix appear in this export (not on-screen).
 */
export async function downloadReport(result, opts = {}) {
  const versionNumber = Number(opts.versionNumber ?? result?.versionNumber ?? 1) || 1;
  const title = result?.documentTitle || "Untitled";
  const logoDataUri = await loadLogoDataUri();
  const html = buildReportHtml(result, { ...opts, versionNumber, logoDataUri });
  const file = await Print.printToFileAsync({ html, base64: false });
  const uri = file?.uri;
  if (!uri) {
    throw new Error("Could not generate the PDF report.");
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: `PaperPilot · ${title}`,
      UTI: "com.adobe.pdf",
    });
  }

  return { uri, versionNumber, title, summary: `PDF report ready for ${title}` };
}
