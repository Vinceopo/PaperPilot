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

function networkError(err) {
  const msg = String(err?.message || "");
  if (err?.name === "TypeError" || /failed to fetch|networkerror|load failed/i.test(msg)) {
    return new ApiError(
      "Cannot reach the PaperPilot server. Start the API on port 8000 and try again.",
      0
    );
  }
  return err;
}

export class ApiError extends Error {
  constructor(message, status, detail, retryAfter = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.code = detail && typeof detail === "object" ? detail.code : undefined;
    this.retryAfter = Number(retryAfter) || 0;
  }
}

async function responseData(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fallback =
      res.status === 502 || res.status === 503 || res.statusText === "Internal Server Error"
        ? "Cannot reach the PaperPilot server. Make sure the API is running on port 8000."
        : res.statusText || "Request failed.";
    const retryHeader = res.headers.get("Retry-After");
    const retryAfter =
      (data?.detail && typeof data.detail === "object" && data.detail.retry_after) ||
      retryHeader ||
      0;
    throw new ApiError(detailMessage(data, fallback), res.status, data.detail, retryAfter);
  }
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
  const token = await user.getIdToken();
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  try {
    const res = await fetch(`${API}${path}`, { ...options, headers });
    if (res.status === 401 && auth?.currentUser) {
      try {
        await auth.signOut();
      } catch {
        // Session already gone.
      }
    }
    return await responseData(res);
  } catch (err) {
    throw networkError(err);
  }
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

/** Resolve a username or email to an email address for login. */
export async function resolveEmail(identifier) {
  return postJson("/auth/resolve-email", { identifier });
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

export function extractMechanics(file) {
  const body = new FormData();
  body.append("file", file);
  return authorizedFetch("/mechanics/extract", { method: "POST", body });
}

export function saveMechanicsProfile({
  name,
  rules,
  sourceFilename,
  fileType,
  extractedText,
}) {
  return authorizedFetch("/mechanics/save", {
    method: "POST",
    body: JSON.stringify({
      name: name.trim(),
      rules: rules || {},
      source_filename: sourceFilename || undefined,
      file_type: fileType || undefined,
      extracted_text: extractedText || undefined,
    }),
  });
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

export function previewManuscript(file) {
  const body = new FormData();
  body.append("file", file);
  return authorizedFetch("/manuscripts/preview", { method: "POST", body });
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

export function subscribeToPlan({ plan, billingPeriod, paymentMethod }) {
  return authorizedFetch("/subscription/subscribe", {
    method: "POST",
    body: JSON.stringify({
      plan,
      billing_period: billingPeriod || undefined,
      payment_method: paymentMethod || undefined,
    }),
  });
}

export function cancelSubscription({ immediate = true } = {}) {
  return authorizedFetch("/subscription/cancel", {
    method: "POST",
    body: JSON.stringify({ immediate }),
  });
}

export function getSubscriptionHistory() {
  return authorizedFetch("/subscription/history");
}

// ── Profile ──────────────────────────────────────────────────────────────────

export function getProfile() {
  return authorizedFetch("/profile");
}

/**
 * @param {{ firstName?, middleName?, lastName?, contactNumber?, photoUrl?, removePhoto? }} data
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

export function deactivateAccount() {
  return authorizedFetch("/account/deactivate", { method: "POST", body: JSON.stringify({}) });
}
