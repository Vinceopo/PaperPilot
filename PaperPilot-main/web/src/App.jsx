import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, firebaseReady } from "./firebase.js";
import {
  deleteMechanics as deleteMechanicsRequest,
  extractMechanics,
  getSubscription,
  listManuscripts,
  listMechanics,
  previewManuscript,
  renameMechanics as renameMechanicsRequest,
  saveMechanicsProfile,
  uploadManuscriptVersion,
} from "./api.js";
import AuthScreen from "./components/AuthScreen.jsx";
import RegistrationSuccessScreen from "./components/auth/RegistrationSuccessScreen.jsx";
import MechanicsPanel from "./components/cockpit/MechanicsPanel.jsx";
import ManuscriptPanel from "./components/cockpit/ManuscriptPanel.jsx";
import ScanResultsScreen from "./components/cockpit/ScanResultsScreen.jsx";
import AccountSettingsScreen from "./components/cockpit/AccountSettingsScreen.jsx";
import MyManuscriptsScreen from "./components/cockpit/MyManuscriptsScreen.jsx";
import SubscriptionScreen from "./components/cockpit/SubscriptionScreen.jsx";
import NotificationsScreen from "./components/cockpit/NotificationsScreen.jsx";
import UpgradePrompt from "./components/cockpit/UpgradePrompt.jsx";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import Spinner from "./components/Spinner.jsx";
import { useScanFlow } from "./hooks/useScanFlow.js";
import {
  loadScannedManuscripts,
  normalizeTitle,
  saveScannedManuscripts,
  upsertFromScanResult,
} from "./lib/scannedLibrary.js";
import {
  loadNotifications,
  saveNotifications,
  unreadCount,
  markAllRead,
  markOneRead,
  pushNotification,
  notificationFromScan,
  notificationFromSubscription,
  notificationFromUpload,
} from "./lib/notifications.js";

function itemsFrom(data, key) {
  if (Array.isArray(data)) return data;
  return data?.[key] || data?.items || [];
}

const REGISTRATION_SUCCESS_KEY = "paperpilot.registrationSuccess";

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
  const [guest, setGuest] = useState(false);
  const [authReady, setAuthReady] = useState(!firebaseReady);
  const [mechanics, setMechanics] = useState([]);
  const [selectedMechanicsId, setSelectedMechanicsId] = useState("");
  const [manuscripts, setManuscripts] = useState([]);
  const [currentManuscript, setCurrentManuscript] = useState(null);
  const [currentVersion, setCurrentVersion] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mechanicsBusy, setMechanicsBusy] = useState(false);
  const [manuscriptBusy, setManuscriptBusy] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState("");
  const [registrationSuccess, setRegistrationSuccess] = useState(() => pendingRegistration());
  const [activePage, setActivePage] = useState("upload"); // "upload" | "manuscripts" | "account" | "subscription" | "notifications"
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [scannedLibrary, setScannedLibrary] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const lastSavedScanKey = useRef("");
  const scannedLibraryRef = useRef([]);
  const notificationsRef = useRef([]);
  const fileDetailsRef = useRef(null);
  const [fileDetailsNotice, setFileDetailsNotice] = useState("");
  const [manuscriptReady, setManuscriptReady] = useState(false);
  const [fileDetailsFocusKey, setFileDetailsFocusKey] = useState(0);
  const [uploadCancelKey, setUploadCancelKey] = useState(0);
  const [uploadWizardStep, setUploadWizardStep] = useState(1); // 1 | 2 | 3
  const [wizardMaxStep, setWizardMaxStep] = useState(1);
  const [fileDetailsConfirm, setFileDetailsConfirm] = useState(null); // "cancel" | "analyse" | null
  const [fileDetailsConfirmBusy, setFileDetailsConfirmBusy] = useState(false);
  const uploadSessionRef = useRef(0);
  const signedIn = Boolean(user) && !guest;

  function handleBackToDashboard() {
    setManuscriptReady(false);
    setFileDetailsNotice("");
    setCurrentVersion(null);
    resetUploadWizard(1);
    scanFlow.backToDashboard();
  }

  const WIZARD_STEPS = [
    { step: 1, label: "Upload Format Mechanics" },
    { step: 2, label: "Upload Manuscript" },
    { step: 3, label: "File Details" },
  ];

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

  function cancelManuscriptUpload() {
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

  const getActiveManuscript = useCallback(() => {
    const m = currentManuscriptRef.current;
    if (!m) return null;
    return { id: m.id, title: m.title };
  }, []);

  const scanFlow = useScanFlow({
    mechanicsId: selectedMechanicsId,
    resolveManuscript,
    getActiveManuscript,
  });

  useEffect(() => {
    if (!fileDetailsFocusKey || !manuscriptReady) return;
    const t = window.setTimeout(() => {
      fileDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(t);
  }, [fileDetailsFocusKey, manuscriptReady, currentVersion, scanFlow.file]);

  useEffect(() => {
    const loaded = loadScannedManuscripts(user?.uid);
    setScannedLibrary(loaded);
    // Persist merged rows if older duplicates were cleaned up.
    if (loaded.length) saveScannedManuscripts(loaded, user?.uid);
    lastSavedScanKey.current = "";
    setNotifications(loadNotifications(user?.uid));
  }, [user?.uid]);

  useEffect(() => {
    if (scanFlow.step !== "results" || !scanFlow.result) return;
    const key = `${scanFlow.result.documentId}|${scanFlow.versionNumber}|${scanFlow.result.scannedAt || ""}`;
    if (lastSavedScanKey.current === key) return;
    lastSavedScanKey.current = key;
    setScannedLibrary((prev) => {
      const next = upsertFromScanResult(prev, scanFlow.result, scanFlow.versionNumber);
      saveScannedManuscripts(next, user?.uid);
      return next;
    });
    appendNotifications(notificationFromScan(scanFlow.result, scanFlow.versionNumber));
  }, [scanFlow.step, scanFlow.result, scanFlow.versionNumber, user?.uid]);

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

  const updateScannedLibrary = useCallback(
    (next) => {
      setScannedLibrary(next);
      saveScannedManuscripts(next, user?.uid);
      setCurrentManuscript((current) => {
        if (current?.id && !next.some((m) => m.id === current.id)) {
          setCurrentVersion(null);
          setManuscriptReady(false);
          setFileDetailsNotice("");
          return null;
        }
        return current;
      });
    },
    [user?.uid]
  );

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return undefined;
    }
    const unsub = onAuthStateChanged(auth, (next) => {
      setUser(next);
      if (next) {
        setGuest(false);
        setRegistrationSuccess(pendingRegistration(next));
      }
      setAuthReady(true);
    });

    // If this account's tokens were revoked (password change on any device),
    // force a refresh so Firebase signs the user out immediately.
    async function dropRevokedSession() {
      const current = auth.currentUser;
      if (!current) return;
      try {
        await current.getIdToken(true);
      } catch {
        await signOut(auth).catch(() => {});
        setUser(null);
      }
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") dropRevokedSession();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", dropRevokedSession);

    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", dropRevokedSession);
    };
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!auth?.currentUser) return;
    setLoading(true);
    setError("");
    try {
      const [mechanicsData, manuscriptsData, subscriptionData] = await Promise.all([
        listMechanics(),
        listManuscripts(),
        getSubscription(),
      ]);
      const nextMechanics = itemsFrom(mechanicsData, "mechanics");
      const nextManuscripts = itemsFrom(manuscriptsData, "manuscripts");
      setMechanics(nextMechanics);
      setManuscripts(nextManuscripts);
      setSubscription(subscriptionData);
      setSelectedMechanicsId((current) => current || nextMechanics[0]?.id || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (signedIn) loadDashboard();
  }, [signedIn, loadDashboard]);

  function handleGateError(err) {
    if (err?.code === "upgrade_required" || err?.detail?.code === "upgrade_required") {
      setUpgradeMessage(err.message);
      return true;
    }
    return false;
  }

  async function onMechanicsExtract(file) {
    setError("");
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
      });
      const data = await listMechanics();
      const next = itemsFrom(data, "mechanics");
      setMechanics(next);
      setSelectedMechanicsId(created.id || next[0]?.id || "");
      return true;
    } catch (err) {
      // Don't swallow — re-throw so the confirm dialog can display the error.
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
      setMechanics((current) =>
        current.map((item) => (item.id === mechanicsId ? updated : item))
      );
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
      await deleteMechanicsRequest(mechanicsId);
      const remainingItems = mechanics.filter((item) => item.id !== mechanicsId);
      setMechanics(remainingItems);
      if (selectedMechanicsId === mechanicsId) {
        setSelectedMechanicsId(remainingItems[0]?.id || "");
        setCurrentVersion(null);
        setCurrentManuscript(null);
      }
      return true;
    } catch (err) {
      setError(err.message);
      return false;
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

    // Unique titles only when creating a new manuscript (case-insensitive).
    // Source of truth = My Manuscripts library (shared with Upload choices).
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

    // Prefer existing library entry when uploading a new version.
    const libraryEntry = manuscriptId
      ? scannedLibraryRef.current.find((m) => m.id === manuscriptId)
      : null;
    const nextId = manuscriptId || `local-${Date.now()}`;
    const nextVersionNumber = libraryEntry
      ? Math.max(0, ...(libraryEntry.versions || []).map((v) => Number(v.versionNumber) || 0)) + 1
      : 1;

    // Show File details immediately — do not wait on API parsing.
    scanFlow.selectFile(file);
    setCurrentManuscript({
      id: nextId,
      title: resolvedTitle,
    });
    setCurrentVersion({
      id: `local-ver-${Date.now()}`,
      source_filename: file.name,
      filename: file.name,
      version_number: nextVersionNumber,
    });
    setManuscriptReady(true);
    advanceUploadWizard(3);
    focusFileDetails("Manuscript uploaded completely and ready to scan.");
    setManuscriptBusy(false);
    appendNotifications(notificationFromUpload(resolvedTitle, nextVersionNumber));

    // Resolve the Firebase manuscript id for version uploads.
    // Library rows often use local-/doc- ids after mock scans — match the API row by title.
    const isServerId = (id) =>
      Boolean(id) &&
      !String(id).startsWith("local-") &&
      !String(id).startsWith("doc-");

    const resolveApiManuscriptId = () => {
      if (isServerId(libraryEntry?.serverManuscriptId)) {
        return libraryEntry.serverManuscriptId;
      }
      if (isServerId(manuscriptId)) return manuscriptId;
      const titleKey = normalizeTitle(resolvedTitle);
      const fromApi = manuscripts.find(
        (m) => normalizeTitle(m.title) === titleKey && isServerId(m.id)
      );
      return fromApi?.id || "";
    };

    // Sync to the API in the background without blocking File details.
    void (async () => {
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
          // Version upload with a local library id can miss the server id — retry by title.
          const isConflict =
            firstErr?.status === 409 || /already exists/i.test(firstErr?.message || "");
          if (!isConflict || !manuscriptId) throw firstErr;

          const titleKey = normalizeTitle(resolvedTitle);
          const fromApi = (await listManuscripts().catch(() => null));
          const apiList = itemsFrom(fromApi, "manuscripts");
          if (apiList.length) setManuscripts(apiList);
          const matched = apiList.find(
            (m) => normalizeTitle(m.title) === titleKey && isServerId(m.id)
          );
          if (!matched?.id) throw firstErr;

          apiManuscriptId = matched.id;
          created = await uploadManuscriptVersion({
            file,
            title: resolvedTitle,
            manuscriptId: apiManuscriptId,
            mechanicsId: selectedMechanicsId,
          });
        }

        // Cancel abandoned this staging session — ignore late API results.
        if (uploadSessionRef.current !== sessionId) return;

        const version = created.version || {
          id: created.version_id,
          manuscript_id: created.manuscript_id || apiManuscriptId || nextId,
          version_number: created.version_number,
          source_filename: created.source_filename || created.filename || file.name,
          page_count: created.page_count,
        };
        const manuscript = created.manuscript || created.created_manuscript || {
          id: version.manuscript_id || created.manuscript_id || nextId,
          title: resolvedTitle,
        };
        const resolvedId = manuscript.id || version.manuscript_id || apiManuscriptId || nextId;
        // Keep library id stable when this was an existing My Manuscripts entry.
        setCurrentManuscript({
          id: manuscriptId || resolvedId,
          title: manuscript.title || resolvedTitle,
        });
        setCurrentVersion({
          ...version,
          version_number: version.version_number || nextVersionNumber,
        });

        // Remember the server id on the library row so later versions attach correctly.
        if (manuscriptId && isServerId(resolvedId)) {
          setScannedLibrary((prev) => {
            const next = prev.map((m) =>
              m.id === manuscriptId || normalizeTitle(m.title) === normalizeTitle(resolvedTitle)
                ? { ...m, serverManuscriptId: resolvedId }
                : m
            );
            saveScannedManuscripts(next, user?.uid);
            return next;
          });
        }

        const data = await listManuscripts();
        if (uploadSessionRef.current !== sessionId) return;
        setManuscripts(itemsFrom(data, "manuscripts"));
      } catch (err) {
        if (uploadSessionRef.current !== sessionId) return;
        if (err?.status === 409 || /already exists/i.test(err?.message || "")) {
          // Only block brand-new manuscripts; version uploads should never land here.
          if (!manuscriptId) {
            setError(err.message || "A manuscript with this title already exists.");
            setManuscriptReady(false);
            setFileDetailsNotice("");
            setCurrentVersion(null);
            scanFlow.selectFile(null);
          } else {
            console.warn(
              "Version upload hit a title conflict after retry; scan remains available from File details.",
              err
            );
          }
          return;
        }
        if (!handleGateError(err)) {
          console.warn("Manuscript API upload failed; scan remains available from File details.", err);
        }
      }
    })();

    return true;
  }

  if (!authReady) {
    return <div className="grid min-h-screen place-items-center bg-navy text-sm text-slate-400">Loading…</div>;
  }

  if (!signedIn && !guest) {
    return <AuthScreen onContinueAsGuest={() => setGuest(true)} />;
  }

  if (guest) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 p-6 text-slate-100">
        <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-7 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">PaperPilot</p>
          <h1 className="mt-3 text-2xl font-semibold">Sign in to scan manuscripts</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Mechanics, versions, scan allowances, and saved results are tied to your account.
          </p>
          <button onClick={() => setGuest(false)} className="mt-6 w-full rounded-xl bg-emerald-400 py-3 font-semibold text-slate-950">
            Go to sign in
          </button>
        </div>
      </div>
    );
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
  const limit = Number(subscription?.limit ?? (tier === "premium" ? 50 : 3));
  const remaining = Number(subscription?.remaining ?? Math.max(limit - used, 0));
  const selectedMechanics = mechanics.find((item) => item.id === selectedMechanicsId);

  async function doSignOut() {
    try {
      await signOut(auth);
    } catch {
      // Already signed out.
    }
    setUser(null);
  }

  // Page metadata driven by activePage
  const uploadWizardActive =
    activePage === "upload" &&
    (scanFlow.step === "idle" || scanFlow.step === "fileSelected");
  const pageTitle =
    activePage === "account"
      ? "Account Settings"
      : activePage === "subscription"
        ? "Upgrade to Premium"
        : activePage === "notifications"
          ? "Notifications"
          : activePage === "manuscripts"
            ? "My Manuscripts"
            : activePage === "upload" && scanFlow.step === "results"
              ? "Scan Results"
              : activePage === "upload" && scanFlow.step === "analyzing"
                ? "Analysing Document"
                : activePage === "upload" && scanFlow.step === "error"
                  ? "Analysis Failed"
                  : "Upload Manuscript";
  const breadcrumb =
    activePage === "account"
      ? "Dashboard / Settings"
      : activePage === "subscription"
        ? "Settings / Subscription"
        : activePage === "notifications"
          ? "Notification"
          : activePage === "manuscripts"
            ? "Dashboard / My Manuscripts"
            : "Dashboard";

  function openUploadPage() {
    setActivePage("upload");
  }

  return (
    <div className={`min-h-screen bg-[#f3f5f7] text-[#172033] transition-[padding] duration-300 ${sidebarOpen ? "md:pl-52" : "md:pl-0"}`}>
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-52 flex-col bg-[#101a30] px-4 py-5 text-white transition-transform duration-300 md:flex ${
          sidebarOpen ? "flex translate-x-0" : "hidden -translate-x-full md:hidden"
        }`}
      >
        <div className="relative flex items-center gap-2.5 px-2">
          <button
            type="button"
            onClick={openUploadPage}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            aria-label="Paper Pilot home"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-[#101a30]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                <path d="M5 5.5h9.5A4.5 4.5 0 0 1 19 10v8.5H9.5A4.5 4.5 0 0 1 5 14V5.5Z" stroke="currentColor" strokeWidth="1.8" />
                <path d="M8 9h7M8 12h7M8 15h4" stroke="#16bfa8" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold tracking-tight">PAPER PILOT</p>
              <p className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Compliance</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-600/60 bg-[#1a2943] text-slate-300 transition hover:bg-[#243552] hover:text-white"
            aria-label="Hide sidebar"
            title="Hide sidebar"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>
        </div>

        <nav className="mt-10">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Main menu</p>
          <button
            onClick={openUploadPage}
            className={`mt-2 flex w-full items-center gap-3 rounded-r-lg px-4 py-3 text-left text-sm font-semibold transition ${
              activePage === "upload"
                ? "border-l-2 border-[#16bfa8] bg-[#1a2943] text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <span className="text-[#22c9b4]">↑</span> Upload Manuscript
          </button>
          <button
            onClick={() => setActivePage("manuscripts")}
            className={`mt-1 flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition ${
              activePage === "manuscripts"
                ? "border-l-2 border-[#16bfa8] bg-[#1a2943] font-semibold text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <span>▣</span> My Manuscripts
          </button>
        </nav>

        <nav className="mt-auto">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Settings</p>
          <button
            onClick={() => setActivePage("account")}
            className={`mt-2 flex w-full items-center gap-3 rounded-r-lg px-4 py-3 text-left text-sm transition ${
              activePage === "account" || activePage === "subscription"
                ? "border-l-2 border-[#16bfa8] bg-[#1a2943] font-semibold text-white"
                : "text-slate-300 hover:text-white"
            }`}
          >
            <span>♟</span> Account
          </button>
          <button
            className="mt-6 flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-rose-400 hover:text-rose-300"
            onClick={doSignOut}
          >
            ↪ Sign Out
          </button>
        </nav>
      </aside>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex min-h-[76px] items-center justify-between border-b border-slate-200 bg-white px-5 md:px-8">
        <div className="flex items-center gap-3">
          {!sidebarOpen && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-[#172033]"
              aria-label="Show sidebar"
              title="Show sidebar"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
              </svg>
            </button>
          )}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{breadcrumb}</p>
            <div className="flex flex-wrap items-center gap-2.5">
              {uploadWizardActive ? (
                <nav
                  aria-label="Upload wizard"
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-bold tracking-tight md:text-xl"
                >
                  {WIZARD_STEPS.filter((item) => item.step <= wizardMaxStep).map((item, index) => {
                    const isCurrent = item.step === uploadWizardStep;
                    const canJump = !isCurrent && item.step <= wizardMaxStep;
                    return (
                      <span key={item.step} className="inline-flex items-center gap-2">
                        {index > 0 && (
                          <span className="font-semibold text-slate-300" aria-hidden="true">
                            /
                          </span>
                        )}
                        {canJump ? (
                          <button
                            type="button"
                            onClick={() => goToUploadWizardStep(item.step)}
                            className="text-[#16bfa8] transition hover:text-[#109b89] hover:underline"
                          >
                            {item.label}
                          </button>
                        ) : (
                          <span
                            className={isCurrent ? "text-[#172033]" : "text-slate-400"}
                            aria-current={isCurrent ? "step" : undefined}
                          >
                            {item.label}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </nav>
              ) : (
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-[#172033]">{pageTitle}</h1>
                  {activePage === "upload" && scanFlow.step === "results" && (
                    <button
                      type="button"
                      onClick={handleBackToDashboard}
                      className="mt-1 inline-flex items-center text-xs font-semibold text-slate-500 transition hover:text-[#172033]"
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                      </svg>
                      Back to Dashboard
                    </button>
                  )}
                </div>
              )}
              {activePage === "notifications" && notificationUnread > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f3ff] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#2f6fed]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#16bfa8]" />
                  {notificationUnread} new
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {activePage !== "notifications" && (
            <>
              <div className="hidden text-right lg:block">
                <p className="text-xs font-semibold capitalize text-slate-700">{tier} plan</p>
                <p className="text-[10px] text-slate-400">{remaining} of {limit} scans remaining</p>
              </div>
              <button
                type="button"
                onClick={() => setActivePage("subscription")}
                className="rounded-md bg-[#16bfa8] px-5 py-2.5 text-xs font-bold text-[#092823] shadow-sm hover:bg-[#12ae99]"
              >
                {tier === "premium" ? "Manage subscription" : "Subscribe to Premium"}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setActivePage("notifications")}
            className={`relative grid h-9 w-9 place-items-center rounded-full transition ${
              activePage === "notifications"
                ? "bg-amber-100 text-amber-600"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
            aria-label={
              notificationUnread
                ? `Notifications, ${notificationUnread} unread`
                : "Notifications"
            }
            title="Notifications"
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
          <button className="text-sm text-slate-500 md:hidden" onClick={doSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] p-5 md:p-8">

        {/* ── Global API error banner ─────────────────────────────────────── */}
        {error && (
          <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700" role="alert">
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="Dismiss error">✕</button>
          </div>
        )}

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
            onSubscriptionChange={(next) => {
              setSubscription(next);
              const note = notificationFromSubscription(next);
              if (note) appendNotifications(note);
            }}
            onBack={() => setActivePage("account")}
            onBackToDashboard={() => setActivePage("upload")}
          />
        )}

        {activePage === "notifications" && (
          <NotificationsScreen
            items={notifications}
            unread={notificationUnread}
            onMarkAllRead={() => persistNotifications(markAllRead(notifications))}
            onMarkRead={(id) => persistNotifications(markOneRead(notifications, id))}
          />
        )}

        {activePage === "manuscripts" && (
          <MyManuscriptsScreen
            items={scannedLibrary}
            onItemsChange={updateScannedLibrary}
            tier={tier}
            onUpgrade={(message) =>
              setUpgradeMessage(
                message ||
                  "Older manuscript versions are available on Premium. Upgrade to view full version history."
              )
            }
            onUploadNew={() => {
              resetUploadWizard(1);
              setActivePage("upload");
            }}
          />
        )}

        {/* ══════════════════════════════════════════════════════════════════
            SCAN FLOW — takes over the main area; sidebar + header stay visible
        ═══════════════════════════════════════════════════════════════════ */}
        {activePage === "upload" && (<>

        {/* ── Results screen ─────────────────────────────────────────────── */}
        {scanFlow.step === "results" && (
          <ScanResultsScreen
            result={scanFlow.result}
            versionNumber={scanFlow.versionNumber}
            downloadBusy={scanFlow.downloadBusy}
            downloadError={scanFlow.downloadError}
            onDownload={scanFlow.downloadReport}
            onUploadNewVersion={() => {
              setManuscriptReady(false);
              setFileDetailsNotice("");
              setCurrentVersion(null);
              // Keep currentManuscript so Upload can target the same paper as a new version.
              scanFlow.uploadNewVersion();
              resetUploadWizard(selectedMechanicsId ? 2 : 1);
            }}
            onBackToDashboard={handleBackToDashboard}
          />
        )}

        {/* ── Analysing state ────────────────────────────────────────────── */}
        {scanFlow.step === "analyzing" && (
          <div className="grid min-h-[60vh] place-items-center rounded-xl border border-slate-200 bg-white p-10 shadow-sm">
            <div className="flex flex-col items-center gap-5 text-center">
              <Spinner className="h-14 w-14 border-4 text-[#16bfa8]" />
              <div>
                <p className="text-base font-bold text-slate-800">Analysing your document…</p>
                <p className="mt-1 text-sm text-slate-400">
                  Checking fonts, spacing, margins, citations, and more.
                </p>
                <p className="mt-3 text-xs text-slate-400">
                  Format checks only — grammar and content are not evaluated.
                </p>
              </div>
            </div>
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
            {loading ? (
              <div className="grid min-h-64 place-items-center rounded-xl border border-slate-200 bg-white text-sm text-slate-400">
                <div className="flex flex-col items-center gap-3">
                  <Spinner className="h-8 w-8 border-[3px] text-[#16bfa8]" />
                  Loading your compliance workspace…
                </div>
              </div>
            ) : (
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
                    onRename={onMechanicsRename}
                    onDelete={onMechanicsDelete}
                    onContinue={() => advanceUploadWizard(2)}
                    busy={mechanicsBusy}
                  />
                )}

                {uploadWizardStep === 2 && (
                  <ManuscriptPanel
                    mechanicsSelected={Boolean(selectedMechanicsId)}
                    manuscripts={uploadTargets}
                    selectedManuscriptId={currentManuscript?.id || ""}
                    onSelectManuscript={selectUploadTarget}
                    onUpload={onManuscriptUpload}
                    onPreview={previewManuscript}
                    uploadCancelKey={uploadCancelKey}
                    onFilePick={() => {
                      // Picking a file alone must not open File details.
                      setManuscriptReady(false);
                      setFileDetailsNotice("");
                      setCurrentVersion(null);
                      scanFlow.selectFile(null);
                      setWizardMaxStep((max) => Math.min(max, 2));
                    }}
                    busy={manuscriptBusy}
                  />
                )}

                {uploadWizardStep === 3 && manuscriptReady && (currentVersion || scanFlow.file) && (
              <section
                ref={fileDetailsRef}
                id="file-details"
                className={`mx-auto max-w-4xl scroll-mt-6 rounded-xl border bg-white p-6 shadow-sm transition md:p-8 ${
                  fileDetailsNotice
                    ? "border-[#16bfa8] ring-2 ring-[#16bfa8]/25"
                    : "border-slate-200"
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#16bfa8]">Step 3 of 3</p>
                <div className="mt-1 border-b border-slate-100 pb-4">
                  <h2 className="text-lg font-bold text-[#172033]">File details</h2>
                  <p className="text-xs text-slate-400">Review attached files then run compliance analysis</p>
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
                      <span className="h-7 w-5 rounded-sm border-2 border-slate-300 bg-white" />
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
                      <span className="h-7 w-5 rounded-sm border-2 border-slate-300 bg-white" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-700">
                          {scanFlow.file?.name ||
                            currentVersion?.source_filename ||
                            currentVersion?.filename ||
                            "No manuscript uploaded"}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {currentManuscript?.title || "Manuscript"}
                        </p>
                      </div>
                      {scanFlow.file || currentVersion ? (
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
                    <div className="mt-2 rounded-lg border border-slate-200 bg-[#f8f9fb] px-4 py-3 text-sm font-semibold text-slate-700">
                      v{currentVersion.version_number || scanFlow.versionNumber || "1.0"}
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
                      if (remaining <= 0) {
                        setUpgradeMessage(`You have used all ${limit} scans included in your ${tier} plan this month.`);
                        return;
                      }
                      setFileDetailsConfirm("analyse");
                    }}
                    disabled={(!scanFlow.file && !currentVersion) || !selectedMechanicsId}
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
                  <div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
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
          </>
        )}
        {/* close activePage === "upload" wrapper */}
        </>)}
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
            setFileDetailsNotice("");
            setFileDetailsConfirm(null);
            scanFlow.analyze();
          } finally {
            setFileDetailsConfirmBusy(false);
          }
        }}
      />

      <UpgradePrompt
        message={upgradeMessage}
        onClose={() => setUpgradeMessage("")}
        onUpgrade={() => {
          setUpgradeMessage("");
          setActivePage("subscription");
        }}
      />
    </div>
  );
}
