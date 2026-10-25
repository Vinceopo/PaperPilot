import Constants from "expo-constants";
import { auth } from "./firebase";

const extra = Constants.expoConfig?.extra || {};
const API = resolveApiUrl(extra.apiUrl || "http://127.0.0.1:8000");
const CLOUDINARY_CLOUD = extra.cloudinaryCloudName || "";
const CLOUDINARY_PRESET = extra.cloudinaryUploadPreset || "uploaded_docs";

/**
 * A LAN apiUrl goes stale whenever the router hands the dev PC a new IP.
 * In development, swap its host for the one Expo is currently served from.
 */
function resolveApiUrl(configured) {
  const devHost = String(Constants.expoConfig?.hostUri || "").split(":")[0];
  const match = String(configured).match(/^(https?:\/\/)([^/:]+)(.*)$/);
  if (!devHost || !match) return configured;
  const isLan = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
  if (!isLan.test(match[2]) || !isLan.test(devHost)) return configured;
  return `${match[1]}${devHost}${match[3]}`;
}

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.code = detail && typeof detail === "object" ? detail.code : undefined;
  }
}

function detailMessage(data, fallback, status) {
  const detail = data?.detail;
  const raw =
    typeof detail === "string"
      ? detail
      : detail && typeof detail.message === "string"
        ? detail.message
        : Array.isArray(detail) && detail[0]?.msg
          ? detail[0].msg
          : "";
  if (status === 401 || /firebase id token is invalid|invalid or expired/i.test(raw)) {
    return "Your session is out of date. Sign out and sign in again with the same account you use on the web.";
  }
  if (raw) return raw;
  return fallback || statusMessage(status || 0);
}

function statusMessage(status) {
  if (status === 401) return "Your session has expired. Sign in again, then retry.";
  if (status === 403) return "Your account can't do this yet. Check your plan on the Subscription page.";
  if (status === 404) {
    return "That item was not found. It may have been deleted on another device — refresh and try again.";
  }
  if (status === 413) return "This file is too large to upload. Use a file under 10 MB.";
  if (status === 429) return "Too many requests in a short time. Wait a minute, then try again.";
  if (status === 502 || status === 503 || status === 504) {
    return "PaperPilot's server is starting up or busy. Wait a few seconds, then try again.";
  }
  if (status) return "PaperPilot's server could not finish the request. Try again in a moment.";
  return "Could not reach PaperPilot. Check your internet connection, then try again.";
}

/** True when the API rejected the Firebase ID token (expired, revoked, or wrong project). */
export function isInvalidAuthTokenError(err) {
  const msg = String(err?.message || err?.detail || "");
  return (
    err?.status === 401 ||
    /firebase id token is invalid|invalid or expired|session has expired|sign in again/i.test(msg)
  );
}

/** fetch() rejects with a bare TypeError ("Network request failed") when the connection drops. */
function networkError(err) {
  if (err instanceof ApiError) return err;
  const msg = String(err?.message || "");
  if (err?.name === "TypeError" || /network request failed|failed to fetch|timed? ?out/i.test(msg)) {
    return new ApiError(statusMessage(0), 0);
  }
  return err;
}

function newRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Network drops and cold starts are worth retrying; validation errors are not. */
function isTransientError(err) {
  return err?.status === 0 || err?.status === 502 || err?.status === 503 || err?.status === 504;
}

async function withRetry(send, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await send();
    } catch (err) {
      lastError = err;
      if (!isTransientError(err) || i === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (i + 1)));
    }
  }
  throw lastError;
}

function parseBody(body) {
  if (body == null || body === "") return {};
  if (typeof body === "object") return body;
  try {
    return JSON.parse(String(body));
  } catch {
    return { detail: String(body) };
  }
}

async function responseData(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(detailMessage(data, statusMessage(res.status), res.status), res.status, data.detail);
  return data;
}

async function postJson(path, body) {
  try {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await responseData(res);
  } catch (err) {
    throw networkError(err);
  }
}

async function authorizedFetch(path, options = {}) {
  const user = auth?.currentUser;
  if (!user) throw new ApiError("Sign in to use the compliance checker.", 401);
  const send = async (forceRefresh) => {
    const token = await user.getIdToken(forceRefresh);
    const headers = {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    };
    if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    return fetch(`${API}${path}`, { ...options, headers });
  };
  try {
    let res = await send(false);
    // Retry once with a fresh token. Never sign out on API 401 — only the
    // caller / auth listener should clear the session for fatal Firebase errors.
    if (res.status === 401) {
      try {
        res = await send(true);
      } catch (err) {
        const code = String(err?.code || "");
        const fatal =
          code === "auth/user-token-expired" ||
          code === "auth/invalid-user-token" ||
          code === "auth/id-token-revoked" ||
          code === "auth/user-disabled" ||
          code === "auth/user-not-found";
        if (!fatal) throw networkError(err);
        throw err;
      }
    }
    return await responseData(res);
  } catch (err) {
    throw networkError(err);
  }
}

function guessMime(name = "", mimeType = "") {
  if (mimeType && mimeType !== "application/octet-stream") return mimeType;
  const lower = String(name).toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return mimeType || "application/octet-stream";
}

export function decodeFilename(name = "") {
  try {
    return decodeURIComponent(String(name));
  } catch {
    return String(name);
  }
}

/** Human-readable name the API uses as the default profile/manuscript name. */
function displayFilename(name, mimeType, fallback) {
  const decoded = decodeFilename(name || fallback).replace(/[/\\?*:|"<>]/g, "_").trim();
  if (/\.(pdf|docx)$/i.test(decoded)) return decoded;
  return cleanFilename(decoded || fallback, mimeType);
}

function cleanFilename(name = "upload.bin", mimeType = "") {
  let cleaned = decodeFilename(name);
  cleaned = cleaned.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, "_").trim();
  if (!cleaned) cleaned = "upload.bin";
  const lower = cleaned.toLowerCase();
  if (!lower.endsWith(".pdf") && !lower.endsWith(".docx")) {
    const mime = String(mimeType || "").toLowerCase();
    if (mime.includes("word") || mime.includes("docx") || mime.includes("officedocument")) {
      cleaned = `${cleaned}.docx`;
    } else {
      cleaned = `${cleaned}.pdf`;
    }
  }
  return cleaned;
}

/**
 * Upload a picked document to Cloudinary (unsigned preset), mirroring the web client.
 * The API only accepts `cloudinary_url` references, never raw file bodies.
 * DocumentPicker URIs work with RN FormData {uri,name,type} + XHR (not fetch).
 */
function uploadToCloudinary({ uri, name, mimeType }) {
  if (!CLOUDINARY_CLOUD) {
    return Promise.reject(
      new ApiError(
        "File uploads are not set up in this build of the app. Update the app or contact support.",
        0
      )
    );
  }
  if (!uri) {
    return Promise.reject(new ApiError("Missing file. Pick the document again, then upload.", 400));
  }
  const safeName = cleanFilename(name || "upload.pdf", mimeType);
  const form = new FormData();
  form.append("file", { uri, name: safeName, type: guessMime(safeName, mimeType) });
  form.append("upload_preset", CLOUDINARY_PRESET);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/raw/upload`);
    xhr.timeout = 180000;
    xhr.onload = () => {
      const data = parseBody(xhr.responseText);
      const url = data.secure_url || data.url;
      if (xhr.status >= 200 && xhr.status < 300 && url) {
        resolve({ url, originalFilename: data.original_filename || safeName });
        return;
      }
      reject(
        new ApiError(
          data.error?.message ||
            "The file could not be uploaded. Check that it is a PDF or DOCX under 10 MB, then try again.",
          xhr.status
        )
      );
    };
    xhr.onerror = () =>
      reject(new ApiError("Upload failed. Check your internet connection and try again.", 0));
    xhr.ontimeout = () =>
      reject(
        new ApiError(
          "The upload took too long. Check your connection or try a smaller file, then upload again.",
          0
        )
      );
    xhr.send(form);
  });
}

async function postCloudinaryDocument(path, file, fallbackName, fields = {}) {
  const uploaded = await uploadToCloudinary(file);
  return authorizedFetch(path, {
    method: "POST",
    body: JSON.stringify({
      cloudinary_url: uploaded.url,
      filename: displayFilename(file.name, file.mimeType, fallbackName),
      ...fields,
    }),
  });
}

export async function sendOtp({ email, purpose }) {
  return postJson("/auth/otp/send", { email, purpose });
}

export async function verifyOtp({ email, purpose, code }) {
  return postJson("/auth/otp/verify", { email, purpose, code });
}

/** When OTP_ENABLED=false, /auth/otp/send returns a challenge token immediately. */
export function otpBypassToken(res, purpose) {
  if (!res?.otp_bypassed) return null;
  return purpose === "verify_email" ? res.signup_token : res.reset_token;
}

export async function resolveEmail(identifier) {
  return postJson("/auth/resolve-email", { identifier });
}

export async function registerCheck({ email, username }) {
  return postJson("/auth/register/check", { email, username });
}

export async function completeRegister({
  signupToken,
  firstName,
  middleName,
  lastName,
  username,
  email,
  password,
}) {
  return postJson("/auth/register", {
    signup_token: signupToken,
    first_name: firstName,
    middle_name: middleName || "",
    last_name: lastName,
    username,
    email,
    password,
  });
}

export async function resetPasswordWithOtp({ email, resetToken, newPassword }) {
  return postJson("/auth/reset-password", {
    email,
    reset_token: resetToken,
    new_password: newPassword,
  });
}

export function sampleMechanicsUrl() {
  return `${API}/mechanics/sample`;
}

export function listMechanics() {
  return authorizedFetch("/mechanics");
}

export function extractMechanics({ uri, name, mimeType }) {
  return postCloudinaryDocument("/mechanics/extract", { uri, name, mimeType }, "mechanics.pdf");
}

export function saveMechanicsProfile({
  name,
  rules,
  sourceFilename,
  fileType,
  extractedText,
  ignoredFields,
}) {
  return authorizedFetch("/mechanics/save", {
    method: "POST",
    body: JSON.stringify({
      name: String(name || "").trim(),
      rules: rules || {},
      source_filename: sourceFilename || undefined,
      file_type: fileType || undefined,
      extracted_text: extractedText || undefined,
      ignored_fields: Array.isArray(ignoredFields) ? ignoredFields : undefined,
    }),
  });
}

export function uploadMechanics({ uri, name, mimeType, displayName = "" }) {
  return postCloudinaryDocument("/mechanics", { uri, name, mimeType }, "mechanics.pdf", {
    name: displayName.trim() || undefined,
  });
}

export function renameMechanics(mechanicsId, name) {
  return authorizedFetch(`/mechanics/${encodeURIComponent(mechanicsId)}`, {
    method: "PATCH",
    body: JSON.stringify({ name: name.trim() }),
  });
}

export function updateMechanicsProfile(mechanicsId, { name, rules, ignoredFields }) {
  const body = {};
  if (name != null) body.name = String(name).trim();
  if (rules != null) body.rules = rules;
  if (Array.isArray(ignoredFields)) body.ignored_fields = ignoredFields;
  return authorizedFetch(`/mechanics/${encodeURIComponent(mechanicsId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteMechanics(mechanicsId) {
  return authorizedFetch(`/mechanics/${encodeURIComponent(mechanicsId)}`, {
    method: "DELETE",
  });
}

export function listManuscripts() {
  return authorizedFetch("/manuscripts");
}

export function deleteManuscript({ manuscriptId, title } = {}) {
  const params = new URLSearchParams();
  if (title) params.set("title", title);
  const id = manuscriptId || "-";
  const query = params.toString();
  return authorizedFetch(
    `/manuscripts/${encodeURIComponent(id)}${query ? `?${query}` : ""}`,
    { method: "DELETE" }
  );
}

export function deleteManuscriptVersion({ manuscriptId, versionId } = {}) {
  return authorizedFetch(
    `/manuscripts/${encodeURIComponent(manuscriptId)}/versions/${encodeURIComponent(versionId)}`,
    { method: "DELETE" }
  );
}

export function previewManuscript({ uri, name, mimeType }) {
  return postCloudinaryDocument("/manuscripts/preview", { uri, name, mimeType }, "manuscript.pdf");
}

export async function uploadManuscriptVersion({ file, mechanicsId, title, manuscriptId }) {
  const uri = typeof file === "string" ? file : file?.uri;
  const mimeType = typeof file === "object" ? file?.type || file?.mimeType : undefined;
  const name = typeof file === "object" ? file?.name : undefined;
  const trimmedTitle = String(title || "").trim();
  if (!trimmedTitle) throw new ApiError("A manuscript title is required.", 400);
  if (!mechanicsId) throw new ApiError("Select a format mechanics document first.", 400);

  const uploaded = await uploadToCloudinary({ uri, name, mimeType });
  // Same id on every retry, so a save whose reply was lost is not stored twice.
  const clientRequestId = newRequestId();
  const created = await withRetry(() =>
    authorizedFetch("/manuscripts/versions", {
      method: "POST",
      body: JSON.stringify({
        cloudinary_url: uploaded.url,
        filename: displayFilename(name, mimeType, "manuscript.pdf"),
        mechanics_id: String(mechanicsId),
        title: trimmedTitle.slice(0, 300),
        manuscript_id: manuscriptId ? String(manuscriptId) : undefined,
        client_request_id: clientRequestId,
      }),
    })
  );
  if (created?.version && !created.version.cloudinary_url) {
    created.version.cloudinary_url = uploaded.url;
  }
  return created;
}

export function listManuscriptVersions(manuscriptId, includeHistory = true) {
  const query = new URLSearchParams({ include_history: String(includeHistory) });
  return authorizedFetch(`/manuscripts/${encodeURIComponent(manuscriptId)}/versions?${query}`);
}

export function getManuscriptVersion(manuscriptId, versionId) {
  return authorizedFetch(
    `/manuscripts/${encodeURIComponent(manuscriptId)}/versions/${encodeURIComponent(versionId)}`
  );
}

export function runComplianceScan({ manuscriptId, versionId, mechanicsId }) {
  return authorizedFetch(
    `/manuscripts/${encodeURIComponent(manuscriptId)}/versions/${encodeURIComponent(versionId)}/scan`,
    { method: "POST", body: JSON.stringify({ mechanics_id: mechanicsId }) }
  );
}

export function listScans() {
  return authorizedFetch("/scans");
}

export function getComplianceScan(scanId) {
  return authorizedFetch(`/scans/${encodeURIComponent(scanId)}`);
}

export function getScanProgress(scanId) {
  return authorizedFetch(`/scans/${encodeURIComponent(scanId)}/progress`);
}

export function getScanDocument(scanId) {
  return authorizedFetch(`/scans/${encodeURIComponent(scanId)}/document`);
}

export function getSubscription() {
  return authorizedFetch("/subscription");
}

/** Create PayMongo Hosted Checkout for Premium or Pro (never send card data to our API). */
export function subscribeToPlan({ plan = "premium", billingPeriod = "monthly" } = {}) {
  return authorizedFetch("/subscription/subscribe", {
    method: "POST",
    body: JSON.stringify({
      plan,
      billing_period: billingPeriod,
      return_to: plan === "free" ? undefined : "app",
    }),
  });
}

export function createSubscriptionCheckout({ plan = "premium", billingPeriod = "monthly" } = {}) {
  return authorizedFetch("/subscription/create-checkout", {
    method: "POST",
    body: JSON.stringify({
      plan,
      billing_period: billingPeriod,
    }),
  });
}

export function cancelSubscription({ immediate = true } = {}) {
  return authorizedFetch("/subscription/cancel", {
    method: "POST",
    body: JSON.stringify({ immediate }),
  });
}

/** After PayMongo checkout — verify the paid session and activate Premium. */
export function confirmCheckoutPayment({ checkoutSessionId } = {}) {
  return authorizedFetch("/subscription/confirm", {
    method: "POST",
    body: JSON.stringify({
      checkout_session_id: checkoutSessionId || undefined,
    }),
  });
}

export function getProfile() {
  return authorizedFetch("/profile");
}

/**
 * @param {{ firstName?, middleName?, lastName?, username?, contactNumber?, photoUrl?, removePhoto? }} data
 */
export function updateUserProfile(data) {
  return authorizedFetch("/profile", {
    method: "PATCH",
    body: JSON.stringify({
      first_name: data.firstName ?? undefined,
      middle_name: data.middleName ?? undefined,
      last_name: data.lastName ?? undefined,
      username: data.username ?? undefined,
      contact_number: data.contactNumber ?? undefined,
      photo_url: data.photoUrl ?? undefined,
      remove_photo: data.removePhoto ?? false,
    }),
  });
}

export function itemsFrom(data, key) {
  if (Array.isArray(data)) return data;
  return data?.[key] || data?.items || [];
}
