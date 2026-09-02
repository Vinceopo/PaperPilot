import { useCallback, useEffect, useState } from "react";
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
import UpgradePrompt from "./components/cockpit/UpgradePrompt.jsx";
import VersionHistory from "./components/cockpit/VersionHistory.jsx";
import { useScanFlow } from "./hooks/useScanFlow.js";

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
  const signedIn = Boolean(user) && !guest;

  // ── Scan flow state machine (mock-ready; swap analyzeDocument for real API) ──
  const scanFlow = useScanFlow({ mechanicsId: selectedMechanicsId });

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return undefined;
    }
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      if (next) {
        setGuest(false);
        setRegistrationSuccess(pendingRegistration(next));
      }
      setAuthReady(true);
    });
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
    setManuscriptBusy(true);
    setError("");
    setResult(null);
    try {
      const created = await uploadManuscriptVersion({
        file,
        title,
        manuscriptId,
        mechanicsId: selectedMechanicsId,
      });
      const version = created.version || {
        id: created.version_id,
        manuscript_id: created.manuscript_id || manuscriptId,
        version_number: created.version_number,
        source_filename: created.source_filename || created.filename || file.name,
        page_count: created.page_count,
      };
      const manuscript = created.manuscript || {
        id: version.manuscript_id || created.manuscript_id || manuscriptId,
        title,
      };
      setCurrentManuscript(manuscript);
      setCurrentVersion(version);
      const data = await listManuscripts();
      setManuscripts(itemsFrom(data, "manuscripts"));
      return true;
    } catch (err) {
      if (!handleGateError(err)) setError(err.message);
      return false;
    } finally {
      setManuscriptBusy(false);
    }
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

  return (
    <div className="min-h-screen bg-[#f3f5f7] text-[#172033] md:pl-52">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-52 flex-col bg-[#101a30] px-4 py-5 text-white md:flex">
        <div className="flex items-center gap-2.5 px-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-[#101a30]">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
              <path d="M5 5.5h9.5A4.5 4.5 0 0 1 19 10v8.5H9.5A4.5 4.5 0 0 1 5 14V5.5Z" stroke="currentColor" strokeWidth="1.8" />
              <path d="M8 9h7M8 12h7M8 15h4" stroke="#16bfa8" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-bold tracking-tight">PAPER PILOT</p>
            <p className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Compliance</p>
          </div>
        </div>

        <nav className="mt-10">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Main menu</p>
          <button className="mt-2 flex w-full items-center gap-3 rounded-r-lg border-l-2 border-[#16bfa8] bg-[#1a2943] px-4 py-3 text-left text-sm font-semibold">
            <span className="text-[#22c9b4]">↑</span> Upload Manuscript
          </button>
          <button className="mt-1 flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-400 hover:text-white">
            <span>▣</span> My Manuscripts
          </button>
        </nav>

        <nav className="mt-auto">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Settings</p>
          <button className="mt-2 flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-300 hover:text-white">
            <span>♟</span> Account
          </button>
          <button
            className="mt-6 flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-rose-400 hover:text-rose-300"
            onClick={() => {
              signOut(auth);
              setUser(null);
            }}
          >
            ↪ Sign Out
          </button>
        </nav>
      </aside>

      <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-slate-200 bg-white px-5 md:px-8">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Dashboard</p>
          <h1 className="text-xl font-bold tracking-tight text-[#172033]">Upload Manuscript</h1>
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
          <button
            className="text-sm text-slate-500 md:hidden"
            onClick={() => {
              signOut(auth);
              setUser(null);
            }}
          >
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
            SCAN FLOW — takes over the main area; sidebar + header stay visible
        ═══════════════════════════════════════════════════════════════════ */}

        {/* ── Results screen ─────────────────────────────────────────────── */}
        {scanFlow.step === "results" && (
          <ScanResultsScreen
            result={scanFlow.result}
            versionNumber={scanFlow.versionNumber}
            downloadBusy={scanFlow.downloadBusy}
            downloadError={scanFlow.downloadError}
            onDownload={scanFlow.downloadReport}
            onUploadNewVersion={scanFlow.uploadNewVersion}
            onBackToDashboard={scanFlow.backToDashboard}
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
                  manuscripts={manuscripts}
                  currentVersion={currentVersion}
                  onUpload={onManuscriptUpload}
                  onLoadHistory={onLoadHistory}
                  onFileSelect={scanFlow.selectFile}
                  busy={manuscriptBusy}
                />
              </div>
            )}

            {/* File details + Upload & Analyse ──────────────────────────── */}
            {/* Show when a real version exists OR a file has been selected for mock scan */}
            {(currentVersion || scanFlow.file) && (
              <section className="mt-7 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-lg font-bold text-[#172033]">File details</h2>
                  <p className="text-xs text-slate-400">Review attached files then run compliance analysis</p>
                </div>

                <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Files attached
                </p>
                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                  {/* Format guide */}
                  <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-[#fafbfc] p-4">
                    <span className="h-7 w-5 rounded-sm border-2 border-slate-300 bg-white" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-700">
                        {selectedMechanics?.source_filename || selectedMechanics?.filename || selectedMechanics?.name || "No format guide selected"}
                      </p>
                      <p className="text-[11px] text-slate-400">Format guide</p>
                    </div>
                    {selectedMechanics ? (
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-semibold text-emerald-700">✓ Ready</span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold text-slate-400">Needed</span>
                    )}
                  </div>

                  {/* Manuscript */}
                  <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-[#fafbfc] p-4">
                    <span className="h-7 w-5 rounded-sm border-2 border-slate-300 bg-white" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-700">
                        {scanFlow.file?.name || currentVersion?.source_filename || currentVersion?.filename}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {currentManuscript?.title ? `${currentManuscript.title} · ` : ""}Manuscript
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-semibold text-amber-700">
                      • Ready to scan
                    </span>
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
                  {currentVersion && (
                    <button
                      type="button"
                      onClick={onLoadHistory}
                      className="rounded-lg border border-slate-200 bg-white px-7 py-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      View versions
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (remaining <= 0) {
                        setUpgradeMessage(`You have used all ${limit} scans included in your ${tier} plan this month.`);
                        return;
                      }
                      scanFlow.analyze();
                    }}
                    disabled={!scanFlow.file || !selectedMechanicsId}
                    className="min-w-44 rounded-lg bg-[#16bfa8] px-7 py-3 text-xs font-bold text-white shadow-sm hover:bg-[#12ae99] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Upload &amp; Analyse
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
