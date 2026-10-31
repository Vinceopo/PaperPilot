/**
 * Upload limits shared by every document picker and the S3 upload path.
 * Limits match subscription plans (Free 15 MB · Premium 45 MB · Pro 120 MB).
 */

import { normalizeTier } from "./plans.js";

/** Bytes per plan. Unknown / missing plan → Free. */
export const PLAN_UPLOAD_LIMITS_BYTES = {
  free: 15 * 1024 * 1024,
  premium: 45 * 1024 * 1024,
  pro: 120 * 1024 * 1024,
};

/** Absolute ceiling (Pro). Prefer maxUploadBytesForPlan(tier) at call sites. */
export const MAX_FILE_SIZE_BYTES = PLAN_UPLOAD_LIMITS_BYTES.pro;

/** @param {string} [tier] */
export function maxUploadBytesForPlan(tier) {
  return PLAN_UPLOAD_LIMITS_BYTES[normalizeTier(tier)] ?? PLAN_UPLOAD_LIMITS_BYTES.free;
}

/** Mechanics guides: PDF or DOCX. */
export const MECHANICS_ACCEPTED_EXTENSIONS = [".pdf", ".docx"];
export const MECHANICS_ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
export const MECHANICS_ACCEPT_ATTRIBUTE = [
  ...MECHANICS_ACCEPTED_EXTENSIONS,
  ...MECHANICS_ACCEPTED_MIME_TYPES,
].join(",");

/**
 * Manuscripts for analysis: PDF only (fixed pages + bboxes for precise Issue Tracing).
 */
export const MANUSCRIPT_ACCEPTED_EXTENSIONS = [".pdf"];
export const MANUSCRIPT_ACCEPTED_MIME_TYPES = ["application/pdf"];
export const MANUSCRIPT_ACCEPT_ATTRIBUTE = [
  ...MANUSCRIPT_ACCEPTED_EXTENSIONS,
  ...MANUSCRIPT_ACCEPTED_MIME_TYPES,
].join(",");

/** @deprecated Prefer MECHANICS_* or MANUSCRIPT_* — kept for shared helpers. */
export const ACCEPTED_EXTENSIONS = MECHANICS_ACCEPTED_EXTENSIONS;
export const ACCEPTED_MIME_TYPES = MECHANICS_ACCEPTED_MIME_TYPES;
export const ACCEPT_ATTRIBUTE = MECHANICS_ACCEPT_ATTRIBUTE;

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04" (DOCX container)

function fileExtension(file) {
  const name = String(file?.name || "");
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function startsWith(bytes, signature) {
  return signature.every((byte, index) => bytes[index] === byte);
}

async function hasExpectedSignature(file, ext) {
  try {
    const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    if (ext === ".pdf") {
      let start = 0;
      while (start < head.length && head[start] <= 0x20) start += 1;
      return startsWith(head.subarray(start), PDF_SIGNATURE);
    }
    return startsWith(head, ZIP_SIGNATURE);
  } catch {
    return false;
  }
}

/**
 * Checks the extension, the browser-reported type, and the file's actual contents,
 * since drag-and-drop and renamed files bypass the picker's `accept` filter.
 * @param {File} file
 * @param {"manuscript"|"mechanics"} [kind="mechanics"]
 * @param {number} [maxBytes=MAX_FILE_SIZE_BYTES]
 * @returns {Promise<"type"|"size"|"">}
 */
export async function getFileRejection(file, kind = "mechanics", maxBytes = MAX_FILE_SIZE_BYTES) {
  if (!file) return "";
  const allowedExt =
    kind === "manuscript" ? MANUSCRIPT_ACCEPTED_EXTENSIONS : MECHANICS_ACCEPTED_EXTENSIONS;
  const allowedMime =
    kind === "manuscript" ? MANUSCRIPT_ACCEPTED_MIME_TYPES : MECHANICS_ACCEPTED_MIME_TYPES;
  const ext = fileExtension(file);
  if (!allowedExt.includes(ext)) return "type";
  const mime = String(file.type || "").toLowerCase();
  if (mime && mime !== "application/octet-stream" && !allowedMime.includes(mime)) {
    return "type";
  }
  if (!(await hasExpectedSignature(file, ext))) return "type";
  const limit = Number(maxBytes) > 0 ? Number(maxBytes) : MAX_FILE_SIZE_BYTES;
  if (file.size > limit) return "size";
  return "";
}
