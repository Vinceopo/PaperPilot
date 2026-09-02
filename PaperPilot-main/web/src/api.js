import { auth } from "./firebase.js";

const API = import.meta.env.DEV
  ? ""
  : import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function detailMessage(err, fallback) {
  const detail = err?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail.message === "string") return detail.message;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  return fallback;
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
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API}${path}`, { ...options, headers });
  return responseData(res);
}

export async function analyzeManuscript({ title, abstract, text }) {
  return postJson("/analyze", { title, abstract, text });
}

export async function extractPdf(file) {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${API}/extract-pdf`, { method: "POST", body });
  return responseData(res);
}

export async function sendOtp({ email, purpose }) {
  return postJson("/auth/otp/send", { email, purpose });
}

export async function verifyOtp({ email, purpose, code }) {
  return postJson("/auth/otp/verify", { email, purpose, code });
}

/** Checks email/username availability before an OTP is sent. */
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

export function uploadMechanics(file, name = "") {
  const body = new FormData();
  body.append("file", file);
  if (name.trim()) body.append("name", name.trim());
  return authorizedFetch("/mechanics", { method: "POST", body });
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
  const body = new FormData();
  body.append("file", file);
  body.append("mechanics_id", mechanicsId);
  body.append("title", title.trim());
  if (manuscriptId) body.append("manuscript_id", manuscriptId);
  return authorizedFetch("/manuscripts/versions", { method: "POST", body });
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
