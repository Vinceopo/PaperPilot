import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { enforceAuthSession } from "../services/auth";
import {
  deleteMechanics as deleteMechanicsRequest,
  getSubscription,
  itemsFrom,
  listManuscripts,
  listManuscriptVersions,
  listMechanics,
  renameMechanics as renameMechanicsRequest,
  runComplianceScan,
  uploadManuscriptVersion,
  uploadMechanics,
} from "../api";

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
  const [versions, setVersions] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mechanicsBusy, setMechanicsBusy] = useState(false);
  const [manuscriptBusy, setManuscriptBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState("");
  const [notifications, setNotifications] = useState([]);

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

  useEffect(() => {
    if (user) loadDashboard();
    else {
      setMechanics([]);
      setManuscripts([]);
      setSubscription(null);
      setCurrentManuscript(null);
      setCurrentVersion(null);
      setResult(null);
      setSelectedMechanicsId("");
    }
  }, [user, loadDashboard]);

  function handleGateError(err) {
    if (err?.code === "upgrade_required" || err?.detail?.code === "upgrade_required") {
      setUpgradeMessage(err.message);
      return true;
    }
    return false;
  }

  function pushNotification(title, body) {
    setNotifications((current) => [
      { id: `${Date.now()}`, title, body, createdAt: Date.now(), read: false },
      ...current,
    ].slice(0, 40));
  }

  async function onMechanicsUpload(fileAsset, name = "") {
    setMechanicsBusy(true);
    setError("");
    try {
      const created = await uploadMechanics({
        uri: fileAsset.uri,
        name: fileAsset.name,
        mimeType: fileAsset.mimeType,
        displayName: name,
      });
      const data = await listMechanics();
      const next = itemsFrom(data, "mechanics");
      setMechanics(next);
      setSelectedMechanicsId(created.id || created.mechanics?.id || next[0]?.id || "");
      pushNotification("Mechanics added", created.name || fileAsset.name || "Format guide ready.");
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
      setMechanics((current) => current.map((item) => (item.id === mechanicsId ? updated : item)));
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
      pushNotification("Manuscript uploaded", `${title} is ready to scan.`);
      return true;
    } catch (err) {
      if (!handleGateError(err)) setError(err.message);
      return false;
    } finally {
      setManuscriptBusy(false);
    }
  }

  async function onScan() {
    if (!currentManuscript?.id || !currentVersion?.id) return null;
    setScanBusy(true);
    setError("");
    setResult(null);
    try {
      const data = await runComplianceScan({
        manuscriptId: currentManuscript.id,
        versionId: currentVersion.id,
        mechanicsId: selectedMechanicsId,
      });
      const scan = data.scan || data;
      setResult(scan);
      setSubscription(await getSubscription());
      pushNotification(
        "Scan complete",
        `${currentManuscript.title || "Manuscript"} scored ${Number(scan.formatting_score ?? scan.overall_score ?? 0).toFixed(2)}.`
      );
      return scan;
    } catch (err) {
      if (!handleGateError(err)) setError(err.message);
      return null;
    } finally {
      setScanBusy(false);
    }
  }

  async function onLoadHistory() {
    if (!currentManuscript?.id) return false;
    setError("");
    try {
      const data = await listManuscriptVersions(currentManuscript.id, true);
      setVersions(itemsFrom(data, "versions"));
      return true;
    } catch (err) {
      if (handleGateError(err)) {
        try {
          const current = await listManuscriptVersions(currentManuscript.id, false);
          setVersions(itemsFrom(current, "versions"));
          return true;
        } catch {
          return false;
        }
      }
      setError(err.message);
      return false;
    }
  }

  const tier = String(subscription?.tier || "free").toLowerCase();
  const used = Number(subscription?.used ?? subscription?.scans_used ?? 0);
  const limit = Number(subscription?.limit ?? (tier === "premium" ? 50 : 3));
  const remaining = Number(subscription?.remaining ?? Math.max(limit - used, 0));

  const value = useMemo(
    () => ({
      user,
      authReady,
      mechanics,
      selectedMechanicsId,
      setSelectedMechanicsId: (id) => {
        setSelectedMechanicsId(id);
        setCurrentVersion(null);
        setResult(null);
      },
      manuscripts,
      currentManuscript,
      currentVersion,
      subscription,
      versions,
      result,
      setResult,
      error,
      setError,
      loading,
      mechanicsBusy,
      manuscriptBusy,
      scanBusy,
      upgradeMessage,
      setUpgradeMessage,
      notifications,
      setNotifications,
      tier,
      used,
      limit,
      remaining,
      loadDashboard,
      onMechanicsUpload,
      onMechanicsRename,
      onMechanicsDelete,
      onManuscriptUpload,
      onScan,
      onLoadHistory,
      pushNotification,
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
      versions,
      result,
      error,
      loading,
      mechanicsBusy,
      manuscriptBusy,
      scanBusy,
      upgradeMessage,
      notifications,
      tier,
      used,
      limit,
      remaining,
      loadDashboard,
    ]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
