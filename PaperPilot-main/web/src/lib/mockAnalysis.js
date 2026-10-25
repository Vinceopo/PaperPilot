/**
 * Document analysis + PDF report helpers.
 * analyzeDocument calls the live compliance API against saved format mechanics.
 */

import { runComplianceScan, uploadManuscriptVersion } from "../api.js";
import { isServerId, mapComplianceScanToResult } from "./scanMapper.js";
import { fetchScanWithProgress } from "./scanPoll.js";
import {
  CATEGORY_STATUS_LABEL,
  formatCount,
  formatPct,
  formatScore,
  hasValue,
  resolveUnitCounts,
} from "./scoreFormat.js";
import { APP_TIME_ZONE } from "./timeZone.js";

function titleFromFile(file) {
  return file?.name?.replace(/\.(pdf|docx)$/i, "") || "Manuscript";
}

export async function analyzeDocument(file, mechanicsId, documentId, opts = {}) {
  if (!mechanicsId) {
    throw new Error("Select a format mechanics profile before analysing.");
  }

  let manuscriptId = isServerId(opts.manuscriptId) ? opts.manuscriptId : "";
  let versionId = isServerId(opts.versionId) ? opts.versionId : "";
  const title = String(opts.title || titleFromFile(file) || "").trim();
  let uploadedUrl = "";
  const report = (percent, stage, message) => opts.onProgress?.({ percent, stage, message });

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

  report(10, "starting", "Sending your document to the analyzer…");
  const scan = await fetchScanWithProgress(
    () => runComplianceScan({ manuscriptId, versionId, mechanicsId }),
    (payload) => {
      if (payload?.percent == null) {
        report(null, payload?.stage, payload?.message);
        return;
      }
      const serverPct = Math.min(100, Math.max(0, Number(payload.percent) || 0));
      const done = payload?.stage === "done";
      report(done ? 100 : 15 + serverPct * 0.85, payload?.stage, payload?.message);
    }
  );

  return mapComplianceScanToResult(scan, {
    documentId: manuscriptId,
    documentTitle: title,
    citationStyle: opts.citationStyle || "APA",
    pageCount: opts.pageCount,
    mechanicsId,
    cloudinaryUrl: scan?.cloudinary_url || opts.cloudinaryUrl || uploadedUrl || "",
    preview: opts.preview || scan?.preview,
    versionId,
    documentName: opts.documentName || file?.name || "",
  });
}

// ─── downloadReport ──────────────────────────────────────────────────────────

/**
 * Generates a PDF report from the full ScanResult and triggers a download.
 * Same generator is used from Scan Results and My Manuscripts so versioned
 * downloads stay consistent.
 *
 * @param {object} result  Full ScanResult object from analyzeDocument / real API
 * @param {{ versionNumber?: number|string }} [opts]
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
    overallScore = null,
    rightPct,
    wrongPct,
    scoreBreakdown = [],
    formatChecks = [],
    unitsChecked,
    unitsPassed,
    unitsFailed,
  } = result;

  const versionNumber = Number(opts.versionNumber ?? result.versionNumber ?? 1) || 1;
  const versionLabel = `v${versionNumber}.0`;
  const scoreValue = hasValue(overallScore) ? Number(overallScore) : null;

  // ── Derived stats ─────────────────────────────────────────────────────────
  const issueRows = formatChecks.filter((c) => c && c.result !== "PASS");
  const issueTypes = issueRows.length;
  const {
    total: totalUnits,
    compliant: compliantUnits,
    nonCompliant: nonCompliantUnits,
  } = resolveUnitCounts({ unitsChecked, unitsPassed, unitsFailed });

  async function loadBrandLogo() {
    try {
      const base = (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/";
      const res = await fetch(`${base}icon-192.png`);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  const logoDataUrl = await loadBrandLogo();

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

  // ── Document setup ────────────────────────────────────────────────────────
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const PW = doc.internal.pageSize.getWidth();   // 215.9 mm
  const PH = doc.internal.pageSize.getHeight();  // 279.4 mm
  const ML = 18, MR = 18, MT = 18;
  const CW = PW - ML - MR; // content width
  let Y = MT;

  // ── Color palette (matches scan-results design) ───────────────────────────
  const NAVY     = [23,  32,  51];   // #172033
  const TEAL     = [22,  191, 168];  // #16bfa8
  const PASS_C   = [21,  115, 71];   // #157347
  const FAIL_C   = [176, 42,  55];   // #B02A37
  const REVIEW_C = [181, 114, 0];    // #B57200
  const SLATE    = [100, 116, 139];  // slate-500
  const TRACK    = [238, 238, 238];  // #EEEEEE
  const BAR_H    = 1.6;             // thin bars like the UI reference

  function addPage() {
    doc.addPage();
    Y = MT;
    doc.setFontSize(7).setTextColor(...SLATE);
    doc.text(
      "PaperPilot · Formatting compliance only — grammar, content, and plagiarism are not evaluated.",
      PW / 2, PH - 8,
      { align: "center" }
    );
    doc.text(`Page ${doc.internal.getNumberOfPages()}`, PW - MR, PH - 8, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  function checkPageBreak(neededMm) {
    if (Y + neededMm > PH - 18) addPage();
  }

  /**
   * Pill / capsule bar segment. Oval caps are drawn with circles so thin bars
   * stay rounded in PDF viewers (roundedRect often looks square at this size).
   */
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

  // ══════════════════════════════════════════════════════════════════════════
  // HEADER — logo + PAPERPILOT * RESULTS
  // ══════════════════════════════════════════════════════════════════════════
  const logoSize = 9;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", ML, 10, logoSize, logoSize);
    } catch {
      /* text lockup still renders */
    }
  }
  const brandX = logoDataUrl ? ML + logoSize + 3 : ML;
  doc.setFontSize(12).setTextColor(...NAVY).setFont(undefined, "bold");
  doc.text("PAPERPILOT", brandX, 16);
  const brandW = doc.getTextWidth("PAPERPILOT");
  doc.setFontSize(10).setTextColor(74, 85, 104).setFont(undefined, "bold");
  doc.text("* RESULTS", brandX + brandW + 3, 16);

  Y = 24;

  // Meta card
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(ML, Y, CW, 22, 2, 2, "FD");
  const metaCols = [
    ["DOCUMENT", documentTitle],
    ["CITATION STYLE", `${citationStyle} · ${versionLabel}`],
    ["SCANNED", scannedDate],
    ["GENERATED", generatedDate],
  ];
  const colW = CW / 4;
  metaCols.forEach(([label, val], i) => {
    const cx = ML + 4 + i * colW;
    doc.setFontSize(6).setFont(undefined, "bold").setTextColor(...SLATE);
    doc.text(label, cx, Y + 7);
    doc.setFontSize(8).setTextColor(...NAVY);
    const lines = doc.splitTextToSize(String(val), colW - 8);
    doc.text(lines.slice(0, 2), cx, Y + 13);
  });
  if (campus || college) {
    Y += 24;
    doc.setFontSize(7).setFont(undefined, "normal").setTextColor(...SLATE);
    doc.text([college, campus].filter(Boolean).join(" · "), ML, Y);
  } else {
    Y += 28;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION: OVERALL COMPLIANCE SCORE
  // ══════════════════════════════════════════════════════════════════════════
  const band = scoreBandLabel(scoreValue);
  const bandColor =
    scoreValue == null ? SLATE : scoreValue >= 80 ? PASS_C : scoreValue >= 50 ? REVIEW_C : FAIL_C;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(ML, Y, CW, 42, 2, 2, "FD");

  doc.setFontSize(6.5).setFont(undefined, "bold").setTextColor(...SLATE);
  doc.text("OVERALL COMPLIANCE SCORE", ML + 5, Y + 8);
  const scoreStr = formatScore(scoreValue, 0);
  doc.setFontSize(22).setFont(undefined, "bold").setTextColor(...bandColor);
  doc.text(scoreStr, ML + 5, Y + 22);
  const scoreW = doc.getTextWidth(scoreStr);
  doc.setFontSize(12).setFont(undefined, "bold").setTextColor(...bandColor);
  doc.text("%", ML + 5 + scoreW + 1, Y + 22);
  doc.setFontSize(7).setFont(undefined, "bold").setTextColor(...bandColor);
  doc.text(band, ML + 5, Y + 30);

  // Compliant / Non-Compliant labels + thin stacked bar
  const barX = ML + 58;
  const barW = CW - 68;
  doc.setFontSize(8).setFont(undefined, "bold").setTextColor(...PASS_C);
  doc.text(`Compliant ${formatPct(rightPct)}`, barX, Y + 10);
  doc.setTextColor(...FAIL_C);
  doc.text(`Non-Compliant ${formatPct(wrongPct)}`, barX + barW, Y + 10, { align: "right" });

  const rightW = Math.max(0, Math.min(barW, ((Number(rightPct) || 0) / 100) * barW));
  const wrongW = Math.max(0, barW - rightW);
  // One continuous oval: round only the outer ends of the stacked segments.
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
    doc.setFontSize(11).setFont(undefined, "bold").setTextColor(...s.color);
    doc.text(String(s.value), bx + boxW / 2, by + 7, { align: "center" });
    doc.setFontSize(5).setFont(undefined, "bold").setTextColor(...SLATE);
    doc.text(s.label, bx + boxW / 2, by + 11.5, { align: "center" });
  });

  Y += 48;

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION: SCORE BREAKDOWN
  // ══════════════════════════════════════════════════════════════════════════
  if (scoreBreakdown.length) {
    checkPageBreak(scoreBreakdown.length * 9 + 14);
    doc.setFontSize(10).setFont(undefined, "bold").setTextColor(0, 0, 0);
    doc.text("Score breakdown", ML, Y);
    Y += 5;
    const barTrackW = CW * 0.55;
    const barH = BAR_H;
    scoreBreakdown.forEach((item) => {
      checkPageBreak(8);
      const evaluated = hasValue(item.score);
      const score = evaluated ? Number(item.score) : 0;
      const barColor = !evaluated ? SLATE : score >= 80 ? PASS_C : score >= 60 ? REVIEW_C : FAIL_C;
      doc.setFontSize(8).setFont(undefined, "normal").setTextColor(50, 65, 85);
      doc.text(item.metric || item.section || "", ML, Y + barH + 0.5);
      const trackX = ML + 42;
      fillPill(trackX, Y, barTrackW, barH, TRACK);
      if (evaluated) {
        // Keep a visible capsule even at low %; never narrower than a full oval.
        const fillW = Math.max(barH, (score / 100) * barTrackW);
        fillPill(trackX, Y, Math.min(fillW, barTrackW), barH, barColor);
      }
      doc.setFontSize(7.5).setFont(undefined, "bold").setTextColor(...barColor);
      doc.text(
        evaluated ? formatPct(score) : CATEGORY_STATUS_LABEL[item.status] || "Not evaluated",
        trackX + barTrackW + 3,
        Y + barH + 0.5
      );
      Y += 7.5;
    });
    Y += 4;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION: FORMAT CHECKS TABLE
  // ══════════════════════════════════════════════════════════════════════════
  checkPageBreak(20);
  doc.setFontSize(10).setFont(undefined, "bold").setTextColor(0, 0, 0);
  doc.text("Format Checks", ML, Y);
  doc.setFontSize(7.5).setFont(undefined, "normal").setTextColor(...SLATE);
  doc.text(
    `${issueTypes} issue type${issueTypes === 1 ? "" : "s"} found`,
    ML, Y + 5
  );
  Y += 10;

  const formatTableRows = issueRows
    .map((c) => {
      const locs = (c.locations || [])
        .slice(0, 12)
        .map((loc) =>
          loc.page != null
            ? `p.${loc.page}${loc.line != null ? ` L${loc.line}` : ""}`
            : loc.section || ""
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
      return [c.result || "REVIEW", `${c.name || ""}\n${detail}`.trim(), locs || "—"];
    });

  autoTable(doc, {
    startY: Y,
    margin: { left: ML, right: MR },
    head: [["Result", "Finding", "Locations"]],
    body: formatTableRows.length ? formatTableRows : [["—", "No formatting issues detected", "—"]],
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
      if (val === "—") return;
      const { x, y, width, height } = data.cell;
      const [r, g, b] =
        val === "PASS"   ? [220, 252, 231] :
        val === "FAIL"   ? [254, 226, 226] :
                           [254, 243, 199];
      const [tr, tg, tb] =
        val === "PASS"   ? PASS_C :
        val === "FAIL"   ? FAIL_C :
                           REVIEW_C;
      doc.setFillColor(r, g, b);
      doc.roundedRect(x + 1.5, y + (height - 5.5) / 2, width - 3, 5.5, 1.5, 1.5, "F");
      doc.setFontSize(6.5).setFont(undefined, "bold").setTextColor(tr, tg, tb);
      doc.text(val, x + width / 2, y + height / 2 + 0.8, { align: "center" });
    },
    didAddPage: () => { Y = MT; },
  });

  Y = (doc.lastAutoTable?.finalY ?? Y) + 8;

  // ══════════════════════════════════════════════════════════════════════════
  // FOOTER NOTE (last page)
  // ══════════════════════════════════════════════════════════════════════════
  checkPageBreak(18);
  doc.setDrawColor(...TEAL).setLineWidth(0.4);
  doc.line(ML, Y, PW - MR, Y);
  Y += 5;
  doc.setFontSize(7).setFont(undefined, "normal").setTextColor(...SLATE);
  doc.text(
    "This report covers formatting mechanics only: fonts, margins, spacing, indentation, " +
    "alignment, pagination, and citation format.",
    ML, Y, { maxWidth: CW }
  );
  Y += 5;
  doc.text(
    "It does not evaluate grammar, writing quality, plagiarism, or the accuracy of cited content.",
    ML, Y, { maxWidth: CW }
  );

  // Page numbers on every page including first
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7).setTextColor(...SLATE);
    doc.text(
      "PaperPilot · Formatting compliance only — grammar, content, and plagiarism are not evaluated.",
      PW / 2, PH - 8, { align: "center" }
    );
    doc.text(`Page ${p} of ${totalPages}`, PW - MR, PH - 8, { align: "right" });
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const safeTitle = documentTitle.replace(/[^a-z0-9]/gi, "_").slice(0, 40);
  doc.save(`paperpilot-report-${safeTitle}-${versionLabel}.pdf`);
}
