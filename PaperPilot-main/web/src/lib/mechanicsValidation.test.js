import { describe, expect, it } from "vitest";
import {
  applyIgnoredFieldsToForm,
  fillEmptyFieldsWithIgnore,
  filterValidationForForm,
  ignoredFieldsFromForm,
} from "./mechanicsValidation.js";
import { emptyMechanicsForm, formToRules, rulesToForm } from "./formatMechanicsForm.js";

describe("deleted headings mean no rules", () => {
  it("omits heading rules and marks them ignored when headings are removed", () => {
    const form = {
      ...emptyMechanicsForm("Capstone"),
      marginTop: "1",
      headings: [],
    };
    const rules = formToRules(form);
    expect(rules.font?.heading1_size).toBeUndefined();
    expect(rules.font?.heading2_size).toBeUndefined();
    expect(rules.font?.heading_styles).toBeUndefined();
    const ignored = ignoredFieldsFromForm(form);
    expect(ignored).toContain("font:heading1_size");
    expect(ignored).toContain("font:heading2_size");
    expect(ignored).toContain("heading_styles:heading1_style");
    expect(ignored).toContain("heading_styles:heading2_style");
  });

  it("treats a cleared heading card (no rule chips) as ignored", () => {
    const form = {
      ...emptyMechanicsForm("Capstone"),
      marginTop: "1",
      headings: [{ size: "", bold: "", italic: "", case: "", alignment: "", fields: [] }],
    };
    expect(formToRules(form).font?.heading1_size).toBeUndefined();
    expect(ignoredFieldsFromForm(form)).toContain("font:heading1_size");
  });
});

describe("fillEmptyFieldsWithIgnore", () => {
  it("keeps extracted values and sets missing fields to IGNORE", () => {
    const form = fillEmptyFieldsWithIgnore({
      ...emptyMechanicsForm("Capstone"),
      marginTop: "1",
      fontType: "Arial",
      citationFormat: "APA",
    });
    expect(form.marginTop).toBe("1");
    expect(form.fontType).toBe("Arial");
    expect(form.citationFormat).toBe("APA");
    expect(form.marginLeft).toBe("IGNORE");
    expect(form.bodySize).toBe("IGNORE");
    expect(form.paginationTitlePage).toBe("IGNORE");
    expect(form.paginationChapterMarkers).toBe("IGNORE");
    expect(form.headings).toEqual([]);
  });

  it("lists filled IGNORE fields in ignoredFieldsFromForm for scan skip", () => {
    const form = fillEmptyFieldsWithIgnore({
      ...emptyMechanicsForm("Capstone"),
      marginTop: "1",
    });
    const ignored = ignoredFieldsFromForm(form);
    expect(ignored).toContain("margins:left");
    expect(ignored).toContain("citation_format:citation_style");
    expect(ignored).not.toContain("margins:top");
  });
});

describe("filterValidationForForm font coverage", () => {
  const missingFont = {
    ok: false,
    issues: [
      {
        id: "font::missing_category",
        category: "font",
        field: "",
        code: "missing_category",
        message: 'Missing label: "Font"',
        severity: "critical",
        location: { page: 1, line: 1, excerpt: "Font", severity: "critical", section: "Mechanics" },
      },
    ],
  };

  it("clears Missing label Font when body/type/color are filled and headings are empty", () => {
    const form = {
      ...emptyMechanicsForm("PLSP"),
      bodySize: "12",
      fontType: "Arial",
      fontColor: "Automatic",
      headings: [],
    };
    const result = filterValidationForForm(missingFont, form);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("keeps Missing label Font when body size is still empty", () => {
    const form = {
      ...emptyMechanicsForm("PLSP"),
      bodySize: "",
      fontType: "Arial",
      fontColor: "Automatic",
      headings: [],
    };
    const result = filterValidationForForm(missingFont, form);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.category === "font")).toBe(true);
  });

  it("treats absent heading rows as ignored heading sizes", () => {
    const form = {
      ...emptyMechanicsForm("PLSP"),
      bodySize: "12",
      fontType: "Arial",
      fontColor: "Automatic",
      headings: [],
    };
    const ignored = ignoredFieldsFromForm(form);
    expect(ignored).toContain("font:heading1_size");
    expect(ignored).toContain("font:heading2_size");
  });
});

describe("applyIgnoredFieldsToForm", () => {
  it("restores pagination IGNORE so Saved Mechanics does not show Choose…", () => {
    const rules = {
      pagination: { position: "Top right" },
      page_break_requirements: ["Do page break only when starting a new chapter"],
    };
    const ignored = [
      "pagination:title_page",
      "pagination:first_page_of_chapter",
      "pagination:preliminary_pages",
      "pagination:body_numbering",
      "pagination:chapter_starts",
    ];
    const form = applyIgnoredFieldsToForm(rulesToForm(rules, "Capstone"), ignored);
    expect(form.paginationPosition).toBe("Top right");
    expect(form.paginationTitlePage).toBe("IGNORE");
    expect(form.paginationFirstPageRule).toBe("IGNORE");
    expect(form.paginationPreliminaryStyle).toBe("IGNORE");
    expect(form.paginationBodyNumbering).toBe("IGNORE");
    expect(form.paginationChapterMarkers).toBe("IGNORE");
  });

  it("round-trips IGNORE through ignoredFieldsFromForm", () => {
    const form = {
      ...emptyMechanicsForm("Capstone"),
      paginationPosition: "Top right",
      paginationTitlePage: "IGNORE",
      paginationFirstPageRule: "IGNORE",
      citationFormat: "IGNORE",
    };
    const ignored = ignoredFieldsFromForm(form);
    expect(ignored).toContain("pagination:title_page");
    expect(ignored).toContain("pagination:first_page_of_chapter");
    expect(ignored).toContain("citation_format:citation_style");
    const restored = applyIgnoredFieldsToForm(rulesToForm({ pagination: { position: "Top right" } }, "Capstone"), ignored);
    expect(restored.paginationTitlePage).toBe("IGNORE");
    expect(restored.paginationFirstPageRule).toBe("IGNORE");
    expect(restored.citationFormat).toBe("IGNORE");
  });
});
