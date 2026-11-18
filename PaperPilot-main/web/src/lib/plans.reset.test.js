import { describe, expect, it } from "vitest";
import {
  applySuccessfulScanUsage,
  daysUntilReset,
  scanAllowance,
  scanResetLabel,
} from "./plans.js";

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

  it("falls back to billing_period_end / renews_at for resetAt", () => {
    expect(
      scanAllowance({ tier: "free", limit: 3, used: 1, billing_period_end: "2026-12-01T00:00:00Z" }, "free")
        .resetAt
    ).toBe("2026-12-01T00:00:00Z");
    expect(
      scanAllowance({ tier: "premium", limit: 50, used: 2, renews_at: "2026-12-15T00:00:00Z" }, "premium")
        .resetAt
    ).toBe("2026-12-15T00:00:00Z");
  });
});

describe("applySuccessfulScanUsage", () => {
  it("drops remaining immediately using the plan limit from the subscription", () => {
    const next = applySuccessfulScanUsage({ tier: "free", limit: 3, used: 0, remaining: 3 });
    expect(next.used).toBe(1);
    expect(next.remaining).toBe(2);
    expect(scanAllowance(next, "free").remaining).toBe(2);
  });

  it("respects a non-free limit and does not go below zero", () => {
    const premium = applySuccessfulScanUsage({ tier: "premium", limit: 50, used: 49, remaining: 1 });
    expect(premium.used).toBe(50);
    expect(premium.remaining).toBe(0);
    const capped = applySuccessfulScanUsage({ tier: "free", limit: 3, used: 3, remaining: 0 });
    expect(capped.used).toBe(3);
    expect(capped.remaining).toBe(0);
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

  it("uses Expires wording for Premium plan end", () => {
    const now = new Date(2026, 10, 17, 12, 0, 0);
    expect(scanResetLabel(new Date(2026, 10, 18, 12, 0, 0).toISOString(), now, "premium")).toBe(
      "Expires tomorrow"
    );
    expect(scanResetLabel(new Date(2026, 10, 20, 12, 0, 0).toISOString(), now, "premium")).toMatch(
      /^Expires on .+ \(in 3 days\)$/
    );
  });
});
