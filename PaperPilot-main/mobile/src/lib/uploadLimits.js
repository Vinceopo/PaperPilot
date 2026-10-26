/**
 * Upload limits shared by every document picker and the S3 upload path.
 * Limits match subscription plans (Free 15 MB · Premium 45 MB · Pro 120 MB).
 */

import { File } from "expo-file-system";
import { normalizeTier } from "./plans";

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

/** Manuscripts for analysis: DOCX only. */
export const MANUSCRIPT_ACCEPTED_EXTENSIONS = [".docx"];
export const MANUSCRIPT_ACCEPTED_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

/** @deprecated Prefer MECHANICS_* or MANUSCRIPT_*. */
export const ACCEPTED_EXTENSIONS = MECHANICS_ACCEPTED_EXTENSIONS;
export const ACCEPTED_MIME_TYPES = MECHANICS_ACCEPTED_MIME_TYPES;

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04" (DOCX container)

export function fileExtension(file) {
  const name = String(file?.name || "");
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function startsWith(bytes, signature) {
  return signature.every((byte, index) => bytes[index] === byte);
}

function readHead(uri, length) {
  const handle = new File(uri).open();
  try {
    return handle.readBytes(length);
  } finally {
    handle.close();
  }
}

function hasExpectedSignature(file, ext) {
  let head;
  try {
    head = readHead(file.uri, 1024);
  } catch {
    // Unreadable here (e.g. provider URI) — the API validates the contents again.
    return true;
  }
  if (ext === ".pdf") {
    let start = 0;
    while (start < head.length && head[start] <= 0x20) start += 1;
    return startsWith(head.subarray(start), PDF_SIGNATURE);
  }
  return startsWith(head, ZIP_SIGNATURE);
}

/**
 * Checks the extension, the reported type, and the file's actual contents,
 * since renamed files bypass the picker's type filter.
 * @param {{ uri: string, name: string, mimeType?: string, size?: number }} file
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
  const mime = String(file.mimeType || "").toLowerCase();
  if (mime && mime !== "application/octet-stream" && !allowedMime.includes(mime)) {
    return "type";
  }
  if (!hasExpectedSignature(file, ext)) return "type";
  const limit = Number(maxBytes) > 0 ? Number(maxBytes) : MAX_FILE_SIZE_BYTES;
  if (Number(file.size) > limit) return "size";
  return "";
}
