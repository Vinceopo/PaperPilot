/**
 * Human-readable file size. Binary units (1024), so a 15,728,640 byte limit reads "15 MB".
 * At most one decimal place. `roundUp` never rounds a size down to a smaller value.
 */

import { planName } from "./plans";
import { maxUploadBytesForPlan } from "./uploadLimits";

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

/**
 * @param {number} fileBytes
 * @param {number} [maxBytes]
 * @param {string} [tier]
 */
export function oversizeFileMessage(fileBytes, maxBytes, tier) {
  const limit = Number(maxBytes) > 0 ? Number(maxBytes) : maxUploadBytesForPlan(tier);
  const maxLabel = formatFileSize(limit);
  if (tier != null && tier !== "") {
    return `Your file is ${formatFileSize(fileBytes)}, but ${planName(tier)} plans can upload up to ${maxLabel}. Please upload a smaller file.`;
  }
  return `Your file is ${formatFileSize(fileBytes)}, but the maximum allowed file size is ${maxLabel}. Please upload a smaller file.`;
}

/**
 * @param {{ name: string, size: number }} rejection
 * @param {string} [tier]
 * @param {number} [maxBytes]
 */
export function namedOversizeFileMessage(rejection, tier, maxBytes) {
  const limit = Number(maxBytes) > 0 ? Number(maxBytes) : maxUploadBytesForPlan(tier);
  const max = formatFileSize(limit);
  let actual = formatFileSize(rejection.size);
  if (actual === max) actual = formatFileSize(rejection.size, { roundUp: true });
  return `Your file '${rejection.name}' is ${actual}, but ${planName(tier)} plans can upload up to ${max}. Please choose a smaller file and try again.`;
}
