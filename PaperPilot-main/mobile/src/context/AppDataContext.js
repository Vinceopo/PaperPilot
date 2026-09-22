import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { enforceAuthSession } from "../services/auth";
import {
  deleteMechanics as deleteMechanicsRequest,
  extractMechanics,
  getSubscription,
  itemsFrom,
  listManuscripts,
  listMechanics,
  previewManuscript,
  renameMechanics as renameMechanicsRequest,
  saveMechanicsProfile,
  uploadManuscriptVersion,
} from "../api";
import { isServerId, scanTargetIds } from "../lib/scanMapper";
import { useScanFlow } from "../hooks/useScanFlow";
import {
  loadScannedManuscripts,
  normalizeTitle,
  saveScannedManuscripts,
  upsertFromScanResult,
} from "../lib/scannedLibrary";
import {
  loadNotifications,
  saveNotifications,
  pushNotification as pushNotificationEntry,
  notificationFromScan,
  notificationFromUpload,
  unreadCount,
  markAllRead as markAllReadEntries,
  markOneRead as markOneReadEntries,
} from "../lib/notifications";

const AppDataContext = createContext(null);

export function AppDataProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(!auth);
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
  const [scannedLibrary, setScannedLibrary] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [fileDetailsNotice, setFileDetailsNotice] = useState("");
  const [manuscriptReady, setManuscriptReady] = useState(false);
  const [uploadCancelKey, setUploadCancelKey] = useState(0);
  const [uploadWizardStep, setUploadWizardStep] = useState(1);
  const [wizardMaxStep, setWizardMaxStep] = useState(1);

  const lastSavedScanKey = useRef("");
  const scannedLibraryRef = useRef([]);
  const notificationsRef = useRef([]);
  const uploadSessionRef = useRef(0);
  const currentManuscriptRef = useRef(null);
  const manuscriptsRef = useRef([]);

  scannedLibraryRef.current = scannedLibrary;
  notificationsRef.current = notifications;
  currentManuscriptRef.current = currentManuscript;
  manuscriptsRef.current = manuscripts;

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

  const resolveManuscript = useCallback((title, documentId) => {
    const list = scannedLibraryRef.current || [];
    const byId = documentId ? list.find((m) => m.id === documentId) : null;
    if (byId) return byId;
    const key = normalizeTitle(title);
    if (!key) return null;
    return list.find((m) => normalizeTitle(m.title) === key) || null;
  }, []);

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
    const citationStyle = String(profile?.rules?.citation_style || "APA").toUpperCase();
    return {
      manuscriptId,
      versionId,
      citationStyle,
      pageCount: version?.page_count,
      versionNumber: version?.version_number,
    };
  }, []);

  const scanFlow = useScanFlow({
    mechanicsId: selectedMechanicsId,
    resolveManuscript,
    getActiveManuscript,
    getScanTarget,
  });

  function persistNotifications(next) {
    setNotifications(next);
    void saveNotifications(next, user?.uid);
  }

  function appendNotifications(entries) {
    const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
    if (!list.length) return;
    let next = notificationsRef.current;
    for (const entry of list) {
      if (!entry) continue;
      next = pushNotificationEntry(next, entry);
    }
    if (next !== notificationsRef.current) persistNotifications(next);
  }

  function cancelManuscriptUpload() {
    uploadSessionRef.current += 1;
    setUploadCancelKey((key) => key + 1);
    setFileDetailsNotice("");
    setManuscriptReady(false);
    setCurrentVersion(null);
    scanFlow.selectFile(null);
    setError("");
    setCurrentManuscript((m) => {
      if (!m?.id) return null;
      const inLibrary = scannedLibraryRef.current.some((item) => item.id === m.id);
      return inLibrary ? m : null;
    });
    setUploadWizardStep(2);
    setWizardMaxStep((max) => Math.min(max, 2));
  }

  function handleBackToDashboard() {
    setManuscriptReady(false);
    setFileDetailsNotice("");
    setCurrentVersion(null);
    resetUploadWizard(1);
    scanFlow.backToDashboard();
  }

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    if (!auth) {
      setAuthReady(true);
      return undefined;
    }

    (async () => {
      try {
        await enforceAuthSession(auth);
      } catch {
        // Fall through to auth listener.
      }
      if (cancelled) return;
      unsubscribe = onAuthStateChanged(auth, (next) => {
        if (!cancelled) {
          setUser(next);
          setAuthReady(true);
        }
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadScannedManuscripts(user?.uid);
      if (cancelled) return;
      setScannedLibrary(loaded);
      if (loaded.length) await saveScannedManuscripts(loaded, user?.uid);
      lastSavedScanKey.current = "";
      const notes = await loadNotifications(user?.uid);
      if (!cancelled) setNotifications(notes);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (scanFlow.step !== "results" || !scanFlow.result) return;
    const key = `${scanFlow.result.documentId}|${scanFlow.versionNumber}|${scanFlow.result.scannedAt || ""}`;
    if (lastSavedScanKey.current === key) return;
    lastSavedScanKey.current = key;
    setScannedLibrary((prev) => {
      const next = upsertFromScanResult(prev, scanFlow.result, scanFlow.versionNumber);
      void saveScannedManuscripts(next, user?.uid);
      return next;
    });
    appendNotifications(notificationFromScan(scanFlow.result, scanFlow.versionNumber));
    void getSubscription()
      .then((data) => setSubscription(data))
      .catch(() => {});
  }, [scanFlow.step, scanFlow.result, scanFlow.versionNumber, user?.uid]);

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
      setMechanics(nextMechanics);
      setManuscripts(itemsFrom(manuscriptsData, "manuscripts"));
      setSubscription(subscriptionData);
      setSelectedMechanicsId((current) => current || nextMechanics[0]?.id || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSubscription = useCallback(async () => {
    if (!auth?.currentUser) return null;
    try {
      const data = await getSubscription();
      setSubscription(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (user) loadDashboard();
    else {
      setMechanics([]);
      setManuscripts([]);
      setSubscription(null);
      setCurrentManuscript(null);
      setCurrentVersion(null);
      setSelectedMechanicsId("");
      setScannedLibrary([]);
      setNotifications([]);
      setManuscriptReady(false);
      setFileDetailsNotice("");
      resetUploadWizard(1);
    }
  }, [user, loadDashboard]);

  function handleGateError(err) {
    if (err?.code === "upgrade_required" || err?.detail?.code === "upgrade_required") {
      setUpgradeMessage(err.message);
      return true;
    }
    return false;
  }

  async function onExtractMechanics(fileAsset) {
    setError("");
    return extractMechanics({
      uri: fileAsset.uri,
      name: fileAsset.name,
      mimeType: fileAsset.mimeType,
    });
  }

  async function onSaveMechanicsProfile(payload) {
    setMechanicsBusy(true);
    setError("");
    try {
      const created = await saveMechanicsProfile({
        name: payload.name,
        rules: payload.rules,
        sourceFilename: payload.source_filename || payload.sourceFilename,
        fileType: payload.file_type || payload.fileType,
        extractedText: payload.extracted_text || payload.extractedText,
      });
      const data = await listMechanics();
      const next = itemsFrom(data, "mechanics");
      setMechanics(next);
      setSelectedMechanicsId(created.id || next[0]?.id || "");
      return true;
    } catch (err) {
      throw err;
    } finally {
      setMechanicsBusy(false);
    }
  }

  async function onPreviewManuscript(fileAsset) {
    setError("");
    return previewManuscript({
      uri: fileAsset.uri,
      name: fileAsset.name,
      mimeType: fileAsset.mimeType,
    });
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

  function selectUploadTarget(id) {
    if (!id) {
      setCurrentManuscript(null);
      return;
    }
    const m = scannedLibraryRef.current.find((item) => item.id === id);
    if (m) setCurrentManuscript({ id: m.id, title: m.title });
  }

  const updateScannedLibrary = useCallback(
    (next) => {
      setScannedLibrary(next);
      void saveScannedManuscripts(next, user?.uid);
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
      const titleKey = normalizeTitle(resolvedTitle);
      const fromApi = manuscriptsRef.current.find(
        (m) => normalizeTitle(m.title) === titleKey && isServerId(m.id)
      );
      return fromApi?.id || "";
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
          void saveScannedManuscripts(next, user?.uid);
          return next;
        });
      }
      const data = await listManuscripts();
      if (uploadSessionRef.current !== sessionId) return false;
      setManuscripts(itemsFrom(data, "manuscripts"));
      setManuscriptReady(true);
      advanceUploadWizard(3);
      setFileDetailsNotice("Manuscript uploaded completely and ready to scan.");
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

  const tier = String(subscription?.tier || "free").toLowerCase();
  const used = Number(subscription?.used ?? subscription?.scans_used ?? 0);
  const limit = Number(subscription?.limit ?? (tier === "premium" ? 50 : 3));
  const remaining = Number(subscription?.remaining ?? Math.max(limit - used, 0));
  const notificationUnread = useMemo(() => unreadCount(notifications), [notifications]);

  const value = useMemo(
    () => ({
      user,
      authReady,
      mechanics,
      selectedMechanicsId,
      setSelectedMechanicsId: (id) => {
        setSelectedMechanicsId(id);
        setCurrentVersion(null);
      },
      manuscripts,
      currentManuscript,
      setCurrentManuscript,
      currentVersion,
      subscription,
      error,
      setError,
      loading,
      mechanicsBusy,
      manuscriptBusy,
      upgradeMessage,
      setUpgradeMessage,
      notifications,
      setNotifications,
      notificationUnread,
      markNotificationsAllRead: () => persistNotifications(markAllReadEntries(notificationsRef.current)),
      markNotificationRead: (id) =>
        persistNotifications(markOneReadEntries(notificationsRef.current, id)),
      tier,
      used,
      limit,
      remaining,
      loadDashboard,
      refreshSubscription,
      scannedLibrary,
      updateScannedLibrary,
      uploadTargets,
      selectUploadTarget,
      uploadWizardStep,
      wizardMaxStep,
      advanceUploadWizard,
      goToUploadWizardStep,
      resetUploadWizard,
      manuscriptReady,
      setManuscriptReady,
      fileDetailsNotice,
      setFileDetailsNotice,
      uploadCancelKey,
      cancelManuscriptUpload,
      handleBackToDashboard,
      onExtractMechanics,
      onSaveMechanicsProfile,
      onPreviewManuscript,
      onMechanicsRename,
      onMechanicsDelete,
      onManuscriptUpload,
      scanFlow,
    }),
    [
      user,
      authReady,
      mechanics,
      selectedMechanicsId,
      manuscripts,
      currentManuscript,
      currentVersion,
      subscription,
      error,
      loading,
      mechanicsBusy,
      manuscriptBusy,
      upgradeMessage,
      notifications,
      notificationUnread,
      tier,
      used,
      limit,
      remaining,
      loadDashboard,
      refreshSubscription,
      scannedLibrary,
      updateScannedLibrary,
      uploadTargets,
      uploadWizardStep,
      wizardMaxStep,
      manuscriptReady,
      fileDetailsNotice,
      uploadCancelKey,
      scanFlow,
    ]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
