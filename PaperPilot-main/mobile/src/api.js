import Constants from "expo-constants";
import { auth } from "./firebase";

const API = Constants.expoConfig?.extra?.apiUrl || "http://127.0.0.1:8000";

function message(data, fallback) {
  if (typeof data?.detail === "string") return data.detail;
  if (data?.detail?.message) return data.detail.message;
  return fallback;
}

async function request(path, options = {}) {
  if (!auth.currentUser) throw new Error("Sign in to use the compliance checker.");
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(message(data, "Request failed."));
    error.status = response.status;
    error.code = data?.detail?.code;
    throw error;
  }
  return data;
}

export function listMechanics() {
  return request("/mechanics");
}

export function listManuscripts() {
  return request("/manuscripts");
}

export function getSubscription() {
  return request("/subscription");
}

export function uploadMechanics({ uri, name, mimeType, displayName = "" }) {
  const body = new FormData();
  body.append("file", { uri, name, type: mimeType || "application/octet-stream" });
  if (displayName) body.append("name", displayName);
  return request("/mechanics", { method: "POST", body });
}

export function renameMechanics(mechanicsId, name) {
  return request(`/mechanics/${encodeURIComponent(mechanicsId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim() }),
  });
}

export function deleteMechanics(mechanicsId) {
  return request(`/mechanics/${encodeURIComponent(mechanicsId)}`, {
    method: "DELETE",
  });
}

export function uploadManuscriptVersion({ file, title, mechanicsId, manuscriptId }) {
  const body = new FormData();
  body.append("file", file);
  body.append("title", title);
  body.append("mechanics_id", mechanicsId);
  if (manuscriptId) body.append("manuscript_id", manuscriptId);
  return request("/manuscripts/versions", { method: "POST", body });
}

export function runComplianceScan({ manuscriptId, versionId, mechanicsId }) {
  return request(`/manuscripts/${manuscriptId}/versions/${versionId}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mechanics_id: mechanicsId }),
  });
}

export function listManuscriptVersions(manuscriptId, includeHistory = true) {
  return request(`/manuscripts/${manuscriptId}/versions?include_history=${includeHistory}`);
}
