/**
 * Plan catalogue shared by pricing, checkout, usage counters and notifications.
 * Prices must match api/app/paymongo.py. Annual = 11 × monthly (one month free).
 */

import { APP_TIME_ZONE } from "./timeZone.js";

export const PAID_TIERS = ["premium", "pro"];

export const PLAN_PRICES = {
  premium: { monthly: 949, annual: 10439 },
  pro: { monthly: 1499, annual: 16489 },
};

export const PLAN_LIMITS = { free: 3, premium: 50, pro: 75 };

/** Annual = 11 × monthly → 1/12 off ≈ 8%. */
export const ANNUAL_SAVINGS_PERCENT = Math.round((1 / 12) * 100);
export const ANNUAL_SAVINGS_LABEL = `Save ${ANNUAL_SAVINGS_PERCENT}%`;

export const FREE_FEATURES = [
  "3 scans / month",
  "View current version only",
  "APA style only",
  "Uploads up to 15 MB",
];
export const PREMIUM_FEATURES = [
  "Up to 50 scans / month",
  "Unlimited version history",
  "APA, MLA, & IEEE styles",
  "Uploads up to 45 MB",
];
export const PRO_FEATURES = [
  "Up to 75 scans / weekly",
  "Unlimited version history",
  "APA, MLA, & IEEE styles",
  "Uploads up to 120 MB",
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

/**
 * Single source of truth for header "scans remaining" and Account "scan usage".
 * Always keeps used + remaining === limit (clamped).
 */
export function scanAllowance(subscription, tier) {
  const resolvedTier = normalizeTier(tier || subscription?.tier || "free");
  const limit = Math.max(
    0,
    Number(subscription?.limit) || planLimit(resolvedTier) || 0
  );
  const rawUsed = Number(subscription?.used ?? subscription?.scans_used ?? 0);
  const used = Number.isFinite(rawUsed) ? Math.max(0, Math.min(limit, rawUsed)) : 0;
  const rawRemaining = Number(subscription?.remaining);
  const remaining = Number.isFinite(rawRemaining)
    ? Math.max(0, Math.min(limit, rawRemaining))
    : Math.max(limit - used, 0);
  // Prefer remaining when API sent it; derive used so both UIs never disagree.
  const syncedUsed = Number.isFinite(rawRemaining)
    ? Math.max(0, limit - remaining)
    : used;
  return {
    tier: resolvedTier,
    limit,
    used: syncedUsed,
    remaining: Math.max(limit - syncedUsed, 0),
    window: resetWindow(resolvedTier),
    // Prefer scan-window reset; fall back to billing renewal fields when API omits reset_at.
    resetAt:
      subscription?.reset_at ||
      subscription?.period_end ||
      subscription?.billing_period_end ||
      subscription?.renews_at ||
      "",
  };
}

/**
 * Immediate header update after a successful scan. Server remains source of truth;
 * replace with GET /subscription as soon as it returns.
 *
 * Free snapshots sometimes still carry paid billing fields after cancel/cache races.
 * Strip those so storeSubscription does not reject the optimistic Free bump.
 */
export function applySuccessfulScanUsage(subscription) {
  if (!subscription || typeof subscription !== "object") return subscription;
  const tier = normalizeTier(subscription.tier);
  const limit = Math.max(0, Number(subscription.limit) || planLimit(tier) || 0);
  const used = Math.max(0, Number(subscription.used ?? subscription.scans_used) || 0);
  const nextUsed = limit > 0 ? Math.min(limit, used + 1) : used + 1;
  const next = {
    ...subscription,
    used: nextUsed,
    remaining: Math.max(0, limit - nextUsed),
  };
  if (!isPaidTier(tier)) {
    const status = String(next.status || "").toLowerCase();
    if (status === "active" || status === "past_due" || status === "paid") {
      next.status = "free";
    }
    if (next.paymongo_subscription_id) next.paymongo_subscription_id = null;
    const renews = Date.parse(next.renews_at || "");
    if (Number.isFinite(renews) && renews > Date.now()) {
      next.renews_at = null;
    }
  }
  return next;
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

/**
 * Day-level countdown to a reset/billing ISO date in the user's local calendar.
 * Returns null when the date is missing or unparseable (caller should hide the line).
 */
export function daysUntilReset(resetAt, now = new Date()) {
  if (!resetAt) return null;
  const end = new Date(resetAt);
  if (Number.isNaN(end.getTime())) return null;
  const startLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endLocal = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endLocal.getTime() - startLocal.getTime()) / 86_400_000);
}

function pluralUnit(count, singular) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/** Hours + minutes remaining until reset (null when missing / invalid). */
export function hoursMinutesUntilReset(resetAt, now = new Date()) {
  if (!resetAt) return null;
  const end = new Date(resetAt);
  if (Number.isNaN(end.getTime())) return null;
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return { hours: 0, minutes: 0, totalMs: ms };
  const totalMinutes = Math.max(1, Math.ceil(ms / 60_000));
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
    totalMs: ms,
  };
}

/**
 * Human label for the Account usage footer date.
 * Premium is prepaid access → "Expires…". Free/Pro refresh allowance → "Resets…".
 * Empty string when the date is unavailable.
 */
export function scanResetLabel(resetAt, now = new Date(), tier) {
  const remaining = hoursMinutesUntilReset(resetAt, now);
  if (!remaining) return "";
  const end = new Date(resetAt);
  const dateText = end.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: APP_TIME_ZONE,
  });
  const expires = normalizeTier(tier) === "premium";
  if (remaining.totalMs <= 0) {
    return expires ? `Expired on ${dateText}` : `Reset was due on ${dateText}`;
  }
  // Under 24 hours: show hours and minutes (Account Details countdown).
  if (remaining.totalMs < 86_400_000) {
    const { hours, minutes } = remaining;
    const verb = expires ? "Expires" : "Resets";
    if (hours <= 0) return `${verb} in ${pluralUnit(minutes, "minute")}`;
    if (minutes <= 0) return `${verb} in ${pluralUnit(hours, "hour")}`;
    return `${verb} in ${pluralUnit(hours, "hour")} ${pluralUnit(minutes, "minute")}`;
  }
  const days = daysUntilReset(resetAt, now);
  if (days === 1) return expires ? "Expires tomorrow" : "Resets tomorrow";
  return expires
    ? `Expires on ${dateText} (in ${days} days)`
    : `Resets on ${dateText} (in ${days} days)`;
}
