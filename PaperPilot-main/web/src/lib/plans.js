/**
 * Plan catalogue shared by pricing, checkout, usage counters and notifications.
 * Prices must match api/app/paymongo.py. Annual = 11 × monthly (one month free).
 */

export const PAID_TIERS = ["premium", "pro"];

export const PLAN_PRICES = {
  premium: { monthly: 949, annual: 10439 },
  pro: { monthly: 1499, annual: 16489 },
};

export const PLAN_LIMITS = { free: 3, premium: 50, pro: 75 };

/** Annual = 11 × monthly → 1/12 off ≈ 8%. */
export const ANNUAL_SAVINGS_PERCENT = Math.round((1 / 12) * 100);
export const ANNUAL_SAVINGS_LABEL = `Save ${ANNUAL_SAVINGS_PERCENT}%`;

export const FREE_FEATURES = ["3 scans / month", "View current version only", "APA style only"];
export const PREMIUM_FEATURES = [
  "Up to 50 scans / month",
  "Unlimited version history",
  "APA, MLA, & IEEE styles",
];
export const PRO_FEATURES = [
  "Up to 75 scans / weekly",
  "Unlimited version history",
  "APA, MLA, & IEEE styles",
];

export function normalizeTier(tier) {
  const value = String(tier || "free").toLowerCase();
  return value === "premium" || value === "pro" ? value : "free";
}

export function isPaidTier(tier) {
  return PAID_TIERS.includes(String(tier || "").toLowerCase());
}

export function planName(tier) {
  const value = normalizeTier(tier);
  if (value === "pro") return "Pro";
  if (value === "premium") return "Premium";
  return "Free";
}

export function planLimit(tier) {
  return PLAN_LIMITS[normalizeTier(tier)];
}

export function planPrice(tier, billingPeriod) {
  const prices = PLAN_PRICES[normalizeTier(tier)];
  if (!prices) return 0;
  return billingPeriod === "annual" ? prices.annual : prices.monthly;
}

/** "week" for Pro (7-day reset), "month" for Free and Premium. */
export function resetWindow(tier) {
  return normalizeTier(tier) === "pro" ? "week" : "month";
}
