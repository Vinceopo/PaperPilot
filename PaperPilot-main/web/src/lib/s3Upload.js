/**
 * Upload documents to Amazon S3 via an API-issued presigned PUT URL.
 * AWS credentials never leave the API — clients only receive a short-lived upload URL.
 */

import { formatFileSize } from "./formatFileSize.js";
import { MAX_FILE_SIZE_BYTES, maxUploadBytesForPlan } from "./uploadLimits.js";
import { planName } from "./plans.js";

/**
 * Upload a PDF/DOCX (or any file) to S3.
 * @param {File|Blob} file
 * @param {{
 *   tier?: string,
 *   maxBytes?: number,
 *   presign: (body: {
 *     filename: string,
 *     content_type: string,
 *     content_length?: number,
 *   }) => Promise<{
 *     upload_url?: string,
 *     public_url?: string,
 *     headers?: Record<string, string>,
 *   }>,
 * }} options
 * @returns {Promise<{ url: string, originalFilename: string, bytes: number }>}
 */
export async function uploadToS3(file, options = {}) {
  if (!file) throw new Error("No file to upload.");
  // Prefer explicit max / plan; if neither is set, use the Pro ceiling so a
  // prior picker check is not re-applied as Free (15 MB). The API still
  // enforces the caller's plan via content_length on /uploads/presign.
  const maxBytes =
    Number(options.maxBytes) > 0
      ? Number(options.maxBytes)
      : options.tier != null && String(options.tier).trim() !== ""
        ? maxUploadBytesForPlan(options.tier)
        : MAX_FILE_SIZE_BYTES;
  if (file.size > maxBytes) {
    const label =
      options.tier != null && String(options.tier).trim() !== ""
        ? `${planName(options.tier)} plans can upload up to ${formatFileSize(maxBytes)}.`
        : `File must be ${formatFileSize(maxBytes)} or smaller.`;
    throw new Error(label);
  }
  if (typeof options.presign !== "function") {
    throw new Error("Upload is not configured.");
  }

  const filename = file.name || "document";
  const contentType = file.type || "application/octet-stream";
  const signed = await options.presign({
    filename,
    content_type: contentType,
    content_length: Number(file.size) || 0,
  });

  const uploadUrl = String(signed?.upload_url || "").trim();
  const publicUrl = String(signed?.public_url || "").trim();
  if (!uploadUrl || !publicUrl) {
    throw new Error("Upload could not be prepared. Try again.");
  }
  // Presigned PUT URLs are not navigable. Never open upload_url in a tab/iframe
  // or treat it as the document URL — that GETs a PUT signature and AWS returns
  // SignatureDoesNotMatch XML. Only public_url is safe for preview/download.
  if (/[?&]X-Amz-Signature=/i.test(publicUrl) || !/[?&]X-Amz-Signature=/i.test(uploadUrl)) {
    throw new Error("Upload could not be prepared. Try again.");
  }

  // Prefer API-provided Content-Type (matches what the server expects for the object).
  // Content-Type is not part of the URL signature, so mismatches no longer break PUT.
  const putHeaders = { ...(signed.headers || {}) };
  const hasContentType = Object.keys(putHeaders).some(
    (key) => key.toLowerCase() === "content-type"
  );
  if (!hasContentType) {
    putHeaders["Content-Type"] = contentType;
  }

  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: putHeaders,
    body: file,
  });
  if (!res.ok) {
    throw new Error(`File upload failed (${res.status}). Try again.`);
  }

  return {
    url: publicUrl,
    originalFilename: filename,
    bytes: Number(file.size) || 0,
  };
}

/** Thin alias so older call sites keep working during the S3 migration. */
export async function uploadToCloudinary(file, options = {}) {
  return uploadToS3(file, options);
}
