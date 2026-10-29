import { describe, expect, it } from "vitest";
import {
  excerptNeedles,
  pageAlign,
  pageRegion,
  pickBestRects,
  resolveDocxHighlight,
  resolvePdfMarkY,
  shouldUsePaginationEdge,
  visualLineTarget,
} from "./documentPreviewLocate.js";

describe("visualLineTarget", () => {
  const blocks = [
    { lineHeight: 20, height: 20, leadingLines: 3, trailingLines: 2 },
    { lineHeight: 20, height: 40, leadingLines: 0, trailingLines: 0 },
  ];

  it("snaps leading blank gaps onto the first content line", () => {
    expect(visualLineTarget(blocks, 1)).toEqual({ index: 0, delta: 0 });
    expect(visualLineTarget(blocks, 2)).toEqual({ index: 0, delta: 0 });
    expect(visualLineTarget(blocks, 3)).toEqual({ index: 0, delta: 0 });
  });

  it("keeps content lines inside the paragraph", () => {
    // lines 1-3 leading (snapped), line 4 = first content line of block 0
    expect(visualLineTarget(blocks, 4)).toEqual({ index: 0, delta: 0 });
  });

  it("snaps trailing blank gaps onto the last content line", () => {
    // block0: 3 leading + 1 content + 2 trailing = 6; block1 starts at 7
    // line 5-6 were trailing of block0 → last content (delta 0 for 1-line block)
    expect(visualLineTarget(blocks, 5)).toEqual({ index: 0, delta: 0 });
    expect(visualLineTarget(blocks, 6)).toEqual({ index: 0, delta: 0 });
  });

  it("keeps distinct content lines inside a multi-line block unique", () => {
    const multi = [{ lineHeight: 18, height: 54, leadingLines: 0, trailingLines: 0 }];
    expect(visualLineTarget(multi, 1)).toEqual({ index: 0, delta: 0 });
    expect(visualLineTarget(multi, 2)).toEqual({ index: 0, delta: 18 });
    expect(visualLineTarget(multi, 3)).toEqual({ index: 0, delta: 36 });
  });
});

describe("excerptNeedles", () => {
  it("keeps short titles locatable", () => {
    expect(excerptNeedles("By:")).toContain("by:");
    expect(excerptNeedles("A Research Proposal")[0]).toBe("a research proposal");
  });

  it("ignores empty excerpts", () => {
    expect(excerptNeedles("")).toEqual([]);
    expect(excerptNeedles(" ")).toEqual([]);
  });
});

describe("pickBestRects / resolveDocxHighlight", () => {
  const line13 = [{ top: 260, left: 40, width: 400, height: 16 }];
  const line14 = [{ top: 280, left: 40, width: 400, height: 16 }];
  const line15 = [{ top: 300, left: 40, width: 400, height: 16 }];

  it("picks the rect closest to the line estimate even when only one needle hit exists", () => {
    // Same single excerpt candidate pool for every issue — line estimate must decide.
    const pool = [line13, line14, line15];
    expect(pickBestRects(pool, 260)[0].top).toBe(260);
    expect(pickBestRects(pool, 280)[0].top).toBe(280);
    expect(pickBestRects(pool, 300)[0].top).toBe(300);
  });

  it("never collapses lines 13/14/15 onto one highlight when estimates differ", () => {
    const groups = [
      { page: 1, candidates: [line13, line14, line15] },
    ];
    const tops = [13, 14, 15].map((line, index) => {
      const estimateTop = 260 + index * 20;
      return resolveDocxHighlight({
        candidateGroups: groups,
        estimateTop,
        line,
      })[0].top;
    });
    expect(new Set(tops).size).toBe(3);
    expect(tops).toEqual([260, 280, 300]);
  });

  it("falls back to the first candidate when no line is provided", () => {
    const groups = [{ page: 1, candidates: [line14, line15] }];
    expect(resolveDocxHighlight({ candidateGroups: groups, line: null })[0].top).toBe(280);
  });
});

describe("resolvePdfMarkY", () => {
  const ys = [40, 60, 80, 100, 120]; // lines 1..5

  it("prefers scanner line over a conflicting bbox", () => {
    // Coarse bbox near line 1 while the issue reports line 4.
    expect(resolvePdfMarkY({ line: 4, ys, bboxY: 42, pageHeight: 800 })).toBe(100);
  });

  it("keeps adjacent lines distinct", () => {
    expect(resolvePdfMarkY({ line: 2, ys, pageHeight: 800 })).toBe(60);
    expect(resolvePdfMarkY({ line: 3, ys, pageHeight: 800 })).toBe(80);
    expect(resolvePdfMarkY({ line: 4, ys, pageHeight: 800 })).toBe(100);
  });

  it("clamps past-the-end line numbers onto the last measured row", () => {
    expect(resolvePdfMarkY({ line: 99, ys, pageHeight: 800 })).toBe(120);
  });

  it("uses bbox when no line pin exists", () => {
    expect(resolvePdfMarkY({ line: null, ys, bboxY: 55, pageHeight: 800 })).toBe(55);
  });
});

describe("pagination edge highlight", () => {
  it("always uses the header/footer chip for pagination, even with a body line/excerpt", () => {
    expect(
      shouldUsePaginationEdge({
        section: "Pagination",
        line: 1,
        excerpt: "CHAPTER I INTRODUCTION",
      })
    ).toBe(true);
    expect(shouldUsePaginationEdge({ section: "Fonts", line: 1 })).toBe(false);
  });

  it("reads top-right placement from recommendation wording", () => {
    expect(pageRegion({ recommendation: "Add a page number at the top right of the page." })).toBe("top");
    expect(pageAlign({ recommendation: "Add a page number at the top right of the page." })).toBe("right");
  });
});
