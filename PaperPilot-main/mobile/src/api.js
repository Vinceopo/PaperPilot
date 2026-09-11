import Constants from "expo-constants";
import { auth } from "./firebase";

const API = Constants.expoConfig?.extra?.apiUrl || "http://127.0.0.1:8000";

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.code = detail && typeof detail === "object" ? detail.code : undefined;
  }
}

function detailMessage(data, fallback) {
  const detail = data?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail.message === "string") return detail.message;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  return fallback || "Request failed.";
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
  if (!res.ok) throw new ApiError(detailMessage(data, res.statusText || "Request failed."), res.status, data.detail);
  return data;
}

async function postJson(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return responseData(res);
}

async function authorizedFetch(path, options = {}) {
  const user = auth?.currentUser;
  if (!user) throw new ApiError("Sign in to use the compliance checker.", 401);
  const token = await user.getIdToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };
  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${API}${path}`, { ...options, headers });
  return responseData(res);
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

function cleanFilename(name = "upload.bin", mimeType = "") {
  let cleaned = String(name);
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    // keep raw
  }
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

/** DocumentPicker URIs work with RN FormData {uri,name,type} + XHR (not fetch). */
function authorizedMultipartUpload(path, fileUri, { fieldName = "file", mimeType, filename, parameters = {} } = {}) {
  return (async () => {
    const user = auth?.currentUser;
    if (!user) throw new ApiError("Sign in to use the compliance checker.", 401);
    if (!fileUri) throw new ApiError("Missing file. Pick the document again, then upload.", 400);
    const token = await user.getIdToken();
    const safeName = cleanFilename(filename || "upload.pdf", mimeType);
    const safeMime = mimeType || guessMime(safeName);

    const form = new FormData();
    form.append(fieldName, { uri: fileUri, name: safeName, type: safeMime });
    Object.entries(parameters).forEach(([key, value]) => {
      if (value == null || value === "") return;
      form.append(key, String(value));
    });

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API}${path}`);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.timeout = 120000;
      xhr.onload = () => {
        const data = parseBody(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
          return;
        }
        reject(new ApiError(detailMessage(data, `Upload failed (${xhr.status}).`), xhr.status, data.detail));
      };
      xhr.onerror = () => {
        reject(
          new ApiError(
            "Upload failed. Keep the API proxy running (port 8001) and stay on the same Wi‑Fi.",
            0
          )
        );
      };
      xhr.ontimeout = () => reject(new ApiError("Upload timed out. Try a smaller file.", 0));
      xhr.send(form);
    });
  })();
}

export async function sendOtp({ email, purpose }) {
  return postJson("/auth/otp/send", { email, purpose });
}

export async function verifyOtp({ email, purpose, code }) {
  return postJson("/auth/otp/verify", { email, purpose, code });
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

export function listMechanics() {
  return authorizedFetch("/mechanics");
}

export function uploadMechanics({ uri, name, mimeType, displayName = "" }) {
  const filename = cleanFilename(name || "mechanics.pdf", mimeType);
  const parameters = {};
  if (displayName.trim()) parameters.name = displayName.trim();
  return authorizedMultipartUpload("/mechanics", uri, {
    fieldName: "file",
    mimeType: guessMime(filename, mimeType),
    filename,
    parameters,
  });
}

export function renameMechanics(mechanicsId, name) {
  return authorizedFetch(`/mechanics/${encodeURIComponent(mechanicsId)}`, {
    method: "PATCH",
    body: JSON.stringify({ name: name.trim() }),
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

export function uploadManuscriptVersion({ file, mechanicsId, title, manuscriptId }) {
  const uri = typeof file === "string" ? file : file?.uri;
  const rawMime = typeof file === "object" ? file?.type || file?.mimeType : undefined;
  const name = cleanFilename(
    (typeof file === "object" ? file?.name : undefined) || "manuscript.pdf",
    rawMime
  );
  const mimeType = guessMime(name, rawMime);
  const trimmedTitle = String(title || "").trim();
  if (!trimmedTitle) return Promise.reject(new ApiError("A manuscript title is required.", 400));
  if (!mechanicsId) {
    return Promise.reject(new ApiError("Select a format mechanics document first.", 400));
  }
  const parameters = {
    mechanics_id: String(mechanicsId),
    title: trimmedTitle.slice(0, 300),
  };
  if (manuscriptId) parameters.manuscript_id = String(manuscriptId);
  return authorizedMultipartUpload("/manuscripts/versions", uri, {
    fieldName: "file",
    mimeType,
    filename: name,
    parameters,
  });
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

export function getComplianceScan(scanId) {
  return authorizedFetch(`/scans/${encodeURIComponent(scanId)}`);
}

export function getSubscription() {
  return authorizedFetch("/subscription");
}

export function itemsFrom(data, key) {
  if (Array.isArray(data)) return data;
  return data?.[key] || data?.items || [];
}
