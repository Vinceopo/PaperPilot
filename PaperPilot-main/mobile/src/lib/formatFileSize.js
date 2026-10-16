/**
 * Human-readable file size. Binary units (1024), matching Cloudinary's limits,
 * so a 10,485,760 byte limit reads "10 MB".
 * At most one decimal place. `roundUp` never rounds a size down to a smaller value.
 */
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

export function oversizeFileMessage(fileBytes, maxBytes) {
  return `Your file is ${formatFileSize(fileBytes)}, but the maximum allowed file size is ${formatFileSize(maxBytes)}. Please upload a smaller file.`;
}
