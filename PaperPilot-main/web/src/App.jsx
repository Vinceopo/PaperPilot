import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, firebaseReady } from "./firebase.js";
import {
  deleteMechanics as deleteMechanicsRequest,
  extractMechanics,
  getSubscription,
  listManuscripts,
  listMechanics,
  deleteManuscript as deleteManuscriptRequest,
  deleteManuscriptVersion,
  getComplianceScan,
  getProfile,
  getScanDocument,
  downloadScanDocumentFile,
  listScans,
  previewManuscript,
  renameMechanics as renameMechanicsRequest,
  saveMechanicsProfile,
  updateMechanicsProfile,
  uploadManuscriptVersion,
  warmApi,
} from "./api.js";
import AuthScreen from "./components/AuthScreen.jsx";
import PaperPilotLogo, { PaperPilotMark } from "./components/PaperPilotLogo.jsx";
import RegistrationSuccessScreen from "./components/auth/RegistrationSuccessScreen.jsx";
import MechanicsPanel from "./components/cockpit/MechanicsPanel.jsx";
import ManuscriptPanel from "./components/cockpit/ManuscriptPanel.jsx";
import ScanResultsScreen from "./components/cockpit/ScanResultsScreen.jsx";
import AnalysisProgress from "./components/cockpit/AnalysisProgress.jsx";
import PaperCarryAway, { PAPER_CARRY_HOLD_MS } from "./components/cockpit/PaperCarryAway.jsx";
import AccountSettingsScreen from "./components/cockpit/AccountSettingsScreen.jsx";
import MyManuscriptsScreen from "./components/cockpit/MyManuscriptsScreen.jsx";
import SubscriptionScreen from "./components/cockpit/SubscriptionScreen.jsx";
import NotificationsScreen from "./components/cockpit/NotificationsScreen.jsx";
import UpgradePrompt from "./components/cockpit/UpgradePrompt.jsx";
import BackToDashboardButton from "./components/BackToDashboardButton.jsx";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import UploadJourneyModal, {
  ShowStepsRow,
  markUploadJourneySeen,
  uploadJourneySeen,
} from "./components/cockpit/UploadJourneyModal.jsx";
import PaperRollAnimation from "./components/PaperRollAnimation.jsx";
import PaperPlaneLoader from "./components/PaperPlaneLoader.jsx";
import FileTypeIcon from "./components/FileTypeIcon.jsx";
import { useScanFlow } from "./hooks/useScanFlow.js";
import { isScanReady, isServerId, mapComplianceScanToResult, scanTargetIds } from "./lib/scanMapper.js";
import {
  attachScanResult,
  dismissScanIds,
  loadDismissedScanIds,
  loadScannedManuscripts,
  mergeServerScans,
  normalizeTitle,
  saveScannedManuscripts,
  upsertFromScanResult,
  versionScanId,
  versionToScanResult,
} from "./lib/scannedLibrary.js";
import { loadCachedMechanics, saveCachedMechanics } from "./lib/mechanicsCache.js";
import { latestVersion } from "./lib/scoreBand.js";
import { formatFileSize } from "./lib/formatFileSize.js";
import { supportedCitationStyle } from "./lib/formatMechanicsForm.js";
import { isPaidTier, planLimit, planName, resetWindow } from "./lib/plans.js";
import {
  loadNotifications,
  saveNotifications,
  unreadCount,
  markAllRead,
  markOneRead,
  removeNotification,
  pushNotification,
  notificationFromScan,
  notificationFromSubscription,
  notificationFromUpload,
} from "./lib/notifications.js";

function itemsFrom(data, key) {
  if (Array.isArray(data)) return data;
  return data?.[key] || data?.items || [];
}

const DASHBOARD_PAGES = new Set(["manuscripts", "upload", "account", "subscription", "notifications"]);

/** Raw hash segment (e.g. "results", "upload") without the leading #/. */
function hashSegment() {
  try {
    return String(window.location.hash || "")
      .replace(/^#\/?/, "")
      .split(/[/?#]/)[0]
      .trim();
  } catch {
    return "";
  }
}

/**
 * Hash routes so sidebar links support Open in new tab / middle-click.
 * `#/results` is session-only — a hard refresh has no in-memory scan, so land on
 * My Manuscripts (the dashboard) instead of an empty upload/results screen.
 */
function pageFromHash() {
  const raw = hashSegment();
  if (raw === "results") return "manuscripts";
  return DASHBOARD_PAGES.has(raw) ? raw : "manuscripts";
}

function hashForPage(page) {
  return `#/${DASHBOARD_PAGES.has(page) ? page : "manuscripts"}`;
}

const REGISTRATION_SUCCESS_KEY = "paperpilot.registrationSuccess";

function subscriptionCacheKey(uid) {
  return uid ? `paperpilot.subscription.${uid}` : "";
}

function readCachedSubscription(uid) {
  try {
    const raw = localStorage.getItem(subscriptionCacheKey(uid));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedSubscription(uid, next) {
  if (!uid || !next) return;
  try {
    localStorage.setItem(subscriptionCacheKey(uid), JSON.stringify(next));
  } catch {
    // Ignore quota / private mode failures.
  }
}

/** Prefer updated_at so a newer server snapshot can replace an older one. */
function subscriptionStamp(sub) {
  return String(sub?.updated_at || sub?.renews_at || sub?.billing_period_end || "");
}

function pendingRegistration(user) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(REGISTRATION_SUCCESS_KEY) || "null");
    const fresh = saved?.createdAt && Date.now() - saved.createdAt < 30 * 60 * 1000;
    const matches = !user?.email || saved?.email?.toLowerCase() === user.email.toLowerCase();
    if (fresh && matches) return saved;
  } catch {
    // Ignore malformed session data.
  }
  sessionStorage.removeItem(REGISTRATION_SUCCESS_KEY);
  return null;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(!firebaseReady);
  const [mechanics, setMechanics] = useState([]);
  const [selectedMechanicsId, setSelectedMechanicsId] = useState("");
  const [manuscripts, setManuscripts] = useState([]);
  const [currentManuscript, setCurrentManuscript] = useState(null);
  const [currentVersion, setCurrentVersion] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [billingReturn, setBillingReturn] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mechanicsBusy, setMechanicsBusy] = useState(false);
  const [manuscriptBusy, setManuscriptBusy] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState("");
  const [registrationSuccess, setRegistrationSuccess] = useState(() => pendingRegistration());
  const [activePage, setActivePage] = useState(() =>
    typeof window === "undefined" ? "manuscripts" : pageFromHash()
  ); // "manuscripts" | "upload" | "account" | "subscription" | "notifications"
  const [manuscriptDetailOpen, setManuscriptDetailOpen] = useState(false);
  const closeManuscriptDetailRef = useRef(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const stored = window.localStorage.getItem("paperpilot.sidebarExpanded");
      if (stored === "0") return false;
      if (stored === "1") return true;
    } catch {
      // Ignore storage failures (private mode, etc.).
    }
    return true;
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  function toggleSidebarExpanded() {
    setSidebarExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("paperpilot.sidebarExpanded", next ? "1" : "0");
      } catch {
        // Ignore storage failures.
      }
      return next;
    });
  }
  const [scannedLibrary, setScannedLibrary] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const lastSavedScanKey = useRef("");
  const scannedLibraryRef = useRef([]);
  // A dashboard load started before a delete can finish after it; never show deleted formats again.
  const deletedMechanicsRef = useRef(new Set());
  // Bumped on every local save/rename/edit/delete so an older dashboard load can't overwrite it.
  const mechanicsChangeRef = useRef(0);
  const silentLoadRef = useRef(null);
  const withoutDeletedMechanics = useCallback(
    (items) => items.filter((item) => !deletedMechanicsRef.current.has(item.id)),
    []
  );

  /** Apply a server/local mechanics list; never wipe a non-empty list with a transient empty reply. */
  const applyMechanicsList = useCallback(
    (items, { allowEmpty = false, preferId = "" } = {}) => {
      const next = withoutDeletedMechanics(Array.isArray(items) ? items : []);
      let applied = next;
      setMechanics((current) => {
        if (!next.length && current.length && !allowEmpty) {
          applied = current;
          return current;
        }
        const uid = auth?.currentUser?.uid;
        if (uid) saveCachedMechanics(next, uid);
        return next;
      });
      setSelectedMechanicsId((current) => {
        if (preferId && applied.some((item) => item.id === preferId)) return preferId;
        if (current && applied.some((item) => item.id === current)) return current;
        return applied[0]?.id || "";
      });
      return applied;
    },
    [withoutDeletedMechanics]
  );
  // Plan replies can arrive out of order (a slow dashboard load finishing after a
  // checkout confirm), so a reply requested before the latest plan update is dropped.
  const subscriptionTicketRef = useRef(0);
  const subscriptionAppliedRef = useRef(0);
  const subscriptionRef = useRef(null);
  const nextSubscriptionTicket = useCallback(() => ++subscriptionTicketRef.current, []);
  const storeSubscription = useCallback((next, ticket, opts = {}) => {
    if (!next || typeof next !== "object") return false;
    const order = ticket ?? ++subscriptionTicketRef.current;
    if (order < subscriptionAppliedRef.current) return false;

    const current = subscriptionRef.current;
    const nextTier = String(next.tier || "free").toLowerCase();
    const currentTier = String(current?.tier || "free").toLowerCase();
    // After PayMongo confirm, an in-flight GET /subscription often still returns Free.
    // That stale snapshot must not wipe the paid plan from the header / scan limits.
    // A newer Free snapshot (explicit cancel, or period ended) is still allowed through.
    if (
      !opts.allowDowngrade &&
      isPaidTier(currentTier) &&
      !isPaidTier(nextTier)
    ) {
      const curStamp = subscriptionStamp(current);
      const nextStamp = subscriptionStamp(next);
      if (!(curStamp && nextStamp && nextStamp > curStamp)) {
        return false;
      }
    }

    subscriptionAppliedRef.current = order;
    subscriptionRef.current = next;
    setSubscription(next);
    writeCachedSubscription(auth?.currentUser?.uid, next);
    return true;
  }, []);
  const notificationsRef = useRef([]);
  const notificationsRootRef = useRef(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const fileDetailsRef = useRef(null);
  const [fileDetailsNotice, setFileDetailsNotice] = useState("");
  const [manuscriptReady, setManuscriptReady] = useState(false);
  const [fileDetailsFocusKey, setFileDetailsFocusKey] = useState(0);
  const [uploadCancelKey, setUploadCancelKey] = useState(0);
  const [uploadWizardStep, setUploadWizardStep] = useState(1); // 1 | 2 | 3
  const [wizardMaxStep, setWizardMaxStep] = useState(1);
  const [journeyOpen, setJourneyOpen] = useState(false);
  const [fileDetailsConfirm, setFileDetailsConfirm] = useState(null); // "cancel" | "analyse" | null
  const [fileDetailsConfirmBusy, setFileDetailsConfirmBusy] = useState(false);
  const uploadSessionRef = useRef(0);
  const signedIn = Boolean(user);

  function clearUploadSession({ discardPending = true } = {}) {
    const step = scanFlowRef.current?.step;
    if (
      discardPending &&
      (!step || step === "idle" || step === "fileSelected" || step === "error")
    ) {
      discardUnscannedVersion();
    }
    setManuscriptReady(false);
    setFileDetailsNotice("");
    setCurrentVersion(null);
    setError("");
    resetUploadWizard(1);
    scanFlow.backToDashboard();
  }

  function handleBackToDashboard() {
    clearUploadSession();
    setActivePage("manuscripts");
  }

  /** Always open Upload at Format Mechanics (step 1), leaving any prior results view. */
  function beginFreshUpload() {
    clearUploadSession();
    closeManuscriptDetailRef.current?.();
    setActivePage("upload");
  }

  const dismissJourney = useCallback(() => {
    markUploadJourneySeen();
    setJourneyOpen(false);
  }, []);

  function goToUploadWizardStep(step) {
    if (step < 1 || step > wizardMaxStep) return;
    setUploadWizardStep(step);
  }

  function advanceUploadWizard(step) {
    setUploadWizardStep(step);
    setWizardMaxStep((max) => Math.max(max, step));
  }

  function resetUploadWizard(step = 1) {
    setUploadWizardStep(step);
    setWizardMaxStep(step);
  }

  scannedLibraryRef.current = scannedLibrary;
  notificationsRef.current = notifications;

  const notificationUnread = useMemo(() => unreadCount(notifications), [notifications]);

  function persistNotifications(next) {
    setNotifications(next);
    saveNotifications(next, user?.uid);
  }

  function appendNotifications(entries) {
    const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
    if (!list.length) return;
    let next = notificationsRef.current;
    for (const entry of list) {
      if (!entry) continue;
      next = pushNotification(next, entry);
    }
    if (next !== notificationsRef.current) persistNotifications(next);
  }

  function focusFileDetails(message) {
    setFileDetailsNotice(message || "");
    setFileDetailsFocusKey((key) => key + 1);
  }

  function discardUnscannedVersion() {
    const flow = scanFlowRef.current;
    if (flow?.persistScan || ["summary", "tracing", "results", "analyzing"].includes(flow?.step)) return;
    const version = currentVersionRef.current;
    const manuscript = currentManuscriptRef.current;
    if (!version?.pending || !isServerId(version.id)) return;
    const manuscriptId = version.manuscript_id || manuscript?.serverManuscriptId;
    if (!isServerId(manuscriptId)) return;
    deleteManuscriptVersion({ manuscriptId, versionId: version.id }).catch(() => {});
  }

  function cancelManuscriptUpload() {
    discardUnscannedVersion();
    uploadSessionRef.current += 1;
    setUploadCancelKey((key) => key + 1);
    setFileDetailsNotice("");
    setManuscriptReady(false);
    setCurrentVersion(null);
    scanFlow.selectFile(null);
    setError("");
    // Drop staged new manuscripts that were never scanned into My Manuscripts.
    setCurrentManuscript((m) => {
      if (!m?.id) return null;
      const inLibrary = scannedLibraryRef.current.some((item) => item.id === m.id);
      return inLibrary ? m : null;
    });
    setUploadWizardStep(2);
    setWizardMaxStep((max) => Math.min(max, 2));
  }

  // ── Scan flow state machine (mock-ready; swap analyzeDocument for real API) ──
  const resolveManuscript = useCallback((title, documentId) => {
    const list = scannedLibraryRef.current || [];
    const byId = documentId ? list.find((m) => m.id === documentId) : null;
    if (byId) return byId;
    const key = normalizeTitle(title);
    if (!key) return null;
    return list.find((m) => normalizeTitle(m.title) === key) || null;
  }, []);

  const currentManuscriptRef = useRef(null);
  currentManuscriptRef.current = currentManuscript;
  const currentVersionRef = useRef(null);
  currentVersionRef.current = currentVersion;
  const mechanicsRef = useRef(mechanics);
  mechanicsRef.current = mechanics;
  const selectedMechanicsIdRef = useRef(selectedMechanicsId);
  selectedMechanicsIdRef.current = selectedMechanicsId;

  const getActiveManuscript = useCallback(() => {
    const m = currentManuscriptRef.current;
    if (!m) return null;
    return { id: m.id, title: m.title };
  }, []);

  const getScanTarget = useCallback(async () => {
    const version = currentVersionRef.current;
    const manuscript = currentManuscriptRef.current;
    const { versionId, manuscriptId, ready } = scanTargetIds(version, manuscript);
    if (!ready) {
      throw new Error("Wait until the manuscript finishes uploading, then analyse.");
    }
    const mechanicsId = selectedMechanicsIdRef.current;
    const profile = mechanicsRef.current.find((item) => item.id === mechanicsId);
    const citationStyle = supportedCitationStyle(profile?.rules?.citation_style);
    return {
      manuscriptId,
      versionId,
      citationStyle,
      pageCount: version?.page_count,
      versionNumber: version?.version_number,
      cloudinaryUrl: version?.cloudinary_url || version?.cloudinaryUrl || "",
      preview: version?.preview || version?.parsed_preview || null,
      sourceFilename: version?.source_filename || version?.filename || "",
    };
  }, []);

  const [analysisShown, setAnalysisShown] = useState(0);
  const [departPhase, setDepartPhase] = useState("progress");
  const revealSummaryRef = useRef(null);
  const resultReadyRef = useRef(false);
  const flightFinishedRef = useRef(false);
  const [pageHidden, setPageHidden] = useState(() => document.visibilityState === "hidden");
  const titleBeforeDoneRef = useRef(null);

  useEffect(() => {
    const onVisibility = () => setPageHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const scanFlow = useScanFlow({
    mechanicsId: selectedMechanicsId,
    resolveManuscript,
    getActiveManuscript,
    getScanTarget,
    tier: String(subscription?.tier || "free").toLowerCase(),
  });

  revealSummaryRef.current = scanFlow.revealSummary;
  resultReadyRef.current = Boolean(scanFlow.result);

  useEffect(() => {
    if (!notificationsOpen) return undefined;
    function onPointerDown(event) {
      if (notificationsRootRef.current?.contains(event.target)) return;
      setNotificationsOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setNotificationsOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    if (scanFlow.step !== "analyzing") {
      setAnalysisShown(0);
      return undefined;
    }
    const target = Math.min(100, Math.max(0, Number(scanFlow.scanProgress.percent) || 0));
    const ceiling = target >= 100 ? 100 : Math.min(97, target + 8);
    let frame = 0;
    const tick = () => {
      setAnalysisShown((current) => {
        if (current < target - 0.15) {
          return Math.min(target, current + Math.max(0.35, (target - current) * 0.14));
        }
        if (target >= 100) return 100;
        return current < ceiling ? Math.min(ceiling, Math.max(current, target) + 0.02) : current;
      });
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [scanFlow.step, scanFlow.scanProgress.percent]);

  useEffect(() => {
    if (scanFlow.step !== "analyzing") {
      setDepartPhase("progress");
      flightFinishedRef.current = false;
      return undefined;
    }
    const stage = String(scanFlow.scanProgress.stage || "").toLowerCase();
    if (stage !== "done" || analysisShown < 99.5 || departPhase !== "progress") return undefined;
    const timer = window.setTimeout(() => setDepartPhase("fly"), PAPER_CARRY_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [scanFlow.step, scanFlow.scanProgress.stage, analysisShown, departPhase]);

  useEffect(() => {
    if (scanFlow.step !== "analyzing" || !flightFinishedRef.current || !scanFlow.result) return undefined;
    flightFinishedRef.current = false;
    revealSummaryRef.current?.();
    return undefined;
  }, [scanFlow.step, scanFlow.result]);

  // Browsers pause requestAnimationFrame in background tabs, so the animated bar (and the
  // plane after it) would hold a finished scan back until the tab is shown again.
  useEffect(() => {
    if (!pageHidden || scanFlow.step !== "analyzing" || !scanFlow.result) return;
    if (String(scanFlow.scanProgress.stage || "").toLowerCase() !== "done") return;
    if (titleBeforeDoneRef.current == null) {
      titleBeforeDoneRef.current = document.title;
      document.title = `✓ Analysis complete · ${document.title}`;
    }
    revealSummaryRef.current?.();
  }, [pageHidden, scanFlow.step, scanFlow.result, scanFlow.scanProgress.stage]);

  useEffect(() => {
    if (pageHidden) return;
    if (titleBeforeDoneRef.current != null) {
      document.title = titleBeforeDoneRef.current;
      titleBeforeDoneRef.current = null;
    }
    if (scanFlow.step === "analyzing") {
      const target = Math.min(100, Math.max(0, Number(scanFlow.scanProgress.percent) || 0));
      setAnalysisShown((current) => Math.max(current, target));
    }
  }, [pageHidden]);

  useEffect(() => {
    if (!user || (scanFlow.step !== "summary" && scanFlow.step !== "results")) return undefined;
    let cancelled = false;
    const ticket = nextSubscriptionTicket();
    getSubscription()
      .then((next) => {
        if (!cancelled) storeSubscription(next, ticket);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [scanFlow.step, user, nextSubscriptionTicket, storeSubscription]);

  useEffect(() => {
    if (!fileDetailsFocusKey || !manuscriptReady) return;
    const t = window.setTimeout(() => {
      fileDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(t);
  }, [fileDetailsFocusKey, manuscriptReady, currentVersion, scanFlow.file]);

  // PayMongo success/cancel redirect: /?billing=success|canceled
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const billing = params.get("billing");
      if (billing !== "success" && billing !== "canceled") return;
      setBillingReturn(billing);
      setActivePage("subscription");
      params.delete("billing");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${hashForPage("subscription")}`;
      window.history.replaceState({}, "", next);
    } catch {
      // Ignore malformed URL params.
    }
  }, []);

  // Keep the URL hash in sync so dashboard links are real destinations.
  // Compliance results use `#/results` so a hard refresh can fall back to My Manuscripts.
  useEffect(() => {
    const onResults =
      Boolean(scanFlow.result) &&
      activePage === "upload" &&
      (scanFlow.step === "results" || scanFlow.step === "tracing" || scanFlow.step === "summary");
    const wanted = onResults ? "#/results" : hashForPage(activePage);
    if (window.location.hash === wanted) return;
    const next = `${window.location.pathname}${window.location.search}${wanted}`;
    window.history.replaceState({}, "", next);
  }, [activePage, scanFlow.result, scanFlow.step]);

  useEffect(() => {
    const loaded = loadScannedManuscripts(user?.uid);
    setScannedLibrary(loaded);
    // Persist merged rows if older duplicates were cleaned up.
    if (loaded.length) saveScannedManuscripts(loaded, user?.uid);
    lastSavedScanKey.current = "";
    setNotifications(loadNotifications(user?.uid));
    // Show last-known Saved Mechanics immediately — never flash empty while the API warms.
    const cachedMechanics = loadCachedMechanics(user?.uid);
    if (cachedMechanics.length) {
      setMechanics(cachedMechanics);
      setSelectedMechanicsId((current) =>
        current && cachedMechanics.some((item) => item.id === current)
          ? current
          : cachedMechanics[0]?.id || ""
      );
    }
  }, [user?.uid]);

  // Signing out (or into another account) must not leave the previous user's session on screen.
  const sessionUidRef = useRef(user?.uid || "");
  useEffect(() => {
    const uid = user?.uid || "";
    const previous = sessionUidRef.current;
    sessionUidRef.current = uid;
    if (!previous || previous === uid) return;
    setMechanics([]);
    setSelectedMechanicsId("");
    setManuscripts([]);
    setCurrentManuscript(null);
    setCurrentVersion(null);
    subscriptionAppliedRef.current = ++subscriptionTicketRef.current;
    const cached = uid ? readCachedSubscription(uid) : null;
    subscriptionRef.current = cached;
    setSubscription(cached);
    setBillingReturn(null);
    setUpgradeMessage("");
    setError("");
    setActivePage("manuscripts");
    setManuscriptReady(false);
    setFileDetailsNotice("");
    resetUploadWizard(1);
    scanFlow.backToDashboard();
  }, [user?.uid]);

  useEffect(() => {
    if (!scanFlow.persistScan) return;
    if (!["summary", "tracing", "results"].includes(scanFlow.step) || !scanFlow.result) return;
    const key = `${scanFlow.result.documentId}|${scanFlow.versionNumber}|${scanFlow.result.scannedAt || ""}`;
    if (lastSavedScanKey.current === key) return;
    lastSavedScanKey.current = key;
    setScannedLibrary((prev) => {
      const next = upsertFromScanResult(prev, scanFlow.result, scanFlow.versionNumber);
      saveScannedManuscripts(next, user?.uid);
      return next;
    });
    appendNotifications(notificationFromScan(scanFlow.result, scanFlow.versionNumber));
  }, [scanFlow.persistScan, scanFlow.step, scanFlow.result, scanFlow.versionNumber, user?.uid]);

  // Upload "Upload to" choices = same library as My Manuscripts (shared source of truth).
  // Hooks must stay above any conditional returns.
  const uploadTargets = useMemo(
    () =>
      scannedLibrary.map((m) => {
        const versions = Array.isArray(m.versions) ? m.versions : [];
        const maxVer = versions.reduce(
          (max, v) => Math.max(max, Number(v.versionNumber) || 0),
          0
        );
        return {
          id: m.id,
          title: m.title,
          version_count: versions.length,
          current_version_number: maxVer,
          versions,
        };
      }),
    [scannedLibrary]
  );

  const selectUploadTarget = useCallback((id) => {
    if (!id) {
      setCurrentManuscript(null);
      return;
    }
    const m = scannedLibraryRef.current.find((item) => item.id === id);
    if (m) setCurrentManuscript({ id: m.id, title: m.title });
  }, []);

  const scanFlowRef = useRef(null);
  scanFlowRef.current = scanFlow;

  useEffect(() => {
    const onHashChange = () => {
      const raw = hashSegment();
      if (raw === "results") {
        if (scanFlowRef.current?.result) {
          setActivePage("upload");
          scanFlowRef.current.openFullResults?.();
        } else {
          // Hard refresh / cold open of results with no session → dashboard.
          setActivePage("manuscripts");
        }
        return;
      }
      const page = pageFromHash();
      setActivePage((current) => (current === page ? current : page));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const [savedDocument, setSavedDocument] = useState(null);
  const savedDocumentRef = useRef(null);
  savedDocumentRef.current = savedDocument;
  const savedResultScanId = scanFlow.file ? "" : String(scanFlow.result?.scanId || "");

  useEffect(() => {
    if (!isServerId(savedResultScanId)) return undefined;
    const known = savedDocumentRef.current;
    if (known?.scanId === savedResultScanId && known.file) return undefined;
    let cancelled = false;
    setSavedDocument((current) =>
      current?.scanId === savedResultScanId ? current : { scanId: savedResultScanId, file: null, loading: true }
    );
    const settle = (file) => {
      if (cancelled) return;
      setSavedDocument((current) =>
        current?.scanId === savedResultScanId && current.loading
          ? { scanId: savedResultScanId, file, loading: false }
          : current
      );
    };
    getScanDocument(savedResultScanId)
      .then(downloadScanDocumentFile)
      .then(settle)
      .catch(() => settle(null));
    return () => {
      cancelled = true;
    };
  }, [savedResultScanId]);

  const savedDocumentForResult =
    !scanFlow.file && savedDocument && savedDocument.scanId === scanFlow.result?.scanId ? savedDocument : null;
  const resultFile = scanFlow.file || savedDocumentForResult?.file || null;
  const resultDocumentLoading = Boolean(savedDocumentForResult?.loading);

  const updateScannedLibrary = useCallback(
    (next) => {
      const previous = scannedLibraryRef.current;
      const kept = new Set(next.flatMap((m) => (m.versions || []).map(versionScanId)));
      dismissScanIds(
        previous
          .flatMap((m) => (m.versions || []).map(versionScanId))
          .filter((id) => id && !kept.has(id)),
        user?.uid
      );
      scannedLibraryRef.current = next;
      setScannedLibrary(next);
      saveScannedManuscripts(next, user?.uid);
      const current = currentManuscriptRef.current;
      const before = previous.find(
        (m) => m.id === current?.id || (current?.title && normalizeTitle(m.title) === normalizeTitle(current.title))
      );
      const after = next.find(
        (m) => m.id === current?.id || (current?.title && normalizeTitle(m.title) === normalizeTitle(current.title))
      );
      const beforeCount = before?.versions?.length || 0;
      const afterCount = after?.versions?.length || 0;
      if (before && afterCount < beforeCount) {
        const latest = after ? latestVersion(after) : null;
        const flow = scanFlowRef.current;
        const viewingThis =
          flow?.result &&
          (flow.result.documentId === before.id || flow.result.documentId === after?.id);
        const onVersionScreen = ["summary", "tracing", "results"].includes(flow?.step);
        if (!latest) {
          setCurrentVersion(null);
          setManuscriptReady(false);
          setFileDetailsNotice("");
          setUploadWizardStep(1);
          setWizardMaxStep(1);
          if (viewingThis && onVersionScreen) flow.backToDashboard();
        } else {
          setCurrentVersion((ver) => (ver ? { ...ver, version_number: latest.versionNumber } : ver));
          if (viewingThis && onVersionScreen) {
            const saved = versionToScanResult(after, latest);
            if (saved) flow.showSavedResult(saved, latest.versionNumber);
            else flow.syncVersionNumber(latest.versionNumber);
          }
        }
      }
      setCurrentManuscript((open) => {
        if (open?.id && !next.some((m) => m.id === open.id)) {
          setCurrentVersion(null);
          setManuscriptReady(false);
          setFileDetailsNotice("");
          setUploadWizardStep(1);
          setWizardMaxStep(1);
          return null;
        }
        return open;
      });
    },
    [user?.uid]
  );

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return undefined;
    }

    // Restore the cached Firebase session (IndexedDB when "Remember me"
    // was checked). Only sign out when the user chooses to, or when tokens are revoked.
    const unsub = onAuthStateChanged(auth, (next) => {
      setUser(next);
      if (next) {
        setRegistrationSuccess(pendingRegistration(next));
        const cached = readCachedSubscription(next.uid);
        if (cached) {
          setSubscription((current) => {
            if (current) return current;
            subscriptionRef.current = cached;
            return cached;
          });
        }
      }
      setAuthReady(true);
    });

    // Do NOT force getIdToken(true) on focus/visibility. File pickers, uploads,
    // and popups steal focus; a flaky refresh used to sign everyone out.
    // Real revocation is handled in authorizedFetch (fatal Firebase codes only).
    return () => {
      unsub();
    };
  }, []);

  // Ensure the API has a database profile the first time it is requested.
  useEffect(() => {
    if (!user?.uid) return;
    getProfile().catch(() => {});
  }, [user?.uid]);

  const loadDashboard = useCallback(async (opts) => {
    if (!auth?.currentUser) return;
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      // Vercel Python cold-starts install deps on first request — warm first so
      // the three parallel dashboard calls don't all race a 60s install.
      if (!silent) await warmApi();

      // Load each resource independently — a 503 on manuscripts/subscription
      // must not wipe a successful mechanics list (that caused "already exists"
      // saves while Use a Saved Format looked empty).
      const subscriptionTicket = nextSubscriptionTicket();
      const mechanicsChange = mechanicsChangeRef.current;
      const [mechanicsResult, manuscriptsResult, subscriptionResult, scansResult] = await Promise.allSettled([
        listMechanics(),
        listManuscripts(),
        getSubscription(),
        listScans(),
      ]);
      if (scansResult.status === "fulfilled") {
        const uid = auth.currentUser?.uid;
        const { items, added } = mergeServerScans(
          scannedLibraryRef.current,
          itemsFrom(scansResult.value, "items"),
          loadDismissedScanIds(uid)
        );
        if (added) {
          scannedLibraryRef.current = items;
          setScannedLibrary(items);
          saveScannedManuscripts(items, uid);
        }
      }

      // Scans made on another device (e.g. mobile) join the local library as versions.
      if (scansResult.status === "fulfilled") {
        const uid = auth.currentUser?.uid;
        const { items, changed } = mergeServerScans(
          scannedLibraryRef.current,
          itemsFrom(scansResult.value, "items"),
          loadDismissedScanIds(uid),
          scansResult.value?.deleted
        );
        if (changed) {
          scannedLibraryRef.current = items;
          setScannedLibrary(items);
          saveScannedManuscripts(items, uid);
        }
      }

      const failures = [];
      // Formats changed on screen while this load was in flight; the on-screen list is newer.
      const mechanicsStale = mechanicsChange !== mechanicsChangeRef.current;
      if (mechanicsResult.status === "fulfilled" && !mechanicsStale) {
        // Empty API replies during warm-up must not clear Saved Mechanics.
        applyMechanicsList(itemsFrom(mechanicsResult.value, "mechanics"), {
          allowEmpty: false,
        });
      } else if (mechanicsResult.status === "rejected") {
        failures.push(mechanicsResult.reason?.message || "Could not load format mechanics.");
      }
      if (manuscriptsResult.status === "fulfilled") {
        setManuscripts(itemsFrom(manuscriptsResult.value, "manuscripts"));
      } else {
        failures.push(manuscriptsResult.reason?.message || "Could not load manuscripts.");
      }
      if (subscriptionResult.status === "fulfilled") {
        storeSubscription(subscriptionResult.value, subscriptionTicket);
      } else {
        failures.push(subscriptionResult.reason?.message || "Could not load subscription.");
      }
      if (failures.length && !silent) {
        setError(failures[0]);
      }
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [nextSubscriptionTicket, storeSubscription, applyMechanicsList]);

  useEffect(() => {
    if (signedIn) loadDashboard();
  }, [signedIn, loadDashboard]);

  // Cross-device updates: refresh on tab focus/visibility only.
  // Periodic 30s polling was removed — it re-downloaded RTDB trees and burned the free download CAP.
  useEffect(() => {
    if (!signedIn) return undefined;
    let last = Date.now();
    const refresh = (minGap) => {
      if (document.visibilityState !== "visible" || Date.now() - last < minGap) return;
      if (silentLoadRef.current) return;
      last = Date.now();
      silentLoadRef.current = loadDashboard({ silent: true }).finally(() => {
        silentLoadRef.current = null;
      });
    };
    const onReturn = () => refresh(3000);
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [signedIn, loadDashboard]);

  useEffect(() => {
    if (signedIn && activePage === "manuscripts") void loadDashboard({ silent: true });
  }, [signedIn, activePage, loadDashboard]);

  // Stored versions can be trimmed / server summaries only; fetch the full scan when opened.
  async function resolveSavedResult(manuscript, version) {
    if (!version) return null;
    const scanId = versionScanId(version);
    if ((version.scanResult && !version.trimmed) || !isServerId(scanId)) {
      return versionToScanResult(manuscript, version);
    }
    try {
      const scan = await getComplianceScan(scanId);
      const full = mapComplianceScanToResult(scan, {
        documentId: manuscript?.id,
        documentTitle: manuscript?.title,
        citationStyle: manuscript?.citationStyle,
        versionId: version.versionId || version.scanResult?.versionId,
        documentName: version.scanResult?.documentName,
        cloudinaryUrl: version.scanResult?.cloudinaryUrl,
      });
      const next = attachScanResult(scannedLibraryRef.current, manuscript.id, version.id, full);
      scannedLibraryRef.current = next;
      setScannedLibrary(next);
      saveScannedManuscripts(next, user?.uid);
      const updated = next.find((m) => m.id === manuscript.id);
      const updatedVersion = updated?.versions?.find((v) => v.id === version.id);
      return versionToScanResult(updated || manuscript, updatedVersion || version);
    } catch (err) {
      setError(
        err?.message
          ? `This version could not be loaded: ${err.message}`
          : "This version could not be loaded. Check your connection, then open it again."
      );
      return null;
    }
  }

  useEffect(() => {
    const wizard =
      activePage === "upload" &&
      (scanFlow.step === "idle" || scanFlow.step === "fileSelected");
    if (!wizard || uploadJourneySeen()) return;
    setJourneyOpen(true);
  }, [activePage, scanFlow.step]);

  function handleGateError(err) {
    if (err?.code === "upgrade_required" || err?.detail?.code === "upgrade_required") {
      setUpgradeMessage(err.message);
      return true;
    }
    return false;
  }

  async function onMechanicsExtract(file) {
    setError("");
    await warmApi();
    return extractMechanics(file);
  }

  async function onMechanicsSaveProfile(payload) {
    setMechanicsBusy(true);
    setError("");
    try {
      const created = await saveMechanicsProfile({
        name: payload.name,
        rules: payload.rules,
        sourceFilename: payload.source_filename,
        fileType: payload.file_type,
        extractedText: payload.extracted_text,
        ignoredFields: payload.ignored_fields,
      });
      mechanicsChangeRef.current += 1;
      if (created?.id) {
        setMechanics((current) => {
          const next = [created, ...current.filter((item) => item.id !== created.id)];
          const uid = auth?.currentUser?.uid;
          if (uid) saveCachedMechanics(next, uid);
          return next;
        });
        setSelectedMechanicsId(created.id);
      }
      try {
        const data = await listMechanics();
        const listed = withoutDeletedMechanics(itemsFrom(data, "mechanics"));
        // Keep the just-saved profile even if the list endpoint lags behind the write.
        const merged =
          created?.id && !listed.some((item) => item.id === created.id)
            ? [created, ...listed]
            : listed;
        applyMechanicsList(merged, { allowEmpty: false, preferId: created?.id || "" });
      } catch {
        // The saved format is already on screen; the next refresh brings the full list.
      }
      return true;
    } catch (err) {
      // Name conflict usually means the profile is already saved — refresh the list.
      if (err?.status === 409 || /already exists/i.test(err?.message || "")) {
        try {
          const data = await listMechanics();
          const next = withoutDeletedMechanics(itemsFrom(data, "mechanics"));
          const match = next.find(
            (item) => item.name.toLowerCase() === String(payload.name || "").trim().toLowerCase()
          );
          applyMechanicsList(next, { allowEmpty: false, preferId: match?.id || "" });
        } catch {
          // Keep original save error.
        }
        const conflict = new Error(
          "This format is already saved. Open “Use a Saved Format” to select it, or change the profile name."
        );
        conflict.status = 409;
        throw conflict;
      }
      throw err;
    } finally {
      setMechanicsBusy(false);
    }
  }

  async function onMechanicsUpdateProfile(mechanicsId, payload) {
    setMechanicsBusy(true);
    setError("");
    try {
      const updated = await updateMechanicsProfile(mechanicsId, {
        name: payload.name,
        rules: payload.rules,
        ignoredFields: payload.ignored_fields,
      });
      mechanicsChangeRef.current += 1;
      setMechanics((current) => {
        const next = current.map((item) =>
          item.id === mechanicsId ? { ...item, ...updated } : item
        );
        const uid = auth?.currentUser?.uid;
        if (uid) saveCachedMechanics(next, uid);
        return next;
      });
      setSelectedMechanicsId(mechanicsId);
      return true;
    } catch (err) {
      throw err;
    } finally {
      setMechanicsBusy(false);
    }
  }

  async function onMechanicsRename(mechanicsId, name) {
    setMechanicsBusy(true);
    setError("");
    try {
      const updated = await renameMechanicsRequest(mechanicsId, name);
      mechanicsChangeRef.current += 1;
      setMechanics((current) => {
        const next = current.map((item) => (item.id === mechanicsId ? updated : item));
        const uid = auth?.currentUser?.uid;
        if (uid) saveCachedMechanics(next, uid);
        return next;
      });
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setMechanicsBusy(false);
    }
  }

  async function onMechanicsDelete(mechanicsId) {
    setMechanicsBusy(true);
    setError("");
    try {
      try {
        await deleteMechanicsRequest(mechanicsId);
      } catch (err) {
        // 404 means it is already gone on the server (e.g. deleted on another device).
        if (err?.status !== 404) throw err;
      }
      deletedMechanicsRef.current.add(mechanicsId);
      mechanicsChangeRef.current += 1;
      const remainingItems = mechanics.filter((item) => item.id !== mechanicsId);
      // Deleting the last format is a real empty list — allow clearing cache/UI.
      applyMechanicsList(remainingItems, {
        allowEmpty: true,
        preferId: selectedMechanicsId === mechanicsId ? "" : selectedMechanicsId,
      });
      if (selectedMechanicsId === mechanicsId) {
        setCurrentVersion(null);
        setCurrentManuscript(null);
      }
      return true;
    } catch (err) {
      // Surface on the dashboard and rethrow so the panel can close the dialog cleanly.
      setError(err.message);
      throw err;
    } finally {
      setMechanicsBusy(false);
    }
  }

  async function onManuscriptUpload({ file, title, manuscriptId }) {
    setError("");

    const resolvedTitle = (title || file.name.replace(/\.(pdf|docx)$/i, "")).trim();
    if (!resolvedTitle) {
      setError("Enter a manuscript title.");
      return false;
    }
    if (!selectedMechanicsId) {
      setError("Select a format mechanics profile before uploading a manuscript.");
      return false;
    }

    if (!manuscriptId) {
      const takenInLibrary = scannedLibraryRef.current.some(
        (m) => normalizeTitle(m.title) === normalizeTitle(resolvedTitle)
      );
      if (takenInLibrary) {
        setError("A manuscript with this title already exists. Choose a unique title.");
        return false;
      }
    }

    setManuscriptBusy(true);
    const sessionId = ++uploadSessionRef.current;

    const libraryEntry = manuscriptId
      ? scannedLibraryRef.current.find((m) => m.id === manuscriptId)
      : null;
    const nextVersionNumber = libraryEntry
      ? Math.max(0, ...(libraryEntry.versions || []).map((v) => Number(v.versionNumber) || 0)) + 1
      : 1;

    const resolveApiManuscriptId = () => {
      if (isServerId(libraryEntry?.serverManuscriptId)) return libraryEntry.serverManuscriptId;
      if (isServerId(manuscriptId)) return manuscriptId;
      return "";
    };

    try {
      let apiManuscriptId = resolveApiManuscriptId();
      let created;
      try {
        created = await uploadManuscriptVersion({
          file,
          title: resolvedTitle,
          manuscriptId: apiManuscriptId || undefined,
          mechanicsId: selectedMechanicsId,
        });
      } catch (firstErr) {
        const missingParent =
          firstErr?.status === 404 &&
          apiManuscriptId &&
          /manuscript was not found/i.test(firstErr?.message || "");
        const isConflict =
          firstErr?.status === 409 || /already exists/i.test(firstErr?.message || "");
        if (missingParent) {
          created = await uploadManuscriptVersion({
            file,
            title: resolvedTitle,
            mechanicsId: selectedMechanicsId,
          });
        } else if (isConflict && manuscriptId) {
          const fromApi = await listManuscripts().catch(() => null);
          const apiList = itemsFrom(fromApi, "manuscripts");
          if (apiList.length) setManuscripts(apiList);
          const matched = apiList.find(
            (m) => normalizeTitle(m.title) === normalizeTitle(resolvedTitle) && isServerId(m.id)
          );
          if (!matched?.id) throw firstErr;
          created = await uploadManuscriptVersion({
            file,
            title: resolvedTitle,
            manuscriptId: matched.id,
            mechanicsId: selectedMechanicsId,
          });
        } else {
          throw firstErr;
        }
      }

      if (uploadSessionRef.current !== sessionId) return false;

      const version = created.version || {};
      const resolvedManuscriptId =
        version.manuscript_id ||
        created.manuscript_id ||
        created.created_manuscript?.id ||
        apiManuscriptId;
      if (!isServerId(version.id) || !isServerId(resolvedManuscriptId)) {
        throw new Error("The server did not return a saved manuscript. Please upload again.");
      }

      scanFlow.selectFile(file);
      setCurrentManuscript({
        id: manuscriptId || resolvedManuscriptId,
        title: resolvedTitle,
        serverManuscriptId: resolvedManuscriptId,
      });
      setCurrentVersion({
        ...version,
        manuscript_id: resolvedManuscriptId,
        version_number: version.version_number || nextVersionNumber,
        source_filename: version.source_filename || file.name,
        filename: file.name,
      });
      if (manuscriptId) {
        setScannedLibrary((prev) => {
          const next = prev.map((m) =>
            m.id === manuscriptId || normalizeTitle(m.title) === normalizeTitle(resolvedTitle)
              ? { ...m, serverManuscriptId: resolvedManuscriptId }
              : m
          );
          saveScannedManuscripts(next, user?.uid);
          return next;
        });
      }
      const data = await listManuscripts();
      if (uploadSessionRef.current !== sessionId) return false;
      setManuscripts(itemsFrom(data, "manuscripts"));
      setManuscriptReady(true);
      advanceUploadWizard(3);
      focusFileDetails("Manuscript uploaded completely and ready to scan.");
      appendNotifications(notificationFromUpload(resolvedTitle, version.version_number || nextVersionNumber));
      return true;
    } catch (err) {
      if (uploadSessionRef.current !== sessionId) return false;
      if (handleGateError(err)) return false;
      setError(err.message || "Could not upload the manuscript. Please try again.");
      setManuscriptReady(false);
      setFileDetailsNotice("");
      setCurrentVersion(null);
      scanFlow.selectFile(null);
      return false;
    } finally {
      if (uploadSessionRef.current === sessionId) setManuscriptBusy(false);
    }
  }

  if (!authReady) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f3f5f7] text-sm text-slate-500">
        Loading PaperPilot…
      </div>
    );
  }

  if (!signedIn) {
    return <AuthScreen />;
  }

  if (registrationSuccess) {
    return (
      <RegistrationSuccessScreen
        profile={registrationSuccess}
        onContinue={() => {
          sessionStorage.removeItem(REGISTRATION_SUCCESS_KEY);
          setRegistrationSuccess(null);
        }}
      />
    );
  }

  const tier = String(subscription?.tier || "free").toLowerCase();
  const used = Number(subscription?.used ?? subscription?.scans_used ?? 0);
  const limit = Number(subscription?.limit) || planLimit(tier);
  const remaining = Math.max(limit - Math.max(0, used), 0);
  const selectedMechanics = mechanics.find((item) => item.id === selectedMechanicsId);
  const scanReady = isScanReady(currentVersion, currentManuscript);

  async function doSignOut() {
    try {
      await signOut(auth);
    } catch {
      // Already signed out.
    }
    setUser(null);
  }

  // Page metadata driven by activePage
  const pageTitle =
    activePage === "account"
      ? "Account Settings"
      : activePage === "subscription"
        ? "Upgrade to Premium"
        : activePage === "notifications"
          ? "Notifications"
          : activePage === "manuscripts"
            ? manuscriptDetailOpen
              ? "Manuscript Detail"
              : "My Manuscripts"
            : activePage === "upload" && (scanFlow.step === "results" || scanFlow.step === "tracing")
              ? "Scan Results"
              : activePage === "upload" && scanFlow.step === "analyzing"
                ? "Analysing Document"
                : activePage === "upload" && scanFlow.step === "error"
                  ? "Analysis Failed"
                  : "Dashboard";
  const breadcrumb =
    activePage === "account"
      ? "Dashboard / Settings"
      : activePage === "subscription"
        ? "Settings / Subscription"
        : activePage === "notifications"
          ? "Notification"
          : activePage === "manuscripts"
            ? manuscriptDetailOpen
              ? "Dashboard / My Manuscripts / Detail"
              : "Dashboard / My Manuscripts"
            : "Dashboard";
  // Manuscript detail is a full page under My Manuscripts; its own heading covers title + back.
  const hidePageHeading =
    activePage === "subscription" ||
    (activePage === "manuscripts" && manuscriptDetailOpen) ||
    (activePage === "upload" &&
      ["idle", "fileSelected", "analyzing"].includes(scanFlow.step));

  function openUploadMechanics() {
    // Leave results / analysis / error and start (or resume) the upload wizard.
    // Do not bounce to My Manuscripts — sidebar "Upload & Analyze" must stay on Upload.
    if (scanFlow.step !== "idle" && scanFlow.step !== "fileSelected") {
      beginFreshUpload();
      return;
    }
    setActivePage("upload");
    if (uploadWizardStep === 3 && !(manuscriptReady && (currentVersion || scanFlow.file))) {
      resetUploadWizard(1);
    }
  }

  const showingUploadFace =
    activePage === "upload" && (scanFlow.step === "idle" || scanFlow.step === "fileSelected");
  // After analysis (or opening a saved version), offer a sidebar jump back to results.
  const hasComplianceResult = Boolean(scanFlow.result);
  const viewingComplianceResult =
    hasComplianceResult &&
    activePage === "upload" &&
    (scanFlow.step === "results" || scanFlow.step === "tracing" || scanFlow.step === "summary");

  function openComplianceResult() {
    if (!scanFlow.result) return;
    setActivePage("upload");
    scanFlow.openFullResults();
  }

  const navLabelClass = sidebarExpanded ? "" : "md:hidden";
  const navItemClass = (active) =>
    `group flex w-full items-center text-sm transition ${
      sidebarExpanded
        ? `gap-3 rounded-r-lg border-l-2 px-4 py-3 text-left ${
            active
              ? "border-[#16bfa8] bg-[#1a2943] font-semibold text-white"
              : "border-transparent text-slate-400 hover:bg-white/5 hover:text-white"
          }`
        : `justify-center rounded-lg px-2 py-3 max-md:gap-3 max-md:rounded-r-lg max-md:border-l-2 max-md:px-4 max-md:text-left md:px-2 ${
            active
              ? "bg-[#1a2943] font-semibold text-[#5fd3c1] max-md:border-[#16bfa8] max-md:text-white"
              : "text-slate-400 hover:bg-white/5 hover:text-white max-md:border-transparent"
          }`
    }`;

  return (
    <div
      className={`min-h-screen bg-[#f3f5f7] text-[#172033] transition-[padding] duration-300 ${
        sidebarExpanded ? "md:pl-80" : "md:pl-[4.75rem]"
      }`}
    >
      {/* Mobile drawer backdrop */}
      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-900/45 md:hidden"
          aria-label="Close menu"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-[#101a30] py-6 text-white transition-all duration-300 ${
          sidebarExpanded ? "w-80 px-5" : "w-80 px-5 md:w-[4.75rem] md:px-2"
        } ${mobileNavOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
        onClick={(e) => {
          // On phones the sidebar covers the page, so close it after navigating.
          if (window.innerWidth < 768 && e.target.closest?.("nav a, nav button")) setMobileNavOpen(false);
        }}
      >
        <div className={`relative ${sidebarExpanded ? "px-2" : "px-0 md:px-0"}`}>
          <button
            type="button"
            onClick={toggleSidebarExpanded}
            className={`mb-3 hidden h-8 w-8 place-items-center rounded-lg border border-slate-600/60 bg-[#1a2943] text-slate-300 transition hover:bg-[#243552] hover:text-white md:grid ${
              sidebarExpanded ? "absolute right-0 top-0 z-10 mb-0" : "relative mx-auto"
            }`}
            aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
            title={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {sidebarExpanded ? (
                <>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 19l-7-7 7-7" />
                </>
              ) : (
                <>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 5l7 7-7 7" />
                </>
              )}
            </svg>
          </button>
          <a
            href="#/manuscripts"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              setActivePage("manuscripts");
            }}
            className={`flex w-full rounded-xl px-1 pb-2 pt-1 transition hover:bg-white/5 ${
              sidebarExpanded ? "justify-center" : "justify-center md:pt-1"
            }`}
            aria-label="PaperPilot, go to My Manuscripts"
          >
            {sidebarExpanded ? (
              <PaperPilotLogo tone="dark" />
            ) : (
              <>
                <span className="md:hidden">
                  <PaperPilotLogo tone="dark" />
                </span>
                <PaperPilotMark className="hidden h-10 w-10 md:block" />
              </>
            )}
          </a>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="absolute right-0 top-0 grid h-8 w-8 place-items-center rounded-lg border border-slate-600/60 bg-[#1a2943] text-slate-300 transition hover:bg-[#243552] hover:text-white md:hidden"
            aria-label="Hide sidebar"
            title="Hide sidebar"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className={`mt-8 flex flex-col ${sidebarExpanded ? "" : "md:items-stretch"}`}>
          <p className={`px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600 ${navLabelClass}`}>
            Dashboard
          </p>
          <a
            href="#/manuscripts"
            title="My Manuscripts"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              setActivePage("manuscripts");
            }}
            className={`mt-2 ${navItemClass(activePage === "manuscripts")}`}
          >
            <span className="grid h-5 w-5 shrink-0 place-items-center text-base leading-none" aria-hidden>
              ▣
            </span>
            <span className={navLabelClass}>My Manuscripts</span>
          </a>
          {hasComplianceResult ? (
            <a
              href="#/results"
              title="Compliance Result"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                openComplianceResult();
              }}
              className={`mt-0.5 ${navItemClass(viewingComplianceResult)} ${
                sidebarExpanded ? "pl-11" : "md:hidden max-md:pl-11"
              }`}
            >
              <span className={navLabelClass}>Compliance Result</span>
            </a>
          ) : null}
          <a
            href="#/upload"
            title="Upload & Analyze"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              openUploadMechanics();
            }}
            className={`mt-1 font-semibold ${navItemClass(activePage === "upload" && !viewingComplianceResult)}`}
          >
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-[#22c9b4]" aria-hidden>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-6" />
                <path strokeLinecap="round" strokeLinejoin="round" d="m9 15 3-3 3 3" />
              </svg>
            </span>
            <span className={navLabelClass}>Upload &amp; Analyze</span>
          </a>
        </nav>

        <nav className="mt-auto flex flex-col">
          <p className={`px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600 ${navLabelClass}`}>
            Settings
          </p>
          <a
            href="#/account"
            title="Account"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              setActivePage("account");
            }}
            className={`mt-2 ${navItemClass(activePage === "account" || activePage === "subscription")}`}
          >
            <span className="grid h-5 w-5 shrink-0 place-items-center text-base leading-none" aria-hidden>
              ♟
            </span>
            <span className={navLabelClass}>Account</span>
          </a>
          <button
            type="button"
            title="Sign Out"
            className={`mt-6 flex w-full items-center text-sm font-medium text-rose-400 transition hover:text-rose-300 ${
              sidebarExpanded ? "gap-2 px-3 py-2 text-left" : "justify-center px-2 py-2 md:justify-center max-md:gap-2 max-md:px-3 max-md:text-left"
            }`}
            onClick={doSignOut}
          >
            <span aria-hidden>↪</span>
            <span className={navLabelClass}>Sign Out</span>
          </button>
        </nav>
      </aside>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className={`sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3 md:px-8 ${hidePageHeading ? "min-h-16" : ""}`}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-[#172033] md:hidden"
            aria-label="Show sidebar"
            title="Show sidebar"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>
          {activePage === "manuscripts" && manuscriptDetailOpen ? (
            <BackToDashboardButton
              onClick={() => closeManuscriptDetailRef.current?.()}
            />
          ) : !hidePageHeading ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{breadcrumb}</p>
            <div className="flex flex-wrap items-center gap-2.5">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-[#172033]">{pageTitle}</h1>
              </div>
              {activePage === "notifications" && notificationUnread > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f3ff] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#2f6fed]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#16bfa8]" />
                  {notificationUnread} new
                </span>
              )}
            </div>
            {activePage === "upload" &&
            (scanFlow.step === "results" || scanFlow.step === "tracing") ? (
              <BackToDashboardButton onClick={handleBackToDashboard} className="mt-1" />
            ) : null}
          </div>
          ) : null}
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          {activePage !== "notifications" && activePage !== "subscription" ? (
            <div className="text-right">
              <p className="text-xs font-semibold capitalize text-slate-700">{tier} plan</p>
              <p className="text-[10px] text-slate-400">
                {remaining} of {limit} scans remaining this {resetWindow(tier)}
              </p>
            </div>
          ) : null}
          <div className="relative" ref={notificationsRootRef}>
          <button
            type="button"
            onClick={() => setNotificationsOpen((open) => !open)}
            className={`relative grid h-9 w-9 place-items-center rounded-full transition ${
              notificationsOpen
                ? "bg-amber-100 text-amber-600"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
            aria-expanded={notificationsOpen}
            aria-haspopup="dialog"
            aria-label={
              notificationsOpen
                ? "Close notifications"
                : notificationUnread
                  ? `Open notifications, ${notificationUnread} unread`
                  : "Open notifications"
            }
            title={notificationsOpen ? "Close notifications" : "Notifications"}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <path d="M12 2a7 7 0 0 0-7 7v.7c0 1.5-.4 3-.9 4.3l-.5 1.2a1 1 0 0 0 .9 1.4h15a1 1 0 0 0 .9-1.4l-.5-1.2A11 11 0 0 1 19 9.7V9a7 7 0 0 0-7-7Zm0 20a3 3 0 0 0 2.8-2H9.2A3 3 0 0 0 12 22Z" />
            </svg>
            {notificationUnread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">
                {notificationUnread > 9 ? "9+" : notificationUnread}
              </span>
            )}
          </button>
          {notificationsOpen && (
            <div className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-1.5rem))]">
              <NotificationsScreen
                items={notifications}
                unread={notificationUnread}
                onMarkAllRead={() => persistNotifications(markAllRead(notifications))}
                onMarkRead={(id) => persistNotifications(markOneRead(notifications, id))}
                onDelete={(id) => persistNotifications(removeNotification(notifications, id))}
              />
            </div>
          )}
          </div>
          <button className="text-sm text-slate-500 md:hidden" onClick={doSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="w-full p-5 md:p-8">

        {/* ── Global API error dialog ─────────────────────────────────────── */}
        <ConfirmDialog
          open={Boolean(error)}
          title="Something went wrong"
          message={error}
          confirmLabel="OK"
          cancelLabel={null}
          tone="danger"
          onConfirm={() => setError("")}
          onCancel={() => setError("")}
        />

        {/* ══════════════════════════════════════════════════════════════════
            ACCOUNT SETTINGS PAGE
        ═══════════════════════════════════════════════════════════════════ */}
        {activePage === "account" && (
          <AccountSettingsScreen
            user={user}
            tier={tier}
            onSignOut={doSignOut}
            onManageSubscription={() => setActivePage("subscription")}
          />
        )}

        {activePage === "subscription" && (
          <SubscriptionScreen
            subscription={subscription}
            billingReturn={billingReturn}
            onBillingSettled={() => setBillingReturn(null)}
            onSubscriptionChange={(next, opts) => {
              storeSubscription(next, undefined, opts);
              const note = notificationFromSubscription(next);
              if (note) appendNotifications(note);
            }}
            onBack={() => setActivePage("account")}
            onBackToDashboard={handleBackToDashboard}
          />
        )}

        {activePage === "manuscripts" && (
          loading ? (
            <div className="grid min-h-64 place-items-center rounded-xl border border-slate-200 bg-white text-sm text-slate-400">
              <div className="flex flex-col items-center gap-3">
                <PaperPlaneLoader className="h-32 w-56" />
                Loading your compliance workspace…
              </div>
            </div>
          ) : (
          <MyManuscriptsScreen
            items={scannedLibrary}
            onItemsChange={updateScannedLibrary}
            tier={tier}
            onDetailOpenChange={setManuscriptDetailOpen}
            closeDetailRef={closeManuscriptDetailRef}
            onUpgrade={(message) =>
              setUpgradeMessage(
                message ||
                  "Older manuscript versions are available on Premium. Upgrade to view full version history."
              )
            }
            onUploadNew={beginFreshUpload}
            resolveSavedResult={resolveSavedResult}
            onOpenSavedResult={async (manuscript, version) => {
              const saved = await resolveSavedResult(manuscript, version);
              if (!saved) return;
              setActivePage("upload");
              scanFlow.showSavedResult(saved, version?.versionNumber);
              if (saved.cloudinaryUrl || !isServerId(saved.scanId)) return;
              getScanDocument(saved.scanId)
                .then((doc) => {
                  const url = String(doc?.cloudinary_url || "").trim();
                  if (!url) return;
                  const patch = {
                    cloudinaryUrl: url,
                    documentName: saved.documentName || doc?.source_filename || "",
                    versionId: saved.versionId || doc?.manuscript_version_id || "",
                  };
                  scanFlowRef.current?.patchResult(patch);
                  updateScannedLibrary(
                    scannedLibraryRef.current.map((m) =>
                      m.id !== manuscript.id
                        ? m
                        : {
                            ...m,
                            versions: (m.versions || []).map((v) =>
                              v.id === version.id && v.scanResult
                                ? { ...v, scanResult: { ...v.scanResult, ...patch } }
                                : v
                            ),
                          }
                    )
                  );
                })
                .catch(() => {});
            }}
            onPermanentDelete={async (manuscript) => {
              const title = manuscript?.title || "";
              const titleKey = normalizeTitle(title);
              await deleteManuscriptRequest({
                manuscriptId: manuscript?.serverManuscriptId || manuscript?.id,
                title,
              });
              setManuscripts((list) =>
                list.filter(
                  (item) =>
                    item.id !== manuscript?.id &&
                    item.id !== manuscript?.serverManuscriptId &&
                    normalizeTitle(item.title) !== titleKey
                )
              );
              updateScannedLibrary(
                scannedLibraryRef.current.filter(
                  (item) => item.id !== manuscript?.id && normalizeTitle(item.title) !== titleKey
                )
              );
            }}
          />
          )
        )}

        {/* ══════════════════════════════════════════════════════════════════
            SCAN FLOW — takes over the main area; sidebar + header stay visible
        ═══════════════════════════════════════════════════════════════════ */}
        {/* Kept mounted while on other pages so an in-progress upload (step, picked file, title) survives. */}
        <div hidden={activePage !== "upload"}>

        {/* ── Results screen (opened directly when analysis completes) ────── */}
        {(scanFlow.step === "results" || scanFlow.step === "tracing") && (
          <ScanResultsScreen
            result={scanFlow.result}
            versionNumber={scanFlow.versionNumber}
            file={resultFile}
            documentLoading={resultDocumentLoading}
            downloadBusy={scanFlow.downloadBusy}
            downloadError={scanFlow.downloadError}
            onDownload={scanFlow.downloadReport}
          />
        )}

        {/* ── Analysing state ────────────────────────────────────────────── */}
        {scanFlow.step === "analyzing" && (
          <div className="relative flex min-h-[60vh] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-10 shadow-sm">
            <div
              aria-hidden={departPhase === "fly"}
              className={`flex w-full max-w-md flex-col items-center gap-5 text-center transition-opacity duration-200 ${
                departPhase === "fly" ? "pointer-events-none opacity-0" : "opacity-100"
              }`}
            >
              <PaperRollAnimation className="h-44 w-44" />
              <p className="text-base font-bold text-slate-800">
                {String(scanFlow.scanProgress.stage || "").toLowerCase() === "done"
                  ? "Analysis complete"
                  : "Analysing your document…"}
              </p>
              <AnalysisProgress progress={scanFlow.scanProgress} percent={analysisShown} />
            </div>
            {departPhase === "fly" ? (
              <PaperCarryAway
                onDone={() => {
                  flightFinishedRef.current = true;
                  if (resultReadyRef.current) revealSummaryRef.current?.();
                }}
              />
            ) : null}
          </div>
        )}

        {/* ── Scan error state ───────────────────────────────────────────── */}
        {scanFlow.step === "error" && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-8 text-center shadow-sm">
            <p className="text-lg font-bold text-rose-700">Analysis failed</p>
            <p className="mt-2 text-sm text-rose-500">{scanFlow.error}</p>
            <button
              type="button"
              onClick={scanFlow.retry}
              className="mt-6 rounded-lg bg-rose-600 px-7 py-2.5 text-xs font-bold text-white hover:bg-rose-700"
            >
              Try again
            </button>
          </div>
        )}

        {/* ── Upload flow (idle / fileSelected) ──────────────────────────── */}
        {(scanFlow.step === "idle" || scanFlow.step === "fileSelected") && (
          <>
                {uploadWizardStep === 1 && (
                  <MechanicsPanel
                    items={mechanics}
                    selectedId={selectedMechanicsId}
                    onSelect={(id) => {
                      setSelectedMechanicsId(id);
                      setCurrentVersion(null);
                    }}
                    onExtract={onMechanicsExtract}
                    onSaveProfile={onMechanicsSaveProfile}
                    onUpdateProfile={onMechanicsUpdateProfile}
                    onRename={onMechanicsRename}
                    onDelete={onMechanicsDelete}
                    onContinue={() => advanceUploadWizard(2)}
                    onShowSteps={() => setJourneyOpen(true)}
                    busy={mechanicsBusy}
                    tier={tier}
                  />
                )}

                {uploadWizardStep === 2 && (
                  <ManuscriptPanel
                    mechanicsSelected={Boolean(selectedMechanicsId)}
                    manuscripts={uploadTargets}
                    onSelectManuscript={selectUploadTarget}
                    onUpload={onManuscriptUpload}
                    onPreview={previewManuscript}
                    uploadCancelKey={uploadCancelKey}
                    onCancel={() => {
                      cancelManuscriptUpload();
                      setUploadWizardStep(1);
                    }}
                    onFilePick={() => {
                      // Picking a file alone must not open File details.
                      setManuscriptReady(false);
                      setFileDetailsNotice("");
                      setCurrentVersion(null);
                      scanFlow.selectFile(null);
                      setWizardMaxStep((max) => Math.min(max, 2));
                    }}
                    onShowSteps={() => setJourneyOpen(true)}
                    busy={manuscriptBusy}
                    tier={tier}
                  />
                )}

                {uploadWizardStep === 3 && manuscriptReady && (currentVersion || scanFlow.file) && (
              <section
                ref={fileDetailsRef}
                id="file-details"
                className={`w-full scroll-mt-6 rounded-xl border bg-white p-6 shadow-sm transition md:p-8 ${
                  fileDetailsNotice
                    ? "border-[#16bfa8] ring-2 ring-[#16bfa8]/25"
                    : "border-slate-200"
                }`}
              >
                <ShowStepsRow step={3} onShowSteps={() => setJourneyOpen(true)} />
                <div className="mt-1 border-b border-slate-100 pb-4">
                  <h2 className="text-lg font-bold text-[#172033]">File details</h2>
                </div>

                {fileDetailsNotice && (
                  <div
                    className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3"
                    role="status"
                  >
                    <p className="text-sm font-bold text-emerald-800">{fileDetailsNotice}</p>
                    <p className="mt-0.5 text-xs text-emerald-700">
                      Review the files below, then click Upload &amp; Analyse to scan — or Cancel upload to discard.
                    </p>
                  </div>
                )}

                <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Files attached
                </p>
                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                  {/* Format Mechanics */}
                  <div>
                    <p className="mb-2 text-xs font-semibold text-slate-600">Format Mechanics</p>
                    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-[#fafbfc] p-4">
                      <FileTypeIcon
                        fileType={selectedMechanics?.file_type}
                        filename={
                          selectedMechanics?.source_filename ||
                          selectedMechanics?.filename ||
                          selectedMechanics?.name
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-700">
                          {selectedMechanics?.source_filename || selectedMechanics?.filename || selectedMechanics?.name || "No format guide selected"}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {selectedMechanics?.name ? selectedMechanics.name : "Format guide"}
                        </p>
                      </div>
                      {selectedMechanics ? (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-semibold text-emerald-700">✓ Ready</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold text-slate-400">Needed</span>
                      )}
                    </div>
                  </div>

                  {/* Academic Document */}
                  <div>
                    <p className="mb-2 text-xs font-semibold text-slate-600">Academic Document</p>
                    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-[#fafbfc] p-4">
                      <FileTypeIcon
                        fileType={currentVersion?.file_type}
                        filename={
                          scanFlow.file?.name ||
                          currentVersion?.source_filename ||
                          currentVersion?.filename
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-700">
                          {scanFlow.file?.name ||
                            currentVersion?.source_filename ||
                            currentVersion?.filename ||
                            "No manuscript uploaded"}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {scanFlow.file?.size ? `${formatFileSize(scanFlow.file.size)} · ` : ""}
                          {currentManuscript?.title || "Manuscript"}
                        </p>
                      </div>
                      {scanReady ? (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-semibold text-emerald-700">
                          ✓ Ready to scan
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold text-slate-400">
                          Needed
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Version label (only when a real API version exists) */}
                {currentVersion && (
                  <div className="mt-5 max-w-xs">
                    <label className="text-xs font-semibold text-slate-600">Version label</label>
                    <div className="mt-2 rounded-lg border border-slate-200 bg-[#f8f9fb] px-4 py-3 text-xs font-medium text-slate-400">
                      v{Number(currentVersion.version_number || scanFlow.versionNumber || 1)}.0
                    </div>
                  </div>
                )}

                {/* Action row */}
                <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-5">
                  <button
                    type="button"
                    onClick={() => setFileDetailsConfirm("cancel")}
                    className="rounded-lg border border-slate-200 bg-white px-7 py-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel upload
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const scanStyle = supportedCitationStyle(selectedMechanics?.rules?.citation_style);
                      if (!isPaidTier(tier) && scanStyle && scanStyle !== "APA") {
                        setUpgradeMessage(
                          `${scanStyle} citation checks are available on Premium and Pro. The Free plan checks APA only — change this format's citation style to APA, or upgrade.`
                        );
                        return;
                      }
                      if (remaining <= 0) {
                        setUpgradeMessage(
                          `You have used all ${limit} scans included in your ${planName(tier)} plan this ${resetWindow(tier)}.` +
                            (subscription?.reset_at
                              ? ` Your scans reset on ${new Date(subscription.reset_at).toLocaleDateString()}.`
                              : "")
                        );
                        return;
                      }
                      setFileDetailsConfirm("analyse");
                    }}
                    disabled={!scanReady || !selectedMechanicsId}
                    className="inline-flex min-w-44 items-center justify-center gap-2 rounded-lg bg-[#16bfa8] px-7 py-3 text-xs font-bold text-white shadow-sm hover:bg-[#12ae99] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Analyse document
                  </button>
                </div>

                {/* File error from scanFlow */}
                {scanFlow.fileError && (
                  <p className="mt-3 text-xs text-rose-500" role="alert">{scanFlow.fileError}</p>
                )}
              </section>
                )}

                {uploadWizardStep === 3 && !(manuscriptReady && (currentVersion || scanFlow.file)) && (
                  <div className="w-full rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                    <p className="text-sm font-semibold text-slate-700">No manuscript ready yet</p>
                    <p className="mt-1 text-xs text-slate-400">Upload a manuscript in Step 2 to continue.</p>
                    <button
                      type="button"
                      onClick={() => goToUploadWizardStep(2)}
                      className="mt-4 rounded-lg bg-[#16bfa8] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#12ae99]"
                    >
                      Back to Upload Manuscript
                    </button>
                  </div>
                )}
          </>
        )}
        </div>{/* close upload wrapper */}
      </main>

      <ConfirmDialog
        open={Boolean(fileDetailsConfirm)}
        title={
          fileDetailsConfirm === "cancel"
            ? "Cancel this upload?"
            : "Analyse this document?"
        }
        message={
          fileDetailsConfirm === "cancel"
            ? "The staged manuscript will be discarded and you will return to Upload Manuscript. This cannot be undone."
            : `Check “${currentManuscript?.title || "this manuscript"}” against the selected format mechanics? This uses 1 scan from your plan.`
        }
        confirmLabel={fileDetailsConfirm === "cancel" ? "Cancel upload" : "Start analysis"}
        tone={fileDetailsConfirm === "cancel" ? "danger" : "primary"}
        busy={fileDetailsConfirmBusy}
        onCancel={() => {
          if (fileDetailsConfirmBusy) return;
          setFileDetailsConfirm(null);
        }}
        onConfirm={async () => {
          if (!fileDetailsConfirm) return;
          setFileDetailsConfirmBusy(true);
          try {
            if (fileDetailsConfirm === "cancel") {
              cancelManuscriptUpload();
              setFileDetailsConfirm(null);
              return;
            }
            if (!scanReady) {
              setFileDetailsConfirm(null);
              setError("Wait until the manuscript finishes uploading, then analyse.");
              return;
            }
            setFileDetailsNotice("");
            setFileDetailsConfirm(null);
            scanFlow.analyze();
          } finally {
            setFileDetailsConfirmBusy(false);
          }
        }}
      />

      <UploadJourneyModal open={journeyOpen} current={uploadWizardStep} onClose={dismissJourney} />

      <UpgradePrompt
        message={upgradeMessage}
        tier={tier}
        onClose={() => setUpgradeMessage("")}
        onUpgrade={() => {
          setUpgradeMessage("");
          setActivePage("subscription");
        }}
      />
    </div>
  );
}
