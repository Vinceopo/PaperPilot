/**
 * Human-readable file size. Binary units (1024), matching Windows Explorer,
 * so a 15,728,640 byte limit reads "15 MB".
 * At most one decimal place. `roundUp` never rounds a size down to a smaller value.
 */

import { normalizeTier, planName } from "./plans.js";
import { maxUploadBytesForPlan } from "./uploadLimits.js";

export function formatFileSize(bytes, { roundUp = false } = {}) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = (roundUp ? Math.ceil(value * 10) : Math.round(value * 10)) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${units[unit]}`;
}

function resolveUploadLimit(maxBytes, tier) {
  return Number(maxBytes) > 0 ? Number(maxBytes) : maxUploadBytesForPlan(tier);
}

/** Plan-only limit line, e.g. "Your Free plan allows uploads up to 15 MB." */
export function planUploadLimitMessage(tier, maxBytes) {
  const limit = resolveUploadLimit(maxBytes, tier);
  return `Your ${planName(tier)} plan allows uploads up to ${formatFileSize(limit)}.`;
}

/** Optional upgrade nudge for oversize dialogs (Free / Premium only). */
export function planUploadUpgradeHint(tier) {
  const value = normalizeTier(tier);
  if (value === "free") {
    return " Upgrade to Premium or Pro on the Subscription page for a higher limit.";
  }
  if (value === "premium") {
    return " Upgrade to Pro on the Subscription page for a higher limit.";
  }
  return "";
}

/** When the server rejects size (413) and client tier may be unknown. */
export function allPlanUploadLimitsMessage() {
  return "Free plans allow up to 15 MB, Premium 45 MB, and Pro 120 MB.";
}

export function manuscriptPickerLimitHint(tier, maxBytes) {
  const limit = resolveUploadLimit(maxBytes, tier);
  return `${planName(tier)} plan · PDF only · up to ${formatFileSize(limit)}`;
}

export function mechanicsPickerLimitHint(tier, maxBytes) {
  const limit = resolveUploadLimit(maxBytes, tier);
  return `${planName(tier)} plan · .pdf and .docx · up to ${formatFileSize(limit)}`;
}

/**
 * @param {number} fileBytes
 * @param {number} [maxBytes]
 * @param {string} [tier] when set, names the plan in the message
 */
export function oversizeFileMessage(fileBytes, maxBytes, tier) {
  const limit = resolveUploadLimit(maxBytes, tier);
  const maxLabel = formatFileSize(limit);
  const base =
    tier != null && tier !== ""
      ? `This file is ${formatFileSize(fileBytes)}. Your ${planName(tier)} plan allows uploads up to ${maxLabel}. Please choose a smaller file to continue.`
      : `This file is ${formatFileSize(fileBytes)}, but the maximum allowed size is ${maxLabel}. Please choose a smaller file to continue.`;
  return tier != null && tier !== "" ? base + planUploadUpgradeHint(tier) : base;
}

/**
 * Named-file rejection used by manuscript / mechanics pickers (modal copy).
 * @param {{ name: string, size: number }} rejection
 * @param {string} [tier]
 * @param {number} [maxBytes]
 */
export function namedOversizeFileMessage(rejection, tier, maxBytes) {
  const limit = resolveUploadLimit(maxBytes, tier);
  const max = formatFileSize(limit);
  let actual = formatFileSize(rejection.size);
  if (actual === max) actual = formatFileSize(rejection.size, { roundUp: true });
  const name = String(rejection?.name || "This file").trim() || "This file";
  const base =
    `"${name}" is ${actual}. Your ${planName(tier)} plan allows uploads up to ${max}. ` +
    `Please choose a smaller file to continue.`;
  return base + planUploadUpgradeHint(tier);
}