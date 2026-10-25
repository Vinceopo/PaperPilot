import { describe, expect, it } from "vitest";
import {
  dedupeIssueLocations,
  locationDedupKey,
  mapComplianceScanToResult,
  normalizeIssueLocation,
} from "./scanMapper.js";

describe("location dedup", () => {
  it("keeps the first of identical locations and preserves truncated count", () => {
    const locs = [
      normalizeIssueLocation({ page: 1, line: 2, excerpt: "Hello", bbox: [10, 20, 100, 40], page_width: 612, page_height: 792 }),
      normalizeIssueLocation({ page: 1, line: 2, excerpt: "Hello", bbox: [10, 20, 100, 40], page_width: 612, page_height: 792 }),
      normalizeIssueLocation({ page: 1, line: 3, excerpt: "World" }),
    ];
    const { locations, count } = dedupeIssueLocations(locs, "font_size", 10);
    expect(locations).toHaveLength(2);
    expect(count).toBe(2 + (10 - 3));
  });

  it("mapComplianceScanToResult dedupes locations on each format check", () => {
    const result = mapComplianceScanToResult({
      issues: [
        {
          issue_type: "font_size",
          severity: "critical",
          title: "Body text font size differs",
          summary: "size",
          explanation: "why",
          recommendation: "fix",
          count: 2,
          locations: [
            { page: 1, line: 1, section: "Fonts", excerpt: "Same" },
            { page: 1, line: 1, section: "Fonts", excerpt: "Same" },
          ],
        },
      ],
      scoring: { overall: { value: 50 }, categories: [] },
    });
    expect(result.formatChecks[0].locations).toHaveLength(1);
    expect(result.formatChecks[0].count).toBe(1);
    expect(locationDedupKey(result.formatChecks[0].locations[0], "font_size")).toContain("font_size|1|1");
  });

  it("never merges distinct page lines into one location", () => {
    const locs = [13, 14, 15].map((line) =>
      normalizeIssueLocation({ page: 1, line, section: "Fonts", excerpt: `Line ${line} text` })
    );
    const { locations, count } = dedupeIssueLocations(locs, "font_size", 3);
    expect(locations).toHaveLength(3);
    expect(count).toBe(3);
    expect(locations.map((loc) => loc.line)).toEqual([13, 14, 15]);
  });
});
