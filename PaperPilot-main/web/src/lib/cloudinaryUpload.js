/**
 * Universal Cloudinary uploader: simple POST for small files, chunked for large.
 * Uses unsigned upload preset (no API secret in the browser).
 */

const CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "";
const PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || "uploaded_docs";

/** Files at or below this size use a single request. */
export const SIMPLE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
/** Chunk size for large uploads (Cloudinary recommends ≥5MB chunks). */
export const CHUNK_SIZE_BYTES = 5 * 1024 * 1024;
/** Soft client-side ceiling (Cloudinary free tier often allows ~100MB raw). */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

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

async function uploadSimple(file, resourceType) {
  const body = new FormData();
  body.append("file", file);
  body.append("upload_preset", PRESET);
  body.append("filename_override", file.name);
  const res = await fetch(uploadEndpoint(resourceType), { method: "POST", body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error?.message || `Cloudinary upload failed (${res.status}).`);
  }
  return normalizeResult(json, file.name);
}

async function uploadChunked(file, resourceType) {
  const endpoint = uploadEndpoint(resourceType);
  const uploadId = uniqueUploadId();
  let lastJson = null;

  for (let start = 0; start < file.size; start += CHUNK_SIZE_BYTES) {
    const end = Math.min(start + CHUNK_SIZE_BYTES, file.size);
    const chunk = file.slice(start, end);
    const body = new FormData();
    body.append("file", chunk);
    body.append("upload_preset", PRESET);
    body.append("filename_override", file.name);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-Unique-Upload-Id": uploadId,
        "Content-Range": `bytes ${start}-${end - 1}/${file.size}`,
      },
      body,
    });
    lastJson = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        lastJson.error?.message || `Cloudinary chunked upload failed (${res.status}).`
      );
    }
  }

  return normalizeResult(lastJson || {}, file.name);
}

/**
 * Upload a PDF/DOCX (or any file) to Cloudinary.
 * @param {File|Blob} file
 * @param {{ resourceType?: "raw"|"auto"|"image" }} [options]
 */
export async function uploadToCloudinary(file, options = {}) {
  if (!file) throw new Error("No file to upload.");
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`File must be ${Math.floor(MAX_FILE_BYTES / 1e6)} MB or smaller.`);
  }
  const resourceType = options.resourceType || "raw";
  if (file.size <= SIMPLE_UPLOAD_MAX_BYTES) {
    return uploadSimple(file, resourceType);
  }
  return uploadChunked(file, resourceType);
}
