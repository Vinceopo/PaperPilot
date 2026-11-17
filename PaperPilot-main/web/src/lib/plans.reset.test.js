import { describe, expect, it } from "vitest";
import { daysUntilReset, scanAllowance, scanResetLabel } from "./plans.js";

describe("scanAllowance", () => {
  it("keeps remaining and used on the same limit", () => {
    const a = scanAllowance({ tier: "pro", limit: 75, used: 67, remaining: 8 }, "pro");
    expect(a.used).toBe(67);
    expect(a.remaining).toBe(8);
    expect(a.limit).toBe(75);
    expect(a.used + a.remaining).toBe(a.limit);
    expect(a.window).toBe("week");
  });

  it("derives remaining when API omits it", () => {
    const a = scanAllowance({ tier: "pro", limit: 75, used: 67 }, "pro");
    expect(a.remaining).toBe(8);
    expect(a.used).toBe(67);
  });
});

describe("daysUntilReset", () => {
  it("returns null when reset date is missing or invalid", () => {
    expect(daysUntilReset(null)).toBeNull();
    expect(daysUntilReset("")).toBeNull();
    expect(daysUntilReset("not-a-date")).toBeNull();
  });

  it("counts calendar days, not hours", () => {
    const now = new Date(2026, 10, 17, 23, 0, 0); // Nov 17 local
    expect(daysUntilReset(new Date(2026, 10, 17, 1, 0, 0).toISOString(), now)).toBe(0);
    expect(daysUntilReset(new Date(2026, 10, 18, 0, 30, 0).toISOString(), now)).toBe(1);
    expect(daysUntilReset(new Date(2026, 10, 24, 12, 0, 0).toISOString(), now)).toBe(7);
  });

  it("handles end-of-month and past dates", () => {
    const now = new Date(2026, 0, 31, 10, 0, 0); // Jan 31
    expect(daysUntilReset(new Date(2026, 1, 1, 9, 0, 0).toISOString(), now)).toBe(1);
    expect(daysUntilReset(new Date(2026, 0, 30, 9, 0, 0).toISOString(), now)).toBe(-1);
  });
});

describe("scanResetLabel", () => {
  it("shows hours and minutes when reset is under 24 hours away", () => {
    const now = new Date(2026, 10, 17, 12, 0, 0);
    expect(scanResetLabel(new Date(2026, 10, 17, 17, 32, 0).toISOString(), now)).toBe(
      "Resets in 5 hours 32 minutes"
    );
    expect(scanResetLabel(new Date(2026, 10, 17, 12, 45, 0).toISOString(), now)).toBe(
      "Resets in 45 minutes"
    );
    expect(scanResetLabel(new Date(2026, 10, 17, 14, 0, 0).toISOString(), now)).toBe(
      "Resets in 2 hours"
    );
  });

  it("uses tomorrow / in N days when reset is 24h or more away", () => {
    const now = new Date(2026, 10, 17, 12, 0, 0);
    expect(scanResetLabel(new Date(2026, 10, 18, 12, 0, 0).toISOString(), now)).toBe(
      "Resets tomorrow"
    );
    expect(scanResetLabel(new Date(2026, 10, 20, 12, 0, 0).toISOString(), now)).toMatch(
      /^Resets on .+ \(in 3 days\)$/
    );
  });

  it("returns empty when date is missing", () => {
    expect(scanResetLabel(null)).toBe("");
  });
});
