import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useAppData } from "../context/AppDataContext";
import { colors } from "../theme";
import AppShell from "../components/shell/AppShell";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import ManuscriptDetailModal from "../components/cockpit/ManuscriptDetailModal";
import PaperPlaneLoader from "../components/ui/PaperPlaneLoader";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FilterIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
} from "../components/shell/icons";
import { bandTone, manuscriptSummary, sortManuscriptsByLatestScan } from "../lib/scoreBand";
import { removeManuscriptVersion } from "../lib/scannedLibrary";
import { deleteManuscriptVersion } from "../api";
import { formatScore } from "../lib/scoreFormat";
import { APP_TIME_ZONE } from "../lib/timeZone";

const PAGE_SIZE = 8;
const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "compliant", label: "Good Standing" },
  { id: "needs_revision", label: "Under Review" },
  { id: "critical", label: "Attention Required" },
];

function formatDate(iso) {
  if (!iso) return "-";
  try {
    return new Date(iso + (iso.length <= 10 ? "T12:00:00" : "")).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: APP_TIME_ZONE,
    });
  } catch {
    return iso;
  }
}

function formatMeta(row) {
  const parts = [];
  const institution = String(row.institution || "").trim();
  if (institution && institution !== "-" && institution !== "—") parts.push(institution);
  if (row.citationStyle) parts.push(row.citationStyle);
  if (row.versionCount > 0) {
    parts.push(
      `${row.versionCount} version${row.versionCount === 1 ? "" : "s"} (${row.latestVersionLabel})`
    );
  }
  return parts.join(" · ");
}

function StatCard({ label, value, sub, accent }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent ? { color: accent } : null]}>{value}</Text>
      {sub ? <Text style={[styles.statSub, { color: sub.color }]}>{sub.text}</Text> : null}
    </View>
  );
}

/**
 * My Manuscripts - checker/viewer only (no content editing).
 * Only manuscripts the user has scanned appear here.
 */
export default function ManuscriptsScreen({ navigation }) {
  const {
    scannedLibrary,
    updateScannedLibrary,
    deleteManuscriptPermanently,
    openSavedResult,
    resolveSavedResult,
    handleBackToDashboard,
    tier,
    loading,
  } = useAppData();
  const items = Array.isArray(scannedLibrary) ? scannedLibrary : [];
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [viewId, setViewId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const summaries = useMemo(() => items.map(manuscriptSummary), [items]);

  const stats = useMemo(() => {
    const total = summaries.length;
    const underReview = summaries.filter((m) => m.status === "needs_revision").length;
    const compliant = summaries.filter((m) => m.status === "compliant").length;
    const critical = summaries.filter((m) => m.status === "critical").length;
    const addedThisMonth = items.filter((m) => m.createdThisMonth).length;
    return { total, underReview, compliant, critical, addedThisMonth };
  }, [summaries, items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortManuscriptsByLatestScan(
      summaries.filter((m) => {
        if (statusFilter !== "all" && m.status !== statusFilter) return false;
        if (!q) return true;
        return (m.title || "").toLowerCase().includes(q);
      })
    );
  }, [summaries, query, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const viewing = items.find((m) => m.id === viewId) || null;
  const pendingDelete = items.find((m) => m.id === deleteId) || null;

  async function deleteVersion(manuscriptId, versionId) {
    const manuscript = items.find((m) => m.id === manuscriptId);
    const version = (manuscript?.versions || []).find((v) => v.id === versionId);
    if (version?.versionId) {
      try {
        await deleteManuscriptVersion({
          manuscriptId: manuscript.serverManuscriptId || manuscript.id,
          versionId: version.versionId,
        });
      } catch (err) {
        // 404 means it is already gone on the server (e.g. deleted on another device).
        if (err?.status !== 404) throw err;
      }
    }
    updateScannedLibrary(removeManuscriptVersion(items, manuscriptId, versionId));
  }

  async function confirmDelete() {
    if (!deleteId || !pendingDelete) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await deleteManuscriptPermanently(pendingDelete);
      if (viewId === deleteId) setViewId(null);
      setDeleteId(null);
    } catch (err) {
      setDeleteError(err?.message || "Could not delete this manuscript.");
    } finally {
      setDeleteBusy(false);
    }
  }

  function onUploadNew() {
    // Clear any open results first, then open Upload at step 1 (Format Mechanics).
    handleBackToDashboard();
    navigation.navigate("Upload", { fresh: true });
  }

  async function onOpenResult(manuscript, version) {
    if (!(await openSavedResult(manuscript, version))) return;
    setViewId(null);
    navigation.navigate("Results");
  }

  if (loading) {
    return (
      <AppShell active="manuscripts" breadcrumb="Dashboard / My Manuscripts" title="My Manuscripts">
        <View style={styles.loadingBox}>
          <PaperPlaneLoader />
          <Text style={styles.loadingText}>Loading your compliance workspace…</Text>
        </View>
      </AppShell>
    );
  }

  if (viewing) {
    return (
      <AppShell
        active="manuscripts"
        breadcrumb="Dashboard / My Manuscripts"
        title="Manuscript Detail"
        onBack={() => setViewId(null)}
      >
        <View style={styles.detailHost}>
          <ManuscriptDetailModal
            manuscript={viewing}
            tier={tier}
            onUpgrade={() => {
              setViewId(null);
              navigation.navigate("Subscription");
            }}
            onDeleteVersion={deleteVersion}
            onOpenResult={(version) => onOpenResult(viewing, version)}
            resolveResult={resolveSavedResult}
          />
        </View>
        <ConfirmDialog
          open={Boolean(pendingDelete)}
          title="Delete manuscript?"
          message={
            deleteError ||
            (pendingDelete
              ? `“${pendingDelete.title}” and all of its versions will be removed permanently. Uploading this title again starts at version 1.`
              : "")
          }
          confirmLabel="Delete"
          tone="danger"
          busy={deleteBusy}
          onCancel={() => {
            if (deleteBusy) return;
            setDeleteError("");
            setDeleteId(null);
          }}
          onConfirm={confirmDelete}
        />
      </AppShell>
    );
  }

  return (
    <AppShell active="manuscripts" breadcrumb="Dashboard / My Manuscripts" title="My Manuscripts">
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.statGrid}>
          <StatCard
            label="Total Manuscripts"
            value={stats.total}
            sub={{ text: `+${stats.addedThisMonth} this month`, color: "#059669" }}
          />
          <StatCard
            label="Good Standing"
            value={stats.compliant}
            accent="#059669"
            sub={{ text: "Good", color: "#059669" }}
          />
          <StatCard
            label="Under Review"
            value={stats.underReview}
            accent="#d97706"
            sub={{ text: "Needs attention", color: "#d97706" }}
          />
          <StatCard
            label="Attention Required"
            value={stats.critical}
            accent="#e11d48"
            sub={{ text: "Requires fix", color: "#e11d48" }}
          />
        </View>

        <View style={styles.toolbar}>
          <View style={styles.searchWrap}>
            <View style={styles.searchIcon} pointerEvents="none">
              <SearchIcon size={16} />
            </View>
            <TextInput
              value={query}
              onChangeText={(text) => {
                setQuery(text);
                setPage(1);
              }}
              placeholder="Search manuscripts..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              returnKeyType="search"
              clearButtonMode="while-editing"
              autoCorrect={false}
            />
          </View>

          <View style={styles.toolbarActions}>
            <View style={styles.filterWrap}>
              <Pressable
                onPress={() => setFilterOpen((o) => !o)}
                style={({ pressed }) => [styles.filterBtn, pressed && styles.filterBtnPressed]}
                accessibilityState={{ expanded: filterOpen }}
              >
                <FilterIcon size={14} />
                <Text style={styles.filterText}>
                  {STATUS_FILTERS.find((f) => f.id === statusFilter)?.label || "All"}
                </Text>
              </Pressable>
              {filterOpen ? (
                <View style={styles.filterMenu}>
                  {STATUS_FILTERS.map((f) => {
                    const active = statusFilter === f.id;
                    return (
                      <Pressable
                        key={f.id}
                        style={({ pressed }) => [
                          styles.filterOption,
                          active && styles.filterOptionActive,
                          pressed && !active && styles.filterOptionPressed,
                        ]}
                        onPress={() => {
                          setStatusFilter(f.id);
                          setFilterOpen(false);
                          setPage(1);
                        }}
                      >
                        <Text style={[styles.filterOptionText, active && styles.filterOptionTextActive]}>
                          {f.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>

            <Pressable
              onPress={onUploadNew}
              style={({ pressed }) => [styles.uploadBtn, pressed && styles.uploadBtnPressed]}
            >
              <UploadIcon size={14} />
              <Text style={styles.uploadText}>Upload New</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.listWrap}>
          {pageRows.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {items.length === 0
                  ? "No manuscripts yet. Upload and analyse a document to see it here."
                  : "No manuscripts match your search or filter."}
              </Text>
            </View>
          ) : (
            pageRows.map((row) => {
              const tone = bandTone(row.band);
              const meta = formatMeta(row);
              return (
                <View key={row.id} style={styles.msCard}>
                  <View style={[styles.bandBar, { backgroundColor: tone.bar }]} />
                  <Pressable
                    onPress={() => setViewId(row.id)}
                    style={({ pressed }) => [styles.msCardBody, pressed && styles.msCardPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${row.title}`}
                  >
                    <Text style={styles.rowTitle} numberOfLines={3}>
                      {row.title}
                    </Text>
                    {meta ? (
                      <Text style={styles.rowMeta} numberOfLines={3}>
                        {meta}
                      </Text>
                    ) : null}

                    <View style={styles.msField}>
                      <Text style={styles.msLabel}>Scanned</Text>
                      <Text style={styles.rowDate}>{formatDate(row.scannedDate)}</Text>
                    </View>

                    <View style={styles.msFieldRow}>
                      <View style={styles.msFieldHalf}>
                        <Text style={styles.msLabel}>Score</Text>
                        <View style={[styles.pill, { backgroundColor: tone.pillBg, borderColor: tone.pillBorder }]}>
                          <Text style={[styles.scorePillText, { color: tone.pillText }]}>
                            {formatScore(row.latestScore, 0)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.msFieldHalf}>
                        <Text style={styles.msLabel}>Status</Text>
                        <View style={[styles.pill, { backgroundColor: tone.pillBg, borderColor: tone.pillBorder }]}>
                          <Text style={[styles.statusPillText, { color: tone.pillText }]}>{row.band.label}</Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>

                  <View style={styles.actionsCell}>
                    <Pressable
                      onPress={() => setViewId(row.id)}
                      style={({ pressed }) => [styles.viewBtn, pressed && styles.viewBtnPressed]}
                      accessibilityLabel={`View ${row.title}`}
                    >
                      <Text style={styles.viewText}>View</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setDeleteError("");
                        setDeleteId(row.id);
                      }}
                      style={({ pressed }) => [styles.trashBtn, pressed && styles.trashBtnPressed]}
                      accessibilityLabel={`Delete ${row.title}`}
                    >
                      {({ pressed }) => <TrashIcon size={16} color={pressed ? "#e11d48" : colors.slate} />}
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.showing}>
            Showing {pageRows.length} of {filtered.length} manuscripts
            {filtered.length !== items.length ? ` (filtered from ${items.length})` : ""}
          </Text>

          <View style={styles.pager}>
            <Pressable
              disabled={safePage <= 1}
              onPress={() => setPage((p) => Math.max(1, p - 1))}
              style={[styles.pageArrow, safePage <= 1 && styles.pageDisabled]}
              accessibilityLabel="Previous page"
            >
              <ChevronLeftIcon size={16} />
            </Pressable>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
              <Pressable
                key={n}
                onPress={() => setPage(n)}
                style={[styles.pageNum, n === safePage ? styles.pageNumActive : styles.pageNumIdle]}
              >
                <Text style={[styles.pageNumText, n === safePage && styles.pageNumTextActive]}>{n}</Text>
              </Pressable>
            ))}
            <Pressable
              disabled={safePage >= pageCount}
              onPress={() => setPage((p) => Math.min(pageCount, p + 1))}
              style={[styles.pageArrow, safePage >= pageCount && styles.pageDisabled]}
              accessibilityLabel="Next page"
            >
              <ChevronRightIcon size={16} />
            </Pressable>
          </View>
        </View>

      </ScrollView>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete manuscript?"
        message={
          deleteError ||
          (pendingDelete
            ? `“${pendingDelete.title}” and all of its versions will be removed permanently. Uploading this title again starts at version 1.`
            : "")
        }
        confirmLabel="Delete"
        tone="danger"
        busy={deleteBusy}
        onCancel={() => {
          if (deleteBusy) return;
          setDeleteError("");
          setDeleteId(null);
        }}
        onConfirm={confirmDelete}
      />
    </AppShell>
  );
}

const cardShadow = {
  shadowColor: "#0f172a",
  shadowOpacity: 0.05,
  shadowRadius: 2,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pageBg },
  detailHost: { flex: 1, minHeight: 0, padding: 16, paddingBottom: 12, backgroundColor: colors.pageBg },
  loadingBox: {
    flex: 1,
    minHeight: 280,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    margin: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  loadingText: { fontSize: 14, color: colors.muted },
  scroll: { padding: 16, paddingBottom: 40 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: {
    flexBasis: "47%",
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.8)",
    backgroundColor: colors.white,
    padding: 16,
    ...cardShadow,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.muted,
  },
  statValue: { marginTop: 8, fontSize: 24, fontWeight: "700", color: "#0F1729", fontVariant: ["tabular-nums"] },
  statSub: { marginTop: 4, fontSize: 11, fontWeight: "500" },
  toolbar: { marginTop: 24, gap: 12, zIndex: 10, elevation: 10 },
  searchWrap: { position: "relative", justifyContent: "center" },
  searchIcon: { position: "absolute", left: 12, zIndex: 1 },
  searchInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingVertical: 10,
    paddingLeft: 40,
    paddingRight: 12,
    fontSize: 14,
    color: "#334155",
  },
  toolbarActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center", gap: 8 },
  filterWrap: { position: "relative", zIndex: 20 },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    ...cardShadow,
  },
  filterBtnPressed: { backgroundColor: "#f8fafc" },
  filterText: { fontSize: 12, fontWeight: "600", color: "#475569" },
  filterMenu: {
    position: "absolute",
    top: "100%",
    right: 0,
    marginTop: 4,
    minWidth: 180,
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingVertical: 4,
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  filterOption: { paddingHorizontal: 16, paddingVertical: 9 },
  filterOptionActive: { backgroundColor: "#F5F6F8" },
  filterOptionPressed: { backgroundColor: "#f8fafc" },
  filterOptionText: { fontSize: 12, fontWeight: "500", color: "#475569" },
  filterOptionTextActive: { color: "#0F1729" },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: "#0F1729",
    paddingHorizontal: 16,
    paddingVertical: 10,
    ...cardShadow,
  },
  uploadBtnPressed: { backgroundColor: "#1E293B" },
  uploadText: { fontSize: 12, fontWeight: "700", color: colors.white },
  listWrap: { marginTop: 20, gap: 12 },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 20,
    paddingVertical: 48,
    ...cardShadow,
  },
  emptyText: { fontSize: 14, color: colors.muted, textAlign: "center" },
  msCard: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...cardShadow,
  },
  msCardPressed: { backgroundColor: "#f8fafc" },
  msCardBody: { paddingLeft: 20, paddingRight: 16, paddingTop: 16, paddingBottom: 8, gap: 10 },
  bandBar: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 4,
  },
  rowTitle: { fontSize: 15, fontWeight: "700", color: "#0F1729" },
  rowMeta: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  msField: { gap: 4 },
  msFieldRow: { flexDirection: "row", gap: 12 },
  msFieldHalf: { flex: 1, gap: 4 },
  msLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.muted,
  },
  rowDate: { fontSize: 13, color: colors.slate },
  pill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  scorePillText: { fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] },
  statusPillText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  actionsCell: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginLeft: 20,
    marginRight: 16,
    marginBottom: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  viewBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  viewBtnPressed: { backgroundColor: "#f1f5f9" },
  viewText: { fontSize: 13, fontWeight: "600", color: "#475569" },
  trashBtn: { width: 40, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  trashBtnPressed: { backgroundColor: "#fff1f2" },
  footer: { marginTop: 16, gap: 16 },
  showing: { fontSize: 12, color: colors.slate },
  pager: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  pageArrow: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  pageDisabled: { opacity: 0.4 },
  pageNum: {
    minWidth: 32,
    height: 32,
    borderRadius: 8,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  pageNumActive: { backgroundColor: "#0F1729" },
  pageNumIdle: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  pageNumText: { fontSize: 12, fontWeight: "600", color: "#475569" },
  pageNumTextActive: { color: colors.white },
});
