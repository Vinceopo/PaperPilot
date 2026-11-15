/**
 * Upload limits shared by every document picker and the S3 upload path.
 * Limits match subscription plans (Free 15 MB · Premium 45 MB · Pro 120 MB).
 */

import { File, FileMode } from "expo-file-system";
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
export const PDF_MIME_ALIASES = new Set([
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
  if (!bytes || typeof bytes.length !== "number") return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

/** Pure helper — exported for unit tests. */
export function sniffKindFromBytes(head) {
  if (!head || typeof head.length !== "number" || !head.length) return "";
  let start = 0;
  while (start < head.length && head[start] <= 0x20) start += 1;
  if (startsWith(typeof head.subarray === "function" ? head.subarray(start) : head, PDF_SIGNATURE)) {
    return "pdf";
  }
  if (startsWith(head, ZIP_SIGNATURE)) return "docx";
  return "";
}

/**
 * IMPORTANT: expo-file-system FileHandle.readBytes() is async and returns a Promise.
 * Calling .subarray on that Promise throws "undefined is not a function" on device.
 * Always use readBytesSync here.
 */
function readHeadSync(uri, length) {
  const handle = new File(uri).open(FileMode.ReadOnly);
  try {
    if (typeof handle.readBytesSync !== "function") {
      throw new Error("Sync file read unavailable");
    }
    const bytes = handle.readBytesSync(length);
    // Guard against a mistaken async handle leaking a Promise into callers.
    if (!bytes || typeof bytes.length !== "number" || typeof bytes.subarray !== "function") {
      throw new Error("File head was not a byte array");
    }
    return bytes;
  } finally {
    try {
      handle.close();
    } catch {
      // ignore close errors
    }
  }
}

function hasExpectedSignature(file, ext) {
  let head;
  try {
    head = readHeadSync(file.uri, 1024);
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
  const sniffed = sniffKindFromBytes(head);
  return sniffed === "pdf" || sniffed === "docx";
}

export function mimeLooksAllowed(mime, kind) {
  const value = String(mime || "").toLowerCase().trim();
  if (!value || value === "application/octet-stream" || value === "*/*") return true;
  if (kind === "manuscript") return PDF_MIME_ALIASES.has(value);
  return PDF_MIME_ALIASES.has(value) || DOCX_MIME_ALIASES.has(value);
}

/**
 * Ensure a picked asset has a usable name/extension/size for Android providers that
 * omit them (common with Downloads / Google Drive).
 * Manuscripts stay PDF-only.
 */
export async function normalizePickedFile(file, kind = "mechanics") {
  if (!file?.uri) return file;
  let name = String(file.name || "document").trim() || "document";
  let mimeType = String(file.mimeType || "").trim();
  let size = Number(file.size) || 0;
  let ext = fileExtension({ name });

  let head = null;
  try {
    head = readHeadSync(file.uri, 1024);
  } catch {
    head = null;
  }
  const sniffed = sniffKindFromBytes(head);

  if (!ext) {
    if (kind === "manuscript") {
      // Manuscripts are PDF-only — never invent a .docx name here.
      if (sniffed === "pdf" || PDF_MIME_ALIASES.has(mimeType.toLowerCase()) || !sniffed) {
        name = `${name.replace(/\.+$/, "")}.pdf`;
        ext = ".pdf";
        if (!mimeType) mimeType = "application/pdf";
      }
    } else if (sniffed === "pdf" || PDF_MIME_ALIASES.has(mimeType.toLowerCase())) {
      name = `${name.replace(/\.+$/, "")}.pdf`;
      ext = ".pdf";
      if (!mimeType) mimeType = "application/pdf";
    } else if (sniffed === "docx" || DOCX_MIME_ALIASES.has(mimeType.toLowerCase())) {
      name = `${name.replace(/\.+$/, "")}.docx`;
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

  return {
    ...file,
    name,
    mimeType: mimeType || file.mimeType || "application/octet-stream",
    size,
  };
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
      sniffed = sniffKindFromBytes(readHeadSync(file.uri, 1024));
    } catch {
      sniffed = "";
    }
    if (kind === "manuscript") {
      if (sniffed === "pdf" || PDF_MIME_ALIASES.has(mime)) ext = ".pdf";
      else if (sniffed === "docx") return "type"; // never accept DOCX as manuscript
    } else if (sniffed === "pdf" || PDF_MIME_ALIASES.has(mime)) {
      ext = ".pdf";
    } else if (sniffed === "docx" || DOCX_MIME_ALIASES.has(mime)) {
      ext = ".docx";
    }
  }

  if (kind === "manuscript" && ext === ".docx") return "type";
  if (!allowedExt.includes(ext)) return "type";
  if (!mimeLooksAllowed(mime, kind)) return "type";
  if (!hasExpectedSignature(file, ext || fileExtension(file))) return "type";
  const limit = Number(maxBytes) > 0 ? Number(maxBytes) : MAX_FILE_SIZE_BYTES;
  if (Number(file.size) > limit) return "size";
  return "";
}
