/**
 * Human-readable file size. Decimal units (1000) so a 100_000_000 byte limit reads "100 MB".
 * At most one decimal place.
 */
export function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = n;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${units[unit]}`;
}

export function oversizeFileMessage(fileBytes, maxBytes) {
  return `Your file is ${formatFileSize(fileBytes)}, but the maximum allowed file size is ${formatFileSize(maxBytes)}. Please upload a smaller file.`;
}
