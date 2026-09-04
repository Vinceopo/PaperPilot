import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, firebaseReady } from "./firebase.js";
import {
  deleteMechanics as deleteMechanicsRequest,
  getSubscription,
  listManuscripts,
  listManuscriptVersions,
  listMechanics,
  renameMechanics as renameMechanicsRequest,
  runComplianceScan,
  uploadManuscriptVersion,
  uploadMechanics,
} from "./api.js";
import AuthScreen from "./components/AuthScreen.jsx";
import RegistrationSuccessScreen from "./components/auth/RegistrationSuccessScreen.jsx";
import MechanicsPanel from "./components/cockpit/MechanicsPanel.jsx";
import ManuscriptPanel from "./components/cockpit/ManuscriptPanel.jsx";
import ScanResults from "./components/cockpit/ScanResults.jsx";
import ScanResultsScreen from "./components/cockpit/ScanResultsScreen.jsx";
import AccountSettingsScreen from "./components/cockpit/AccountSettingsScreen.jsx";
import MyManuscriptsScreen from "./components/cockpit/MyManuscriptsScreen.jsx";
import UpgradePrompt from "./components/cockpit/UpgradePrompt.jsx";
import VersionHistory from "./components/cockpit/VersionHistory.jsx";
import { useScanFlow } from "./hooks/useScanFlow.js";
import {
  loadScannedManuscripts,
  normalizeTitle,
  saveScannedManuscripts,
  upsertFromScanResult,
} from "./lib/scannedLibrary.js";

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
  const [versions, setVersions] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mechanicsBusy, setMechanicsBusy] = useState(false);
  const [manuscriptBusy, setManuscriptBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState("");
  const [registrationSuccess, setRegistrationSuccess] = useState(() => pendingRegistration());
  const [activePage, setActivePage] = useState("upload"); // "upload" | "manuscripts" | "account"
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [scannedLibrary, setScannedLibrary] = useState([]);
  const lastSavedScanKey = useRef("");
  const scannedLibraryRef = useRef([]);
  const fileDetailsRef = useRef(null);
  const [fileDetailsNotice, setFileDetailsNotice] = useState("");
  const [manuscriptReady, setManuscriptReady] = useState(false);
  const [fileDetailsFocusKey, setFileDetailsFocusKey] = useState(0);
  const [uploadCancelKey, setUploadCancelKey] = useState(0);
  const uploadSessionRef = useRef(0);
  const signedIn = Boolean(user) && !guest;

  scannedLibraryRef.current = scannedLibrary;

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

  async function onMechanicsUpload(file, name) {
    setMechanicsBusy(true);
    setError("");
    try {
      const created = await uploadMechanics(file, name);
      const data = await listMechanics();
      const next = itemsFrom(data, "mechanics");
      setMechanics(next);
      setSelectedMechanicsId(created.id || created.mechanics?.id || next[0]?.id || "");
      return true;
    } catch (err) {
      setError(err.message);
      return false;
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
        setResult(null);
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
    setResult(null);

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
    focusFileDetails("Manuscript uploaded completely and ready to scan.");
    setManuscriptBusy(false);

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

  async function onScan() {
    if (!currentManuscript?.id || !currentVersion?.id) return;
    setScanBusy(true);
    setError("");
    setResult(null);
    try {
      const data = await runComplianceScan({
        manuscriptId: currentManuscript.id,
        versionId: currentVersion.id,
        mechanicsId: selectedMechanicsId,
      });
      setResult(data.scan || data);
      setSubscription(await getSubscription());
    } catch (err) {
      if (!handleGateError(err)) setError(err.message);
    } finally {
      setScanBusy(false);
    }
  }

  async function onLoadHistory() {
    if (!currentManuscript?.id) return;
    setError("");
    try {
      const data = await listManuscriptVersions(currentManuscript.id, true);
      setVersions(itemsFrom(data, "versions"));
      setHistoryOpen(true);
    } catch (err) {
      if (handleGateError(err)) {
        try {
          const current = await listManuscriptVersions(currentManuscript.id, false);
          setVersions(itemsFrom(current, "versions"));
          setHistoryOpen(true);
        } catch {
          // The upgrade prompt already explains the unavailable history.
        }
      } else {
        setError(err.message);
      }
    }
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
  const pageTitle =
    activePage === "account"
      ? "Account Settings"
      : activePage === "manuscripts"
        ? "My Manuscripts"
        : "Upload Manuscript";
  const breadcrumb =
    activePage === "account"
      ? "Dashboard / Settings"
      : activePage === "manuscripts"
        ? "Dashboard / My Manuscripts"
        : "Dashboard";

  return (
    <div className={`min-h-screen bg-[#f3f5f7] text-[#172033] transition-[padding] duration-300 ${sidebarOpen ? "md:pl-52" : "md:pl-0"}`}>
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-52 flex-col bg-[#101a30] px-4 py-5 text-white transition-transform duration-300 md:flex ${
          sidebarOpen ? "flex translate-x-0" : "hidden -translate-x-full md:hidden"
        }`}
      >
        <div className="flex items-center gap-2.5 px-2">
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
            onClick={() => setActivePage("upload")}
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
              activePage === "account"
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
      <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-slate-200 bg-white px-5 md:px-8">
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
            <h1 className="text-xl font-bold tracking-tight text-[#172033]">{pageTitle}</h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden text-right lg:block">
            <p className="text-xs font-semibold capitalize text-slate-700">{tier} plan</p>
            <p className="text-[10px] text-slate-400">{remaining} of {limit} scans remaining</p>
          </div>
          <button
            type="button"
            onClick={() => setUpgradeMessage("Upgrade to Premium for 50 monthly scans, full version history, and deeper AI explanations.")}
            className="rounded-md bg-[#16bfa8] px-5 py-2.5 text-xs font-bold text-[#092823] shadow-sm hover:bg-[#12ae99]"
          >
            Subscribe to Premium
          </button>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-sm" aria-label="Notifications">🔔</span>
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
          <AccountSettingsScreen user={user} tier={tier} onSignOut={doSignOut} />
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
            onUploadNew={() => setActivePage("upload")}
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
            }}
            onBackToDashboard={() => {
              setManuscriptReady(false);
              setFileDetailsNotice("");
              setCurrentVersion(null);
              scanFlow.backToDashboard();
            }}
          />
        )}

        {/* ── Analysing state ────────────────────────────────────────────── */}
        {scanFlow.step === "analyzing" && (
          <div className="grid min-h-[60vh] place-items-center rounded-xl border border-slate-200 bg-white p-10 shadow-sm">
            <div className="flex flex-col items-center gap-5 text-center">
              {/* Spinner */}
              <span className="inline-block h-14 w-14 animate-spin rounded-full border-4 border-[#16bfa8] border-t-transparent" />
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
                Loading your compliance workspace…
              </div>
            ) : (
              <div className="grid gap-7 lg:grid-cols-2">
                <MechanicsPanel
                  items={mechanics}
                  selectedId={selectedMechanicsId}
                  onSelect={(id) => {
                    setSelectedMechanicsId(id);
                    setCurrentVersion(null);
                    setResult(null);
                  }}
                  onUpload={onMechanicsUpload}
                  onRename={onMechanicsRename}
                  onDelete={onMechanicsDelete}
                  busy={mechanicsBusy}
                />
                <ManuscriptPanel
                  mechanicsSelected={Boolean(selectedMechanicsId)}
                  manuscripts={uploadTargets}
                  selectedManuscriptId={currentManuscript?.id || ""}
                  onSelectManuscript={selectUploadTarget}
                  onUpload={onManuscriptUpload}
                  uploadCancelKey={uploadCancelKey}
                  onFilePick={() => {
                    // Picking a file alone must not open File details.
                    setManuscriptReady(false);
                    setFileDetailsNotice("");
                    setCurrentVersion(null);
                    scanFlow.selectFile(null);
                  }}
                  busy={manuscriptBusy}
                />
              </div>
            )}

            {/* File details — only after Upload manuscript */}
            {manuscriptReady && (currentVersion || scanFlow.file) && (
              <section
                ref={fileDetailsRef}
                id="file-details"
                className={`mt-7 scroll-mt-6 rounded-xl border bg-white p-6 shadow-sm transition ${
                  fileDetailsNotice
                    ? "border-[#16bfa8] ring-2 ring-[#16bfa8]/25"
                    : "border-slate-200"
                }`}
              >
                <div className="border-b border-slate-100 pb-4">
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
                    onClick={cancelManuscriptUpload}
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
                      setFileDetailsNotice("");
                      scanFlow.analyze();
                    }}
                    disabled={(!scanFlow.file && !currentVersion) || !selectedMechanicsId}
                    className="min-w-44 rounded-lg bg-[#16bfa8] px-7 py-3 text-xs font-bold text-white shadow-sm hover:bg-[#12ae99] disabled:cursor-not-allowed disabled:opacity-40"
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

            {/* Legacy real-API scan results (shown below upload panels when available) */}
            {result && (
              <div className="mt-5">
                <ScanResults result={result} tier={tier} />
              </div>
            )}
          </>
        )}
        {/* close activePage === "upload" wrapper */}
        </>)}
      </main>

      <VersionHistory
        open={historyOpen}
        manuscript={currentManuscript}
        versions={versions}
        tier={tier}
        onClose={() => setHistoryOpen(false)}
      />
      <UpgradePrompt message={upgradeMessage} onClose={() => setUpgradeMessage("")} />
    </div>
  );
}
