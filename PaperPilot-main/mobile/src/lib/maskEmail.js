/**
 * Mask an email for display after a code is sent.
 * Example: Vincebelleopo@gmail.com → Vincebell****@gmail.com
 */
export function maskEmail(email) {
  const raw = String(email || "").trim();
  const at = raw.lastIndexOf("@");
  if (at <= 0) return raw || "-";
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  if (!local || !domain) return raw;
  const keep = local.length <= 4 ? Math.max(1, local.length - 1) : local.length - 4;
  return `${local.slice(0, keep)}****@${domain}`;
}

/** Case-insensitive compare for login / reset email checks. */
export function emailsMatch(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}
