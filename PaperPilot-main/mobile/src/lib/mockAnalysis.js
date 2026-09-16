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

  const id = documentId ?? `doc-${Date.now().toString(36)}`;
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
 * Mobile: PDF generation (jsPDF) is web-only. Surface a shareable text summary instead.
 */
export async function downloadReport(result, opts = {}) {
  const versionNumber = Number(opts.versionNumber ?? result?.versionNumber ?? 1) || 1;
  const title = result?.documentTitle || "Untitled";
  const score = Number(result?.overallScore ?? 0);
  const checks = Array.isArray(result?.formatChecks) ? result.formatChecks : [];
  const errors = checks.filter((c) => c.result === "FAIL").length;
  const warnings = checks.filter((c) => c.result === "REVIEW").length;
  const summary = [
    `PaperPilot compliance report`,
    `Title: ${title}`,
    `Version: v${versionNumber}.0`,
    `Score: ${score} / 100`,
    `Errors: ${errors} � Warnings: ${warnings} � Checks: ${checks.length}`,
    ``,
    `Full PDF download is available on the web app.`,
  ].join("\n");
  return { summary, versionNumber, title };
}