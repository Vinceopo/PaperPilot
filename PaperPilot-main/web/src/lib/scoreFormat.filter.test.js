import { describe, expect, it } from "vitest";
import {
  activeScoreCategoriesFromRules,
  displayScoreCategory,
  filterIssuesByActiveRules,
  filterScoreBreakdownByRules,
  resolveScoreCategory,
} from "./scoreFormat.js";

describe("score breakdown rule filtering", () => {
  it("maps Spacing to Line Spacing for display", () => {
    expect(displayScoreCategory("Spacing")).toBe("Line Spacing");
    expect(displayScoreCategory("Captions")).toBe("Captions");
  });

  it("activates Margins for gutter/landscape and Alignment for page overrides", () => {
    const active = activeScoreCategoriesFromRules({
      margins_inches: { gutter: 0.5 },
      paper: { landscape_pages: "none" },
      alignment_page_overrides: { page_2: "center" },
      table_layout_requirements: ["Table 1 TITLE"],
    });
    expect(active.has("Margins")).toBe(true);
    expect(active.has("Alignment")).toBe(true);
    expect(active.has("Captions")).toBe(true);
  });

  it("keeps Spacing rows when Line Spacing rules are set", () => {
    const rows = filterScoreBreakdownByRules(
      [
        { metric: "Spacing", status: "fail", unitsChecked: 10, unitsFailed: 2 },
        { metric: "Captions", status: "not_applicable", unitsChecked: 0 },
      ],
      { line_spacing: 2 },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].metric).toBe("Line Spacing");
  });

  it("does not wipe breakdown when rules are empty", () => {
    const rows = filterScoreBreakdownByRules(
      [{ metric: "Fonts", status: "pass", unitsChecked: 3, unitsFailed: 0 }],
      {},
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].metric).toBe("Fonts");
  });

  it("keeps issues whose section is General but type maps to an active category", () => {
    const issues = filterIssuesByActiveRules(
      [
        { section: "General", issue_type: "line_spacing", finding: "bad spacing" },
        { section: "Spacing", issue_type: "line_spacing", finding: "also spacing" },
        { section: "Captions", issue_type: "table_caption", finding: "caption" },
      ],
      { line_spacing: 2 },
    );
    expect(issues).toHaveLength(2);
    expect(issues.every((item) => resolveScoreCategory(item) === "Line Spacing")).toBe(true);
  });
});
