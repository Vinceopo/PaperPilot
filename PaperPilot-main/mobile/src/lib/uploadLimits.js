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

/**
 * Manuscripts for analysis: PDF only (fixed pages + bboxes for precise Issue Tracing).
 */
export const MANUSCRIPT_ACCEPTED_EXTENSIONS = [".pdf"];
export const MANUSCRIPT_ACCEPTED_MIME_TYPES = ["application/pdf"];

/** Android providers often use these instead of application/pdf. */
const PDF_MIME_ALIASES = new Set([
  "application/pdf",
  "application/x-pdf",
  "application/acrobat",
  "application/vnd.pdf",
  "text/pdf",
  "text/x-pdf",
]);

const DOCX_MIME_ALIASES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/docx",
]);

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

function sniffKindFromBytes(head) {
  if (!head || !head.length) return "";
  let start = 0;
  while (start < head.length && head[start] <= 0x20) start += 1;
  if (startsWith(head.subarray(start), PDF_SIGNATURE)) return "pdf";
  if (startsWith(head, ZIP_SIGNATURE)) return "docx";
  return "";
}

function hasExpectedSignature(file, ext) {
  let head;
  try {
    head = readHead(file.uri, 1024);
  } catch {
    // Unreadable here (e.g. provider URI) - the API validates the contents again.
    return true;
  }
  if (ext === ".pdf") {
    let start = 0;
    while (start < head.length && head[start] <= 0x20) start += 1;
    return startsWith(head.subarray(start), PDF_SIGNATURE);
  }
  if (ext === ".docx") return startsWith(head, ZIP_SIGNATURE);
  // Missing extension: accept when the bytes themselves look like the expected kind.
  const sniffed = sniffKindFromBytes(head);
  return sniffed === "pdf" || sniffed === "docx";
}

function mimeLooksAllowed(mime, kind) {
  const value = String(mime || "").toLowerCase().trim();
  if (!value || value === "application/octet-stream" || value === "*/*") return true;
  if (kind === "manuscript") return PDF_MIME_ALIASES.has(value);
  return PDF_MIME_ALIASES.has(value) || DOCX_MIME_ALIASES.has(value);
}

/**
 * Ensure a picked asset has a usable name/extension/size for Android providers that
 * omit them (common with Downloads / Google Drive).
 */
export async function normalizePickedFile(file, kind = "mechanics") {
  if (!file?.uri) return file;
  let name = String(file.name || "document").trim() || "document";
  let mimeType = String(file.mimeType || "").trim();
  let size = Number(file.size) || 0;
  let ext = fileExtension({ name });

  let head = null;
  try {
    head = readHead(file.uri, 1024);
  } catch {
    head = null;
  }
  const sniffed = sniffKindFromBytes(head);

  if (!ext) {
    if (kind === "manuscript" || sniffed === "pdf" || PDF_MIME_ALIASES.has(mimeType.toLowerCase())) {
      name = `${name}.pdf`;
      ext = ".pdf";
      if (!mimeType) mimeType = "application/pdf";
    } else if (sniffed === "docx" || DOCX_MIME_ALIASES.has(mimeType.toLowerCase())) {
      name = `${name}.docx`;
      ext = ".docx";
      if (!mimeType) {
        mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      }
    }
  }

  if (!size) {
    try {
      const bytes = Number(new File(file.uri).size) || 0;
      if (bytes > 0) size = bytes;
    } catch {
      // Keep size 0 — server still accepts when content_length is omitted.
    }
  }

  return { ...file, name, mimeType: mimeType || file.mimeType || "application/octet-stream", size };
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
  let ext = fileExtension(file);
  const mime = String(file.mimeType || "").toLowerCase();

  // Android sometimes strips the extension; recover from MIME or file signature.
  if (!ext) {
    let sniffed = "";
    try {
      sniffed = sniffKindFromBytes(readHead(file.uri, 1024));
    } catch {
      sniffed = "";
    }
    if (kind === "manuscript" && (sniffed === "pdf" || PDF_MIME_ALIASES.has(mime))) ext = ".pdf";
    else if (sniffed === "pdf" || PDF_MIME_ALIASES.has(mime)) ext = ".pdf";
    else if (sniffed === "docx" || DOCX_MIME_ALIASES.has(mime)) ext = ".docx";
  }

  if (!allowedExt.includes(ext)) return "type";
  if (!mimeLooksAllowed(mime, kind)) return "type";
  if (!hasExpectedSignature(file, ext || fileExtension(file))) return "type";
  const limit = Number(maxBytes) > 0 ? Number(maxBytes) : MAX_FILE_SIZE_BYTES;
  if (Number(file.size) > limit) return "size";
  return "";
}
