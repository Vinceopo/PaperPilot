/**
 * Document analysis + PDF report helpers (parity with web).
 * analyzeDocument calls the compliance API with optional progress polling.
 * downloadReport builds the same PDF as web and saves it to the device.
 */

import * as FileSystem from "expo-file-system/legacy";
import { runComplianceScan, uploadManuscriptVersion } from "../api";
import { saveFileToDevice } from "./saveFile";
import { isServerId, mapComplianceScanToResult } from "./scanMapper";
import { scanNeedsPolling, waitForScanResult } from "./scanPoll";
import {
  CATEGORY_STATUS_LABEL,
  formatCategoryIssuesDetail,
  formatCount,
  formatPct,
  formatScore,
  hasValue,
  resolveCategoryUnitDisplays,
  resolveUnitCounts,
} from "./scoreFormat";
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
    mechanicsName: opts.mechanicsName || "",
    pageCount: opts.pageCount,
    mechanicsId,
    cloudinaryUrl: scan?.cloudinary_url || opts.cloudinaryUrl || uploadedUrl || "",
    documentPreview: opts.documentPreview,
    versionId,
    documentName: opts.documentName || file?.name || "",
  });
}

/**
 * Generates the same PDF report as web and saves it to the device
 * (Android folder picker / iOS app Documents — no share sheet).
 */
export async function downloadReport(result, opts = {}) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const {
    documentTitle = "Untitled Document",
    campus,
    college,
    scannedAt,
    citationStyle = "APA",
    mechanicsName = "",
    overallScore = null,
    rightPct,
    wrongPct,
    scoreBreakdown = [],
    formatChecks = [],
    unitsChecked,
    unitsPassed,
    unitsFailed,
  } = result || {};

  const versionNumber = Number(opts.versionNumber ?? result?.versionNumber ?? 1) || 1;
  const versionLabel = `v${versionNumber}.0`;
  const scoreValue = hasValue(overallScore) ? Number(overallScore) : null;

  const issueRows = (formatChecks || []).filter((c) => c && c.result !== "PASS");
  const issueTypes = issueRows.length;
  const {
    total: totalUnits,
    compliant: compliantUnits,
    nonCompliant: nonCompliantUnits,
  } = resolveUnitCounts({ unitsChecked, unitsPassed, unitsFailed });

  function scoreBandLabel(score) {
    if (score == null) return "NOT EVALUATED";
    if (score >= 80) return "COMPLIANT";
    if (score >= 50) return "NEEDS REVISION";
    return "CRITICAL ISSUES";
  }

  const scannedDate = scannedAt
    ? new Date(scannedAt.length <= 10 ? `${scannedAt}T12:00:00` : scannedAt).toLocaleString("en-US", {
        dateStyle: "long",
        timeStyle: scannedAt.length > 10 ? "short" : undefined,
        timeZone: APP_TIME_ZONE,
      })
    : new Date().toLocaleString("en-US", { timeZone: APP_TIME_ZONE });

  const generatedDate = new Date().toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: APP_TIME_ZONE,
  });

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const ML = 18;
  const MR = 18;
  const MT = 18;
  const CW = PW - ML - MR;
  let Y = MT;

  const NAVY = [23, 32, 51];
  const TEAL = [22, 191, 168];
  const PASS_C = [21, 115, 71];
  const FAIL_C = [176, 42, 55];
  const REVIEW_C = [181, 114, 0];
  const SLATE = [100, 116, 139];
  const TRACK = [238, 238, 238];
  const BAR_H = 1.6;

  function addPage() {
    doc.addPage();
    Y = MT;
    doc.setFontSize(7).setTextColor(...SLATE);
    doc.text(
      "PaperPilot · Formatting compliance only — grammar, content, and plagiarism are not evaluated.",
      PW / 2,
      PH - 8,
      { align: "center" }
    );
    doc.text(`Page ${doc.internal.getNumberOfPages()}`, PW - MR, PH - 8, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  function checkPageBreak(neededMm) {
    if (Y + neededMm > PH - 18) addPage();
  }

  function fillPill(x, y, w, h, rgb, { roundLeft = true, roundRight = true } = {}) {
    if (!(w > 0) || !(h > 0)) return;
    doc.setFillColor(...rgb);
    const r = h / 2;
    if (w <= h && roundLeft && roundRight) {
      doc.circle(x + w / 2, y + r, Math.min(r, w / 2), "F");
      return;
    }
    let rectX = x;
    let rectW = w;
    if (roundLeft) {
      doc.circle(x + r, y + r, r, "F");
      rectX += r;
      rectW -= r;
    }
    if (roundRight) {
      doc.circle(x + w - r, y + r, r, "F");
      rectW -= r;
    }
    if (rectW > 0) doc.rect(rectX, y, rectW, h, "F");
  }

  function strokeRing(cx, cy, radius, lineWidth, rgb, pct) {
    doc.setDrawColor(...rgb);
    doc.setLineWidth(lineWidth);
    doc.setLineCap("round");
    const safe = Math.max(0, Math.min(100, Number(pct) || 0));
    if (safe <= 0) return;
    const startDeg = -90;
    const sweep = (safe / 100) * 360;
    const steps = Math.max(12, Math.ceil(sweep / 2.5));
    let prevX = cx + radius * Math.cos((startDeg * Math.PI) / 180);
    let prevY = cy + radius * Math.sin((startDeg * Math.PI) / 180);
    for (let i = 1; i <= steps; i += 1) {
      const deg = startDeg + (sweep * i) / steps;
      const x = cx + radius * Math.cos((deg * Math.PI) / 180);
      const y = cy + radius * Math.sin((deg * Math.PI) / 180);
      doc.line(prevX, prevY, x, y);
      prevX = x;
      prevY = y;
    }
  }

  function ringColor(score) {
    if (!hasValue(score)) return [203, 213, 225];
    if (score >= 80) return PASS_C;
    if (score >= 50) return REVIEW_C;
    return FAIL_C;
  }

  const brandX = ML;
  doc.setFontSize(12).setTextColor(...NAVY).setFont("helvetica", "bold");
  doc.text("PAPERPILOT", brandX, 16);
  const brandW = doc.getTextWidth("PAPERPILOT");
  doc.setFontSize(10).setTextColor(74, 85, 104).setFont("helvetica", "bold");
  doc.text("* RESULTS", brandX + brandW + 3, 16);

  Y = 24;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(ML, Y, CW, 22, 2, 2, "FD");
  const metaCols = [
    ["DOCUMENT", documentTitle],
    ["FORMAT MECHANICS", `${mechanicsName || citationStyle || "—"} · ${versionLabel}`],
    ["SCANNED", scannedDate],
    ["GENERATED", generatedDate],
  ];
  const colW = CW / 4;
  metaCols.forEach(([label, val], i) => {
    const cx = ML + 4 + i * colW;
    doc.setFontSize(6).setFont("helvetica", "bold").setTextColor(...SLATE);
    doc.text(label, cx, Y + 7);
    doc.setFontSize(8).setTextColor(...NAVY);
    const lines = doc.splitTextToSize(String(val), colW - 8);
    doc.text(lines.slice(0, 2), cx, Y + 13);
  });
  if (campus || college) {
    Y += 24;
    doc.setFontSize(7).setFont("helvetica", "normal").setTextColor(...SLATE);
    doc.text([college, campus].filter(Boolean).join(" · "), ML, Y);
  } else {
    Y += 28;
  }

  const band = scoreBandLabel(scoreValue);
  const bandColor =
    scoreValue == null ? SLATE : scoreValue >= 80 ? PASS_C : scoreValue >= 50 ? REVIEW_C : FAIL_C;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(ML, Y, CW, 42, 2, 2, "FD");

  doc.setFontSize(6.5).setFont("helvetica", "bold").setTextColor(...SLATE);
  doc.text("OVERALL COMPLIANCE SCORE", ML + 5, Y + 8);
  const scoreStr = formatScore(scoreValue, 0);
  doc.setFontSize(22).setFont("helvetica", "bold").setTextColor(...bandColor);
  doc.text(scoreStr, ML + 5, Y + 22);
  const scoreW = doc.getTextWidth(scoreStr);
  doc.setFontSize(12).setFont("helvetica", "bold").setTextColor(...bandColor);
  doc.text("%", ML + 5 + scoreW + 1, Y + 22);
  doc.setFontSize(7).setFont("helvetica", "bold").setTextColor(...bandColor);
  doc.text(band, ML + 5, Y + 30);

  // Compliant / Non-Compliant labels + thin stacked bar (no percent numbers)
  const barX = ML + 58;
  const barW = CW - 68;
  doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(...PASS_C);
  doc.text("Compliant", barX, Y + 10);
  doc.setTextColor(...FAIL_C);
  doc.text("Non-Compliant", barX + barW, Y + 10, { align: "right" });

  const rightW = Math.max(0, Math.min(barW, ((Number(rightPct) || 0) / 100) * barW));
  const wrongW = Math.max(0, barW - rightW);
  fillPill(barX, Y + 12.5, barW, BAR_H, TRACK);
  if (rightW > 0) {
    fillPill(barX, Y + 12.5, rightW, BAR_H, PASS_C, {
      roundLeft: true,
      roundRight: !(wrongW > 0 && Number(wrongPct) > 0),
    });
  }
  if (wrongW > 0 && Number(wrongPct) > 0) {
    fillPill(barX + rightW, Y + 12.5, wrongW, BAR_H, FAIL_C, {
      roundLeft: !(rightW > 0),
      roundRight: true,
    });
  }

  const stats = [
    { label: "TOTAL UNITS", value: formatCount(totalUnits), color: NAVY },
    { label: "COMPLIANT UNITS", value: formatCount(compliantUnits), color: PASS_C },
    { label: "NON-COMPLIANT", value: formatCount(nonCompliantUnits), color: FAIL_C },
  ];
  const boxW = (barW - 4) / 3;
  stats.forEach((s, i) => {
    const bx = barX + i * (boxW + 2);
    const by = Y + 20;
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(bx, by, boxW, 14, 1.5, 1.5, "FD");
    doc.setFontSize(11).setFont("helvetica", "bold").setTextColor(...s.color);
    doc.text(String(s.value), bx + boxW / 2, by + 7, { align: "center" });
    doc.setFontSize(5).setFont("helvetica", "bold").setTextColor(...SLATE);
    doc.text(s.label, bx + boxW / 2, by + 11.5, { align: "center" });
  });

  Y += 48;

  const categoryCards = resolveCategoryUnitDisplays(scoreBreakdown);
  if (categoryCards.length) {
    const cols = 3;
    const gap = 3.5;
    const cardW = (CW - gap * (cols - 1)) / cols;
    const cardH = 22;
    checkPageBreak(cardH + 16);
    doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(0, 0, 0);
    doc.text("Score Breakdown", ML, Y);
    Y += 6;

    categoryCards.forEach((item, index) => {
      const col = index % cols;
      if (col === 0) checkPageBreak(cardH + gap);
      const x = ML + col * (cardW + gap);
      const y = Y;

      doc.setFillColor(244, 246, 248);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, y, cardW, cardH, 2.5, 2.5, "FD");

      const issueCount = hasValue(item.displayIssueCount)
        ? item.displayIssueCount
        : item.displayNonCompliant;
      const pct = hasValue(item.displayScore)
        ? Number(item.displayScore)
        : hasValue(item.score)
          ? Number(item.score)
          : null;
      const evaluated = hasValue(pct);
      const safe = evaluated ? Math.max(0, Math.min(100, Number(pct))) : 0;
      const color = ringColor(evaluated ? safe : null);
      const cx = x + 11;
      const cy = y + cardH / 2;
      const radius = 6.2;
      const strokeW = 1.7;

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(strokeW);
      doc.circle(cx, cy, radius, "S");
      if (evaluated) strokeRing(cx, cy, radius, strokeW, color, safe);

      doc.setFontSize(6.5).setFont("helvetica", "bold").setTextColor(...(evaluated ? color : SLATE));
      doc.text(evaluated ? formatPct(safe, 0) : "-", cx, cy + 1.1, { align: "center" });

      const textX = x + 20;
      const name = String(item.metric || item.section || "Category").trim() || "Category";
      const detail =
        formatCategoryIssuesDetail(issueCount, item.displayTotal) ||
        (evaluated ? null : CATEGORY_STATUS_LABEL[item.status] || "Not evaluated") ||
        "";
      doc.setFontSize(7.5).setFont("helvetica", "bold").setTextColor(30, 41, 59);
      doc.text(doc.splitTextToSize(name, cardW - 24).slice(0, 1), textX, y + 8);
      doc.setFontSize(5.5).setFont("helvetica", "normal").setTextColor(...SLATE);
      if (detail) {
        doc.text(doc.splitTextToSize(detail, cardW - 24).slice(0, 2), textX, y + 13);
      }

      if (col === cols - 1 || index === categoryCards.length - 1) {
        Y += cardH + gap;
      }
    });
    Y += 2;
  }

  checkPageBreak(20);
  doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(0, 0, 0);
  doc.text("Format Checks", ML, Y);
  doc.setFontSize(7.5).setFont("helvetica", "normal").setTextColor(...SLATE);
  doc.text(`${issueTypes} issue type${issueTypes === 1 ? "" : "s"} found`, ML, Y + 5);
  Y += 10;

  const formatTableRows = issueRows.map((c) => {
    const locs = (c.locations || [])
      .slice(0, 12)
      .map((loc) =>
        loc.page != null ? `p.${loc.page}${loc.line != null ? ` L${loc.line}` : ""}` : loc.section || ""
      )
      .filter(Boolean)
      .join(", ");
    const detail = [
      c.finding || c.description || "",
      c.explanation ? `Why: ${c.explanation}` : "",
      c.recommendation ? `Fix: ${c.recommendation}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return [c.result || "REVIEW", `${c.name || ""}\n${detail}`.trim(), locs || "-"];
  });

  autoTable(doc, {
    startY: Y,
    margin: { left: ML, right: MR },
    head: [["Result", "Finding", "Locations"]],
    body: formatTableRows.length ? formatTableRows : [["-", "No formatting issues detected", "-"]],
    styles: { fontSize: 8, cellPadding: 3.5, lineColor: [226, 232, 240], lineWidth: 0.3, fillColor: 255 },
    headStyles: { fillColor: [248, 250, 252], textColor: SLATE, fontStyle: "bold", fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: 22, halign: "center", fontStyle: "bold" },
      1: { cellWidth: "auto", textColor: [71, 85, 105] },
      2: { cellWidth: 42, textColor: [100, 116, 139], fontSize: 7 },
    },
    didDrawCell(data) {
      if (data.column.index !== 0 || data.section !== "body") return;
      const val = String(data.cell.raw);
      if (val === "-") return;
      const { x, y, width, height } = data.cell;
      const [r, g, b] =
        val === "PASS" ? [220, 252, 231] : val === "FAIL" ? [254, 226, 226] : [254, 243, 199];
      const [tr, tg, tb] = val === "PASS" ? PASS_C : val === "FAIL" ? FAIL_C : REVIEW_C;
      doc.setFillColor(r, g, b);
      doc.roundedRect(x + 1.5, y + (height - 5.5) / 2, width - 3, 5.5, 1.5, 1.5, "F");
      doc.setFontSize(6.5).setFont("helvetica", "bold").setTextColor(tr, tg, tb);
      doc.text(val, x + width / 2, y + height / 2 + 0.8, { align: "center" });
    },
    didAddPage: () => {
      Y = MT;
    },
  });

  Y = (doc.lastAutoTable?.finalY ?? Y) + 8;

  checkPageBreak(18);
  doc.setDrawColor(...TEAL).setLineWidth(0.4);
  doc.line(ML, Y, PW - MR, Y);
  Y += 5;
  doc.setFontSize(7).setFont("helvetica", "normal").setTextColor(...SLATE);
  doc.text(
    "This report covers formatting mechanics only: fonts, margins, spacing, indentation, " +
      "alignment, pagination, and citation format.",
    ML,
    Y,
    { maxWidth: CW }
  );
  Y += 5;
  doc.text(
    "It does not evaluate grammar, writing quality, plagiarism, or the accuracy of cited content.",
    ML,
    Y,
    { maxWidth: CW }
  );

  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7).setTextColor(...SLATE);
    doc.text(
      "PaperPilot · Formatting compliance only — grammar, content, and plagiarism are not evaluated.",
      PW / 2,
      PH - 8,
      { align: "center" }
    );
    doc.text(`Page ${p} of ${totalPages}`, PW - MR, PH - 8, { align: "right" });
  }

  const safeTitle = String(documentTitle).replace(/[^a-z0-9]/gi, "_").slice(0, 40) || "manuscript";
  const filename = `paperpilot-report-${safeTitle}-${versionLabel}.pdf`;
  const dataUri = doc.output("datauristring");
  const base64 = String(dataUri).split(",")[1] || "";
  if (!base64) {
    throw new Error("The PDF report could not be generated.");
  }

  const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!dir) {
    throw new Error("This device cannot save downloaded files.");
  }
  const uri = `${dir}${filename}`;
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const saved = await saveFileToDevice({
    uri,
    filename,
    mimeType: "application/pdf",
  });

  return {
    shared: false,
    downloaded: true,
    method: saved.method,
    filename,
    versionNumber,
    title: documentTitle,
    summary: `PDF report downloaded: ${filename}`,
  };
}
