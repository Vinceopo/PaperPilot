/**
 * Mock document-analysis functions.
 *
 * Swap the body of `analyzeDocument` for a real API call when the backend is
 * ready — the hook and all UI components stay unchanged.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];
export const MAX_FILE_BYTES = 25_000_000; // 25 MB

// ─── analyzeDocument ─────────────────────────────────────────────────────────

/**
 * @param {File}   file
 * @param {string} [mechanicsId]
 * @param {string} [documentId]   Pass an existing ID to get a "new version" result.
 * @param {{ title?: string }} [opts]
 * @returns {Promise<object>}
 */
export async function analyzeDocument(file, mechanicsId, documentId, opts = {}) {
  // Simulate network + AI processing delay (~2 s)
  await new Promise((resolve) => setTimeout(resolve, 2200));

  // ── Uncomment to test the error state ──────────────────────────────────────
  // if (Math.random() < 0.25)
  //   throw new Error("Simulated error: document could not be parsed.");
  // ──────────────────────────────────────────────────────────────────────────

  const id = documentId ?? `doc-${crypto.randomUUID().slice(0, 8)}`;
  const documentTitle =
    (opts.title && String(opts.title).trim()) ||
    file.name.replace(/\.(pdf|docx)$/i, "");

  return {
    documentId: id,
    documentTitle,
    campus: "Main Campus",
    college: "College of Engineering",
    scannedAt: new Date().toISOString(),
    citationStyle: "APA 7th Edition",
    overallScore: 62,

    scoreBreakdown: [
      { metric: "Font & Size",    score: 45 },
      { metric: "Line Spacing",   score: 70 },
      { metric: "Page Margins",   score: 100 },
      { metric: "Headings",       score: 60 },
      { metric: "Citations",      score: 55 },
      { metric: "Pagination",     score: 90 },
    ],

    formatChecks: [
      {
        id: "title-page",
        name: "Missing institution on title page",
        description: "Title page must include institution, title, author, and date",
        result: "REVIEW",
        severity: "minor",
        finding: "Title page: institution name not found",
        explanation: "The title page is missing the institution name required by the format mechanics.",
        recommendation: "Add the institution name on the title page.",
        locations: [{ page: 1, line: 3, section: "Title page" }],
      },
      {
        id: "font-family-p2",
        name: "Font family differs",
        description: "Body text must use Times New Roman 12pt throughout",
        result: "FAIL",
        severity: "critical",
        finding: "Font family: Arial detected, expected Times New Roman",
        explanation: "Body text on this page uses Arial instead of the mechanics-approved Times New Roman.",
        recommendation: "Apply Times New Roman to the body text on this page.",
        locations: [{ page: 2, line: 8, section: "Introduction" }],
      },
      {
        id: "line-spacing-p4",
        name: "Line spacing too tight",
        description: "All paragraphs must be double-spaced (2.0)",
        result: "REVIEW",
        severity: "minor",
        finding: "Line spacing: 1.15 detected, expected 2.0",
        explanation:
          "Paragraph 1 is single-and-a-quarter spaced instead of the required double spacing.",
        recommendation: "Set paragraph line spacing to 2.0.",
        locations: [{ page: 4, line: 1, section: "Body" }],
      },
      {
        id: "indent-p4",
        name: "Inconsistent paragraph indentation",
        description: "First line of each paragraph must be indented 0.5 inch",
        result: "REVIEW",
        severity: "moderate",
        finding: "First-line indent: 0.75in on 3 paragraphs",
        explanation:
          "Three paragraphs use a 0.75in first-line indent instead of the 0.5in used elsewhere.",
        recommendation: "Set first-line indent to 0.5 inch for these paragraphs.",
        locations: [
          { page: 4, line: 2, section: "Body" },
          { page: 4, line: 3, section: "Body" },
          { page: 4, line: 4, section: "Body" },
        ],
      },
      {
        id: "heading-p3",
        name: "Heading hierarchy mismatch",
        description: "Headings must follow APA Level 1–5 style rules",
        result: "REVIEW",
        severity: "moderate",
        finding: "Heading level: Level-3 styled as Level-2",
        explanation: "A Level-3 heading is formatted with Level-2 styling on this page.",
        recommendation: "Apply the correct Level-3 heading style.",
        locations: [{ page: 3, line: 5, section: "Chapter 2" }],
      },
      {
        id: "citation-format",
        name: "In-text citation year missing",
        description: "Every in-text citation must follow APA 7th edition format",
        result: "FAIL",
        severity: "critical",
        finding: "Citation format: publication year missing",
        explanation: "An in-text citation is missing the publication year required by APA.",
        recommendation: "Add the publication year inside the citation parentheses.",
        locations: [{ page: 5, line: 12, section: "Discussion" }],
      },
      {
        id: "reference-list",
        name: "Reference list hanging indent",
        description: "Hanging indent, alphabetical order, consistent APA style",
        result: "FAIL",
        severity: "critical",
        finding: "Reference list: hanging indent not applied",
        explanation: "Reference entries do not use the hanging-indent formatting required by the mechanics.",
        recommendation: "Apply a 0.5 inch hanging indent to the reference list.",
        locations: [
          { page: 5, line: 20, section: "References" },
          { page: 5, line: 21, section: "References" },
          { page: 5, line: 22, section: "References" },
        ],
      },
      {
        id: "font-size-p3",
        name: "Font size out of spec",
        description: "Body text must use 12 pt throughout",
        result: "FAIL",
        severity: "critical",
        finding: "Font size: 10 pt detected, expected 12 pt",
        explanation: "Two lines in Chapter 2 body text use 10 pt instead of the required 12 pt.",
        recommendation: "Select the paragraph text and change the font size to 12 pt.",
        locations: [
          { page: 3, line: 9, section: "Chapter 2" },
          { page: 3, line: 11, section: "Chapter 2" },
        ],
      },
      {
        id: "margins",
        name: "Page Margins",
        description: "All four margins must be exactly 1 inch",
        result: "PASS",
      },
      {
        id: "page-numbers",
        name: "Page Numbering",
        description: "Page numbers must be centered at the bottom from Chapter 1",
        result: "PASS",
      },
      {
        id: "paper-size",
        name: "Paper Size",
        description: "Document must be formatted for Letter (8.5 × 11 in)",
        result: "PASS",
      },
    ],
    pageCount: 5,
  };
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
    documentId = "unknown",
    documentTitle = "Untitled Document",
    campus,
    college,
    scannedAt,
    citationStyle = "APA",
    overallScore = 0,
    scoreBreakdown = [],
    formatChecks = [],
  } = result;

  const versionNumber = Number(opts.versionNumber ?? result.versionNumber ?? 1) || 1;
  const versionLabel = `v${versionNumber}.0`;

  // ── Derived stats ─────────────────────────────────────────────────────────
  const totalErrors = formatChecks.filter((c) => c.result === "FAIL").length;
  const warnings    = formatChecks.filter((c) => c.result === "REVIEW").length;
  const checksRun   = formatChecks.length;
  const passCount   = checksRun - totalErrors - warnings;

  function scoreBandLabel(score) {
    if (score >= 80) return "COMPLIANT";
    if (score >= 50) return "NEEDS REVISION";
    return "CRITICAL ISSUES";
  }

  const scannedDate = scannedAt
    ? new Date(scannedAt.length <= 10 ? `${scannedAt}T12:00:00` : scannedAt).toLocaleString("en-US", {
        dateStyle: "long",
        timeStyle: scannedAt.length > 10 ? "short" : undefined,
      })
    : new Date().toLocaleString();

  const generatedDate = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });

  // ── Document setup ────────────────────────────────────────────────────────
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const PW = doc.internal.pageSize.getWidth();   // 215.9 mm
  const PH = doc.internal.pageSize.getHeight();  // 279.4 mm
  const ML = 18, MR = 18, MT = 18;
  const CW = PW - ML - MR; // content width
  let Y = MT;

  // ── Color palette ─────────────────────────────────────────────────────────
  const NAVY    = [23,  32,  51];   // #172033
  const TEAL    = [22,  191, 168];  // #16bfa8
  const PASS_C  = [22,  163, 74];   // emerald-600
  const FAIL_C  = [220, 38,  38];   // rose-600
  const REVIEW_C = [217, 119, 6];   // amber-600
  const SLATE   = [100, 116, 139];  // slate-500

  function addPage() {
    doc.addPage();
    Y = MT;
    // Footer on every page
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

  // ══════════════════════════════════════════════════════════════════════════
  // HEADER BAND
  // ══════════════════════════════════════════════════════════════════════════
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PW, 48, "F");

  // Logo wordmark
  doc.setFontSize(9).setTextColor(...TEAL).setFont(undefined, "bold");
  doc.text("PAPER PILOT", ML, 12);

  // Badge
  doc.setFillColor(...TEAL);
  doc.roundedRect(ML, 15, 44, 6, 1.5, 1.5, "F");
  doc.setFontSize(6).setTextColor(255, 255, 255).setFont(undefined, "bold");
  doc.text("SCOPE: FORMATTING ONLY", ML + 22, 19.2, { align: "center" });

  // Document title
  doc.setFontSize(14).setTextColor(255, 255, 255).setFont(undefined, "bold");
  const titleLines = doc.splitTextToSize(documentTitle, CW - 60);
  doc.text(titleLines, ML, 28);

  // Meta grid (top-right) — Version matches the on-screen results header
  const metaX = PW - MR - 58;
  doc.setFontSize(7).setFont(undefined, "normal").setTextColor(180, 190, 205);
  const meta = [
    ["Scanned",        scannedDate],
    ["Version",        versionLabel],
    ["Citation style", citationStyle],
    ["Generated",      generatedDate],
  ];
  if (campus || college) meta.splice(1, 0, ["Campus / College", [college, campus].filter(Boolean).join(", ")]);
  meta.forEach(([label, val], i) => {
    const ry = 14 + i * 7;
    doc.text(label, metaX, ry);
    doc.setTextColor(230, 235, 245).setFont(undefined, "bold");
    const valLines = doc.splitTextToSize(String(val), 58);
    doc.text(valLines, metaX, ry + 3.2);
    doc.setTextColor(180, 190, 205).setFont(undefined, "normal");
  });

  Y = 54;

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION: COMPLIANCE SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  doc.setTextColor(0, 0, 0).setFont(undefined, "bold").setFontSize(10);
  doc.text("Compliance Summary", ML, Y);
  Y += 6;

  // Score + band in a coloured box
  const band = scoreBandLabel(overallScore);
  const bandColor = overallScore >= 80 ? PASS_C : overallScore >= 50 ? REVIEW_C : FAIL_C;
  doc.setFillColor(...bandColor);
  doc.roundedRect(ML, Y, 45, 22, 2, 2, "F");
  doc.setFontSize(22).setTextColor(255, 255, 255).setFont(undefined, "bold");
  doc.text(String(overallScore), ML + 22.5, Y + 12, { align: "center" });
  doc.setFontSize(7).setFont(undefined, "normal");
  doc.text("/ 100", ML + 22.5, Y + 18, { align: "center" });

  doc.setFillColor(...bandColor).setGlobalAlpha ? null : null;
  doc.setFontSize(9).setFont(undefined, "bold").setTextColor(...bandColor);
  doc.text(band, ML + 49, Y + 9);
  doc.setFontSize(8).setFont(undefined, "normal").setTextColor(...SLATE);
  doc.text("Overall compliance score", ML + 49, Y + 15);

  // Stat boxes
  const stats = [
    { label: "Errors",   value: totalErrors, color: FAIL_C   },
    { label: "Warnings", value: warnings,    color: REVIEW_C },
    { label: "Passed",   value: passCount,   color: PASS_C   },
    { label: "Checks",   value: checksRun,   color: NAVY     },
  ];
  const boxW = (CW - 48) / 4 - 2;
  stats.forEach((s, i) => {
    const bx = ML + 49 + i * (boxW + 2);
    const by = Y + 21;
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(bx, by, boxW, 14, 1.5, 1.5, "F");
    doc.setFontSize(14).setFont(undefined, "bold").setTextColor(...s.color);
    doc.text(String(s.value), bx + boxW / 2, by + 8.5, { align: "center" });
    doc.setFontSize(6.5).setFont(undefined, "normal").setTextColor(...SLATE);
    doc.text(s.label, bx + boxW / 2, by + 13, { align: "center" });
  });

  Y += 40;

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION: SCORE BREAKDOWN
  // ══════════════════════════════════════════════════════════════════════════
  if (scoreBreakdown.length) {
    checkPageBreak(scoreBreakdown.length * 9 + 14);
    doc.setFontSize(10).setFont(undefined, "bold").setTextColor(0, 0, 0);
    doc.text("Score Breakdown", ML, Y);
    Y += 5;
    const barTrackW = CW * 0.55;
    const barH = 4;
    scoreBreakdown.forEach((item) => {
      checkPageBreak(10);
      const barColor = item.score >= 80 ? PASS_C : item.score >= 50 ? REVIEW_C : FAIL_C;
      // Metric label
      doc.setFontSize(8).setFont(undefined, "normal").setTextColor(50, 65, 85);
      doc.text(item.metric, ML, Y + barH - 0.5);
      // Track
      const trackX = ML + 42;
      doc.setFillColor(226, 232, 240);
      doc.roundedRect(trackX, Y, barTrackW, barH, barH / 2, barH / 2, "F");
      // Fill
      const fillW = Math.max(2, (item.score / 100) * barTrackW);
      doc.setFillColor(...barColor);
      doc.roundedRect(trackX, Y, fillW, barH, barH / 2, barH / 2, "F");
      // Percentage
      doc.setFontSize(7.5).setFont(undefined, "bold").setTextColor(...barColor);
      doc.text(`${item.score}%`, trackX + barTrackW + 3, Y + barH - 0.5);
      Y += 9;
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
    `${totalErrors + warnings} issue${totalErrors + warnings === 1 ? "" : "s"} found · ${checksRun} checks run`,
    ML, Y + 5
  );
  Y += 10;

  const tableRows = formatChecks.map((c) => [
    c.name,
    c.description + (c.details && c.result !== "PASS" ? `\n${c.details}` : ""),
    c.result,
  ]);

  autoTable(doc, {
    startY: Y,
    margin: { left: ML, right: MR },
    head: [["Check", "Description / Details", "Result"]],
    body: tableRows,
    styles: { fontSize: 8, cellPadding: 3.5, lineColor: [226, 232, 240], lineWidth: 0.3 },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: 44, fontStyle: "bold", textColor: [30, 41, 59] },
      1: { cellWidth: "auto", textColor: [71, 85, 105] },
      2: { cellWidth: 22, halign: "center", fontStyle: "bold" },
    },
    didDrawCell(data) {
      if (data.column.index !== 2 || data.section !== "body") return;
      const val = String(data.cell.raw);
      const { x, y, width, height } = data.cell;
      const [r, g, b] =
        val === "PASS"   ? [220, 252, 231] :
        val === "FAIL"   ? [254, 226, 226] :
                           [254, 243, 199];
      const [tr, tg, tb] =
        val === "PASS"   ? [22,  163, 74]  :
        val === "FAIL"   ? [220, 38,  38]  :
                           [217, 119, 6];
      doc.setFillColor(r, g, b);
      doc.roundedRect(x + 1.5, y + (height - 5.5) / 2, width - 3, 5.5, 1.5, 1.5, "F");
      doc.setFontSize(6.5).setFont(undefined, "bold").setTextColor(tr, tg, tb);
      doc.text(val, x + width / 2, y + height / 2 + 0.8, { align: "center" });
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
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
