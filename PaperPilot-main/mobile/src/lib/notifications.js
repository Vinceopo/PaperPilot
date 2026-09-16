/**
 * Local notification store (per signed-in user).
 * React Native: AsyncStorage instead of localStorage.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

function storageKey(uid) {
  return uid ? `paperpilot.notifications.${uid}` : "paperpilot.notifications";
}

export async function loadNotifications(uid) {
  try {
    const raw = await AsyncStorage.getItem(storageKey(uid));
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveNotifications(items, uid) {
  try {
    await AsyncStorage.setItem(storageKey(uid), JSON.stringify(items || []));
  } catch {
    // Ignore quota failures.
  }
}

export function unreadCount(items) {
  return (items || []).filter((n) => !n.read).length;
}

export function markAllRead(items) {
  return (items || []).map((n) => ({ ...n, read: true }));
}

export function markOneRead(items, id) {
  return (items || []).map((n) => (n.id === id ? { ...n, read: true } : n));
}

export function pushNotification(items, partial) {
  const list = Array.isArray(items) ? items : [];
  const id = partial.id || `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (list.some((n) => n.id === id)) return list;
  const next = {
    id,
    type: partial.type || "info",
    title: partial.title || "Notification",
    body: partial.body || "",
    createdAt: partial.createdAt || new Date().toISOString(),
    read: partial.read === true,
    meta: partial.meta || {},
  };
  return [next, ...list].slice(0, 100);
}

export function notificationFromScan(scanResult, versionNumber = 1) {
  const title = scanResult?.documentTitle || "Manuscript";
  const score = Number(scanResult?.overallScore ?? 0);
  const band = score >= 80 ? "Compliant" : score >= 50 ? "Needs Revision" : "Critical";
  const fails = (scanResult?.formatChecks || []).filter(
    (c) => c.result === "FAIL" || c.result === "REVIEW"
  );
  const items = [
    {
      id: `scan-${scanResult?.documentId || title}-${scanResult?.scannedAt || Date.now()}`,
      type: "scan_complete",
      title: `Format scan completed for "${title}"`,
      body: `Overall score: ${score}/100 — ${band}.`,
      createdAt: scanResult?.scannedAt || new Date().toISOString(),
      read: false,
      meta: { documentId: scanResult?.documentId, versionNumber },
    },
  ];
  for (const check of fails.slice(0, 2)) {
    items.push({
      id: `issue-${scanResult?.documentId}-${check.name}-${scanResult?.scannedAt || Date.now()}`,
      type: check.result === "FAIL" ? "scan_fail" : "scan_review",
      title:
        check.result === "FAIL"
          ? `${check.name || "Format check"} failed in "${title}"`
          : `${check.name || "Format check"} needs review in "${title}"`,
      body: check.details || check.description || check.name || "Review this formatting rule.",
      createdAt: scanResult?.scannedAt || new Date().toISOString(),
      read: false,
      meta: { documentId: scanResult?.documentId },
    });
  }
  return items;
}

export function notificationFromSubscription(subscription) {
  const tier = String(subscription?.tier || "").toLowerCase();
  if (tier !== "premium") return null;
  const period = subscription?.billing_period === "annual" ? "annual" : "monthly";
  const amount = period === "annual" ? 9490 : 949;
  return {
    id: `pay-${subscription?.renews_at || Date.now()}`,
    type: "payment",
    title: "Payment successful",
    body: `You're now on Premium — ₱${amount.toLocaleString("en-PH")}.00 charged.`,
    createdAt: new Date().toISOString(),
    read: false,
    meta: { billingPeriod: period },
  };
}

export function notificationFromUpload(title, versionNumber = 1) {
  const clean = title || "Manuscript";
  return {
    id: `upload-${clean}-${versionNumber}-${Date.now()}`,
    type: "upload",
    title: "New manuscript uploaded",
    body: `'${clean}' v${Number(versionNumber).toFixed(1)} uploaded and ready to scan.`,
    createdAt: new Date().toISOString(),
    read: false,
    meta: { title: clean, versionNumber },
  };
}

export function groupNotifications(items) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);

  const groups = { today: [], yesterday: [], earlier: [] };
  for (const n of items || []) {
    const d = new Date(n.createdAt);
    if (Number.isNaN(d.getTime())) {
      groups.earlier.push(n);
      continue;
    }
    if (d >= startToday) groups.today.push(n);
    else if (d >= startYesterday) groups.yesterday.push(n);
    else groups.earlier.push(n);
  }
  return groups;
}

export function relativeTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}
