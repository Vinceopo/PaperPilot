/**
 * Upload limits shared by every document picker and the Cloudinary upload.
 */

/** Cloudinary rejects raw uploads above 10 MB (10,485,760 bytes) on the current plan. */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** The API can only validate and parse these formats. */
export const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];
export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
export const ACCEPT_ATTRIBUTE = [...ACCEPTED_EXTENSIONS, ...ACCEPTED_MIME_TYPES].join(",");

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
 * @returns {Promise<"type"|"size"|"">}
 */
export async function getFileRejection(file) {
  if (!file) return "";
  const ext = fileExtension(file);
  if (!ACCEPTED_EXTENSIONS.includes(ext)) return "type";
  const mime = String(file.type || "").toLowerCase();
  if (mime && mime !== "application/octet-stream" && !ACCEPTED_MIME_TYPES.includes(mime)) {
    return "type";
  }
  if (!(await hasExpectedSignature(file, ext))) return "type";
  if (file.size > MAX_FILE_SIZE_BYTES) return "size";
  return "";
}
