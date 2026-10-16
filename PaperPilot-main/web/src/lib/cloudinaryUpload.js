/**
 * Cloudinary upload_large for the browser.
 * Small files use one POST. Larger files are sent in 20MB chunks, matching
 * cloudinary.uploader.upload_large (X-Unique-Upload-Id + Content-Range).
 * Uses an unsigned upload preset — the API secret never goes to the browser.
 */

import { formatFileSize } from "./formatFileSize.js";
import { MAX_FILE_SIZE_BYTES } from "./uploadLimits.js";

const CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "";
const PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || "uploaded_docs";

/** upload_large default chunk size (bytes). Non-final chunks must be at least 5MB. */
export const CHUNK_SIZE_BYTES = 20_000_000;
/** At or below this size, one request is enough. */
export const SIMPLE_UPLOAD_MAX_BYTES = 5_000_000;

function uploadEndpoint(resourceType = "raw") {
  if (!CLOUD) {
    throw new Error(
      "Cloudinary is not configured. Set VITE_CLOUDINARY_CLOUD_NAME in web/.env."
    );
  }
  return `https://api.cloudinary.com/v1_1/${CLOUD}/${resourceType}/upload`;
}

function uniqueUploadId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now()}${Math.random().toString(16).slice(2)}`;
}

function normalizeResult(json, originalFilename) {
  const url = json.secure_url || json.url;
  if (!url) {
    throw new Error(json.error?.message || "Cloudinary upload returned no URL.");
  }
  return {
    url,
    publicId: json.public_id,
    bytes: Number(json.bytes) || 0,
    format: json.format || "",
    resourceType: json.resource_type || "raw",
    originalFilename: originalFilename || json.original_filename || "document",
  };
}

async function postChunk(endpoint, { file, chunk, start, uploadId, resourceName }) {
  const end = start + chunk.size;
  const body = new FormData();
  body.append(
    "file",
    new File([chunk], resourceName, { type: file.type || "application/octet-stream" })
  );
  body.append("upload_preset", PRESET);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "X-Unique-Upload-Id": uploadId,
      "Content-Range": `bytes ${start}-${end - 1}/${file.size}`,
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error?.message || `Cloudinary upload failed (${res.status}).`);
  }
  return json;
}

async function uploadSimple(file, resourceType) {
  const body = new FormData();
  body.append("file", file, file.name);
  body.append("upload_preset", PRESET);
  const res = await fetch(uploadEndpoint(resourceType), { method: "POST", body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error?.message || `Cloudinary upload failed (${res.status}).`);
  }
  return normalizeResult(json, file.name);
}

/**
 * Browser equivalent of cloudinary.uploader.upload_large.
 * Each part except the last is CHUNK_SIZE_BYTES. The same X-Unique-Upload-Id
 * ties the parts into one asset.
 */
async function uploadLarge(file, resourceType) {
  const endpoint = uploadEndpoint(resourceType);
  const uploadId = uniqueUploadId();
  const resourceName = file.name || "document";
  let lastJson = null;

  for (let start = 0; start < file.size; start += CHUNK_SIZE_BYTES) {
    const chunk = file.slice(start, Math.min(start + CHUNK_SIZE_BYTES, file.size));
    lastJson = await postChunk(endpoint, {
      file,
      chunk,
      start,
      uploadId,
      resourceName,
    });
  }

  if (lastJson?.done === false || !(lastJson?.secure_url || lastJson?.url)) {
    throw new Error("Cloudinary did not finish the chunked upload. Try the file again.");
  }
  return normalizeResult(lastJson, resourceName);
}

/**
 * Upload a PDF/DOCX (or any file) to Cloudinary.
 * @param {File|Blob} file
 * @param {{ resourceType?: "raw"|"auto"|"image" }} [options]
 */
export async function uploadToCloudinary(file, options = {}) {
  if (!file) throw new Error("No file to upload.");
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File must be ${formatFileSize(MAX_FILE_SIZE_BYTES)} or smaller.`);
  }
  const resourceType = options.resourceType || "raw";
  if (file.size <= SIMPLE_UPLOAD_MAX_BYTES) {
    return uploadSimple(file, resourceType);
  }
  return uploadLarge(file, resourceType);
}
