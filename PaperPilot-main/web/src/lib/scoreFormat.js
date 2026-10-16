/** Display-only formatting. Values arrive at full precision from the backend. */

export function hasValue(value) {
  return value != null && Number.isFinite(Number(value));
}

/** One-decimal percentage, or an em dash when the backend had no denominator. */
export function formatPct(value, digits = 1) {
  if (!hasValue(value)) return "—";
  const factor = 10 ** digits;
  return `${Math.round(Number(value) * factor) / factor}%`;
}

export function formatScore(value, digits = 1) {
  if (!hasValue(value)) return "—";
  const factor = 10 ** digits;
  return String(Math.round(Number(value) * factor) / factor);
}

/**
 * Round shares of one whole so the displayed values still add up to exactly 100
 * (largest-remainder method). Rounding each share on its own can show 99.9 or 100.1.
 * Inputs that are not shares of one whole are rounded individually.
 */
export function roundSharesToTotal(values, digits = 1) {
  const factor = 10 ** digits;
  const numbers = values.map((v) => (hasValue(v) ? Number(v) : null));
  const present = numbers.filter((v) => v != null);
  const sum = present.reduce((a, b) => a + b, 0);
  if (!present.length || Math.abs(sum - 100) > 0.5) {
    return numbers.map((v) => (v == null ? null : Math.round(v * factor) / factor));
  }
  const scaled = numbers.map((v) => (v == null ? null : v * factor));
  const floors = scaled.map((v) => (v == null ? null : Math.floor(v)));
  let remaining = Math.round(100 * factor) - floors.reduce((a, b) => a + (b ?? 0), 0);
  const order = scaled
    .map((v, i) => ({ i, rest: v == null ? -1 : v - floors[i] }))
    .sort((a, b) => b.rest - a.rest);
  for (const { i, rest } of order) {
    if (remaining <= 0 || rest < 0) break;
    floors[i] += 1;
    remaining -= 1;
  }
  return floors.map((v) => (v == null ? null : v / factor));
}

export function formatCount(value) {
  return hasValue(value) ? Number(value).toLocaleString("en-US") : "—";
}

export function plural(count, word, pluralWord = `${word}s`) {
  return Number(count) === 1 ? word : pluralWord;
}

export const CATEGORY_STATUS_LABEL = {
  not_evaluated: "Not evaluated",
  not_applicable: "Not applicable",
};
