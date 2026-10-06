/**
 * Upload limits shared by every document picker and the Cloudinary upload.
 */

import { File } from "expo-file-system";

/** Cloudinary rejects raw uploads above 10 MB (10,485,760 bytes) on the current plan. */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** The API can only validate and parse these formats. */
export const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];
export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

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
 * @returns {Promise<"type"|"size"|"">}
 */
export async function getFileRejection(file) {
  if (!file) return "";
  const ext = fileExtension(file);
  if (!ACCEPTED_EXTENSIONS.includes(ext)) return "type";
  const mime = String(file.mimeType || "").toLowerCase();
  if (mime && mime !== "application/octet-stream" && !ACCEPTED_MIME_TYPES.includes(mime)) {
    return "type";
  }
  if (!hasExpectedSignature(file, ext)) return "type";
  if (Number(file.size) > MAX_FILE_SIZE_BYTES) return "size";
  return "";
}
