/**
 * Mock manuscripts for the My Manuscripts page.
 * Each manuscript's table score/status is derived from its latest version.
 */

function v(id, manuscriptId, versionNumber, scannedDate, score, issues, breakdown) {
  const status = score >= 80 ? "compliant" : score >= 50 ? "needs_revision" : "critical";
  return {
    id,
    manuscriptId,
    versionNumber,
    scannedDate,
    score,
    status,
    issues,
    breakdown,
  };
}

export const INITIAL_MANUSCRIPTS = [
  {
    id: "ms-1",
    title: "Effects of Microplastics on Coastal Ecosystems",
    institution: "UC-BANILAD",
    citationStyle: "APA 7th Ed.",
    createdThisMonth: true,
    versions: [
      v(
        "v1-2",
        "ms-1",
        2,
        "2026-08-28",
        86,
        [
          { category: "Spacing", severity: "info", description: "Minor extra blank line on page 4" },
          { category: "Margins", severity: "warning", description: "Left margin 0.9\" on page 2 (required 1.0\")" },
        ],
        [
          { section: "Fonts", score: 92 },
          { section: "Spacing", score: 88 },
          { section: "Indention", score: 90 },
          { section: "Margins", score: 78 },
          { section: "Page breaks", score: 95 },
          { section: "Table layout", score: 84 },
          { section: "Pagination", score: 90 },
          { section: "Citation format", score: 82 },
        ]
      ),
      v(
        "v1-1",
        "ms-1",
        1,
        "2026-08-12",
        71,
        [
          { category: "Fonts", severity: "critical", description: "Wrong font family on title page" },
          { category: "Citation format", severity: "warning", description: "In-text citations missing year on 3 lines" },
        ],
        [
          { section: "Fonts", score: 48 },
          { section: "Spacing", score: 75 },
          { section: "Indention", score: 80 },
          { section: "Margins", score: 70 },
          { section: "Page breaks", score: 85 },
          { section: "Table layout", score: 72 },
          { section: "Pagination", score: 80 },
          { section: "Citation format", score: 62 },
        ]
      ),
    ],
  },
  {
    id: "ms-2",
    title: "AI-Assisted Peer Review in Graduate Research",
    institution: "CIT-UNIVERSITY",
    citationStyle: "IEEE",
    createdThisMonth: true,
    versions: [
      v(
        "v2-1",
        "ms-2",
        1,
        "2026-09-01",
        64,
        [
          { category: "Spacing", severity: "warning", description: "Line spacing 1.15; mechanics require 1.5" },
          { category: "Indention", severity: "warning", description: "Inconsistent first-line indent on pages 5–7" },
          { category: "Citation format", severity: "critical", description: "Reference list not in IEEE order" },
        ],
        [
          { section: "Fonts", score: 80 },
          { section: "Spacing", score: 55 },
          { section: "Indention", score: 58 },
          { section: "Margins", score: 72 },
          { section: "Page breaks", score: 70 },
          { section: "Table layout", score: 68 },
          { section: "Pagination", score: 75 },
          { section: "Citation format", score: 42 },
        ]
      ),
    ],
  },
  {
    id: "ms-3",
    title: "Quantitative Analysis of Urban Heat Islands",
    institution: "USC-TALAMBAN",
    citationStyle: "APA 7th Ed.",
    createdThisMonth: false,
    versions: [
      v(
        "v3-3",
        "ms-3",
        3,
        "2026-08-20",
        91,
        [{ category: "Pagination", severity: "info", description: "Page number style differs on appendix A" }],
        [
          { section: "Fonts", score: 95 },
          { section: "Spacing", score: 92 },
          { section: "Indention", score: 90 },
          { section: "Margins", score: 94 },
          { section: "Page breaks", score: 88 },
          { section: "Table layout", score: 90 },
          { section: "Pagination", score: 85 },
          { section: "Citation format", score: 93 },
        ]
      ),
      v("v3-2", "ms-3", 2, "2026-08-05", 79, [], [
        { section: "Fonts", score: 82 },
        { section: "Spacing", score: 78 },
        { section: "Indention", score: 80 },
        { section: "Margins", score: 76 },
        { section: "Page breaks", score: 80 },
        { section: "Table layout", score: 75 },
        { section: "Pagination", score: 78 },
        { section: "Citation format", score: 81 },
      ]),
      v("v3-1", "ms-3", 1, "2026-07-18", 52, [], [
        { section: "Fonts", score: 40 },
        { section: "Spacing", score: 55 },
        { section: "Indention", score: 50 },
        { section: "Margins", score: 48 },
        { section: "Page breaks", score: 60 },
        { section: "Table layout", score: 55 },
        { section: "Pagination", score: 58 },
        { section: "Citation format", score: 45 },
      ]),
    ],
  },
  {
    id: "ms-4",
    title: "Curriculum Mapping for Capstone Proposals",
    institution: "UC-BANILAD",
    citationStyle: "MLA 9th Ed.",
    createdThisMonth: false,
    versions: [
      v(
        "v4-1",
        "ms-4",
        1,
        "2026-07-30",
        38,
        [
          { category: "Fonts", severity: "critical", description: "Body text uses Arial instead of Times New Roman" },
          { category: "Margins", severity: "critical", description: "Paper size Letter vs required A4" },
          { category: "Citation format", severity: "critical", description: "Works Cited missing hanging indent" },
        ],
        [
          { section: "Fonts", score: 22 },
          { section: "Spacing", score: 45 },
          { section: "Indention", score: 40 },
          { section: "Margins", score: 28 },
          { section: "Page breaks", score: 50 },
          { section: "Table layout", score: 42 },
          { section: "Pagination", score: 48 },
          { section: "Citation format", score: 30 },
        ]
      ),
    ],
  },
  {
    id: "ms-5",
    title: "Blockchain Traceability in Supply Chains",
    institution: "CIT-UNIVERSITY",
    citationStyle: "APA 7th Ed.",
    createdThisMonth: false,
    versions: [
      v(
        "v5-2",
        "ms-5",
        2,
        "2026-08-15",
        58,
        [
          { category: "Table layout", severity: "warning", description: "Table 2 overflows right margin" },
          { category: "Spacing", severity: "warning", description: "Inconsistent paragraph spacing in Chapter 3" },
        ],
        [
          { section: "Fonts", score: 70 },
          { section: "Spacing", score: 52 },
          { section: "Indention", score: 60 },
          { section: "Margins", score: 55 },
          { section: "Page breaks", score: 62 },
          { section: "Table layout", score: 48 },
          { section: "Pagination", score: 65 },
          { section: "Citation format", score: 58 },
        ]
      ),
      v("v5-1", "ms-5", 1, "2026-08-01", 49, [], [
        { section: "Fonts", score: 55 },
        { section: "Spacing", score: 45 },
        { section: "Indention", score: 50 },
        { section: "Margins", score: 48 },
        { section: "Page breaks", score: 52 },
        { section: "Table layout", score: 40 },
        { section: "Pagination", score: 50 },
        { section: "Citation format", score: 44 },
      ]),
    ],
  },
  {
    id: "ms-6",
    title: "Student Wellness and Academic Persistence",
    institution: "USC-TALAMBAN",
    citationStyle: "APA 7th Ed.",
    createdThisMonth: false,
    versions: [
      v(
        "v6-1",
        "ms-6",
        1,
        "2026-06-22",
        83,
        [{ category: "Indention", severity: "info", description: "One block quote uses wrong indent depth" }],
        [
          { section: "Fonts", score: 88 },
          { section: "Spacing", score: 85 },
          { section: "Indention", score: 76 },
          { section: "Margins", score: 90 },
          { section: "Page breaks", score: 84 },
          { section: "Table layout", score: 80 },
          { section: "Pagination", score: 86 },
          { section: "Citation format", score: 82 },
        ]
      ),
    ],
  },
  {
    id: "ms-7",
    title: "Hybrid Learning Outcomes in STEM Courses",
    institution: "UC-BANILAD",
    citationStyle: "IEEE",
    createdThisMonth: false,
    versions: [
      v(
        "v7-1",
        "ms-7",
        1,
        "2026-07-09",
        47,
        [
          { category: "Page breaks", severity: "critical", description: "Chapter headings orphaned at page bottoms" },
          { category: "Citation format", severity: "warning", description: "Mixed APA/IEEE citation styles" },
        ],
        [
          { section: "Fonts", score: 60 },
          { section: "Spacing", score: 50 },
          { section: "Indention", score: 48 },
          { section: "Margins", score: 55 },
          { section: "Page breaks", score: 30 },
          { section: "Table layout", score: 45 },
          { section: "Pagination", score: 52 },
          { section: "Citation format", score: 35 },
        ]
      ),
    ],
  },
  {
    id: "ms-8",
    title: "Open Educational Resources Adoption Study",
    institution: "CIT-UNIVERSITY",
    citationStyle: "APA 7th Ed.",
    createdThisMonth: false,
    versions: [
      v(
        "v8-2",
        "ms-8",
        2,
        "2026-08-25",
        77,
        [
          { category: "Margins", severity: "warning", description: "Top margin short by 0.1\" on odd pages" },
          { category: "Citation format", severity: "info", description: "DOI missing on two references" },
        ],
        [
          { section: "Fonts", score: 85 },
          { section: "Spacing", score: 80 },
          { section: "Indention", score: 78 },
          { section: "Margins", score: 68 },
          { section: "Page breaks", score: 82 },
          { section: "Table layout", score: 74 },
          { section: "Pagination", score: 80 },
          { section: "Citation format", score: 72 },
        ]
      ),
      v("v8-1", "ms-8", 1, "2026-08-10", 61, [], [
        { section: "Fonts", score: 70 },
        { section: "Spacing", score: 60 },
        { section: "Indention", score: 58 },
        { section: "Margins", score: 55 },
        { section: "Page breaks", score: 65 },
        { section: "Table layout", score: 60 },
        { section: "Pagination", score: 62 },
        { section: "Citation format", score: 58 },
      ]),
    ],
  },
  {
    id: "ms-9",
    title: "Accessibility Heuristics for Campus Portals",
    institution: "USC-TALAMBAN",
    citationStyle: "MLA 9th Ed.",
    createdThisMonth: false,
    versions: [
      v(
        "v9-1",
        "ms-9",
        1,
        "2026-05-14",
        88,
        [],
        [
          { section: "Fonts", score: 92 },
          { section: "Spacing", score: 90 },
          { section: "Indention", score: 88 },
          { section: "Margins", score: 90 },
          { section: "Page breaks", score: 86 },
          { section: "Table layout", score: 84 },
          { section: "Pagination", score: 89 },
          { section: "Citation format", score: 87 },
        ]
      ),
    ],
  },
  {
    id: "ms-10",
    title: "Disaster Risk Communication Frameworks",
    institution: "UC-BANILAD",
    citationStyle: "APA 7th Ed.",
    createdThisMonth: false,
    versions: [
      v(
        "v10-1",
        "ms-10",
        1,
        "2026-06-03",
        55,
        [
          { category: "Spacing", severity: "warning", description: "Double-spacing missing in literature review" },
          { category: "Fonts", severity: "warning", description: "Heading level 2 uses wrong size" },
        ],
        [
          { section: "Fonts", score: 50 },
          { section: "Spacing", score: 48 },
          { section: "Indention", score: 60 },
          { section: "Margins", score: 62 },
          { section: "Page breaks", score: 58 },
          { section: "Table layout", score: 55 },
          { section: "Pagination", score: 60 },
          { section: "Citation format", score: 52 },
        ]
      ),
    ],
  },
  {
    id: "ms-11",
    title: "Sentiment Analysis of Student Feedback",
    institution: "CIT-UNIVERSITY",
    citationStyle: "IEEE",
    createdThisMonth: false,
    versions: [
      v(
        "v11-1",
        "ms-11",
        1,
        "2026-04-19",
        42,
        [
          { category: "Margins", severity: "critical", description: "Figures clipped on right edge" },
          { category: "Pagination", severity: "critical", description: "Roman numerals restart incorrectly" },
        ],
        [
          { section: "Fonts", score: 55 },
          { section: "Spacing", score: 45 },
          { section: "Indention", score: 40 },
          { section: "Margins", score: 28 },
          { section: "Page breaks", score: 50 },
          { section: "Table layout", score: 38 },
          { section: "Pagination", score: 30 },
          { section: "Citation format", score: 48 },
        ]
      ),
    ],
  },
  {
    id: "ms-12",
    title: "Ethical Guidelines for Classroom AI Tools",
    institution: "USC-TALAMBAN",
    citationStyle: "APA 7th Ed.",
    createdThisMonth: false,
    versions: [
      v(
        "v12-1",
        "ms-12",
        1,
        "2026-08-30",
        81,
        [{ category: "Citation format", severity: "info", description: "One URL should use DOI format" }],
        [
          { section: "Fonts", score: 86 },
          { section: "Spacing", score: 84 },
          { section: "Indention", score: 82 },
          { section: "Margins", score: 80 },
          { section: "Page breaks", score: 85 },
          { section: "Table layout", score: 78 },
          { section: "Pagination", score: 83 },
          { section: "Citation format", score: 79 },
        ]
      ),
    ],
  },
];
