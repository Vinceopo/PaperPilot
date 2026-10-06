import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useAppData } from "../context/AppDataContext";
import { colors } from "../theme";
import AppShell from "../components/shell/AppShell";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import ManuscriptDetailModal from "../components/cockpit/ManuscriptDetailModal";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FilterIcon,
  LockIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
} from "../components/shell/icons";
import { bandTone, manuscriptSummary } from "../lib/scoreBand";
import { removeManuscriptVersion } from "../lib/scannedLibrary";
import { formatScore } from "../lib/scoreFormat";
import { APP_TIME_ZONE } from "../lib/timeZone";

const PAGE_SIZE = 8;
const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "compliant", label: "Compliant" },
  { id: "needs_revision", label: "Needs Revision" },
  { id: "critical", label: "Critical" },
];
const COLUMNS = { title: 230, scanned: 112, score: 84, status: 140, actions: 96 };
const TABLE_WIDTH = Object.values(COLUMNS).reduce((sum, w) => sum + w, 0);

function formatDate(iso) {
  if (!iso) return "—";
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
 * My Manuscripts — checker/viewer only (no content editing).
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
    return summaries.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (!q) return true;
      return (m.title || "").toLowerCase().includes(q);
    });
  }, [summaries, query, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const viewing = items.find((m) => m.id === viewId) || null;
  const pendingDelete = items.find((m) => m.id === deleteId) || null;

  function deleteVersion(manuscriptId, versionId) {
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
    handleBackToDashboard();
    navigation.navigate("Upload");
  }

  async function onOpenResult(manuscript, version) {
    if (!(await openSavedResult(manuscript, version))) return;
    setViewId(null);
    navigation.navigate("Results");
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
            label="Under Review"
            value={stats.underReview}
            accent="#d97706"
            sub={{ text: "Needs attention", color: "#d97706" }}
          />
          <StatCard
            label="Compliant"
            value={stats.compliant}
            accent="#059669"
            sub={{ text: "≥80 score", color: "#059669" }}
          />
          <StatCard
            label="Critical Issues"
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

        <View style={styles.tableCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
            <View style={{ minWidth: TABLE_WIDTH }}>
              <View style={styles.thead}>
                <Text style={[styles.th, { width: COLUMNS.title, paddingLeft: 20 }]}>Title</Text>
                <Text style={[styles.th, { width: COLUMNS.scanned }]}>Scanned</Text>
                <Text style={[styles.th, { width: COLUMNS.score }]}>Score</Text>
                <Text style={[styles.th, { width: COLUMNS.status }]}>Status</Text>
                <Text style={[styles.th, styles.thRight, { width: COLUMNS.actions }]}>Actions</Text>
              </View>

              {pageRows.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Text style={styles.emptyText}>
                    {items.length === 0
                      ? "No manuscripts yet. Upload and analyse a document to see it here."
                      : "No manuscripts match your search or filter."}
                  </Text>
                </View>
              ) : (
                pageRows.map((row, index) => {
                  const tone = bandTone(row.band);
                  return (
                    <View
                      key={row.id}
                      style={[styles.tr, index === pageRows.length - 1 && styles.trLast]}
                    >
                      <View style={[styles.td, styles.titleCell, { width: COLUMNS.title }]}>
                        <View style={[styles.bandBar, { backgroundColor: tone.bar }]} />
                        <Text style={styles.rowTitle} numberOfLines={2}>
                          {row.title}
                        </Text>
                        <Text style={styles.rowMeta} numberOfLines={2}>
                          {row.institution} · {row.citationStyle}
                          {row.versionCount > 0
                            ? ` · ${row.versionCount} version${row.versionCount === 1 ? "" : "s"} (${row.latestVersionLabel})`
                            : ""}
                        </Text>
                      </View>
                      <View style={[styles.td, { width: COLUMNS.scanned }]}>
                        <Text style={styles.rowDate}>{formatDate(row.scannedDate)}</Text>
                      </View>
                      <View style={[styles.td, { width: COLUMNS.score }]}>
                        <View style={[styles.pill, { backgroundColor: tone.pillBg, borderColor: tone.pillBorder }]}>
                          <Text style={[styles.scorePillText, { color: tone.pillText }]}>{formatScore(row.latestScore, 0)}</Text>
                        </View>
                      </View>
                      <View style={[styles.td, { width: COLUMNS.status }]}>
                        <View style={[styles.pill, { backgroundColor: tone.pillBg, borderColor: tone.pillBorder }]}>
                          <Text style={[styles.statusPillText, { color: tone.pillText }]}>{row.band.label}</Text>
                        </View>
                      </View>
                      <View style={[styles.td, styles.actionsCell, { width: COLUMNS.actions }]}>
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
          </ScrollView>
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

          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: "#10b981" }]} />
              <Text style={styles.legendText}>Compliant ≥80</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: "#f59e0b" }]} />
              <Text style={styles.legendText}>Needs revision 50–79</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: "#f43f5e" }]} />
              <Text style={styles.legendText}>Critical &lt;50</Text>
            </View>
          </View>
        </View>

        <View style={styles.lockNote}>
          <View style={styles.lockIcon}>
            <LockIcon size={14} />
          </View>
          <Text style={styles.lockText}>This system is a checker only. Documents cannot be edited here.</Text>
        </View>
      </ScrollView>

      {viewing ? (
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
          onClose={() => setViewId(null)}
        />
      ) : null}

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
  tableCard: {
    marginTop: 20,
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...cardShadow,
  },
  thead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    backgroundColor: "#F8FAFC",
    paddingVertical: 12,
  },
  th: {
    paddingHorizontal: 16,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.muted,
  },
  thRight: { textAlign: "right" },
  emptyRow: { width: TABLE_WIDTH, paddingHorizontal: 20, paddingVertical: 48 },
  emptyText: { fontSize: 14, color: colors.muted, textAlign: "center" },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f8fafc" },
  trLast: { borderBottomWidth: 0 },
  td: { paddingHorizontal: 16, paddingVertical: 16, justifyContent: "center" },
  titleCell: { position: "relative", paddingLeft: 20 },
  bandBar: {
    position: "absolute",
    top: 8,
    bottom: 8,
    left: 0,
    width: 4,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  rowTitle: { fontSize: 14, fontWeight: "700", color: "#0F1729" },
  rowMeta: { marginTop: 2, fontSize: 12, color: colors.muted },
  rowDate: { fontSize: 12, color: colors.slate },
  pill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  scorePillText: { fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] },
  statusPillText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  actionsCell: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 },
  viewBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  viewBtnPressed: { backgroundColor: "#f1f5f9" },
  viewText: { fontSize: 12, fontWeight: "600", color: "#475569" },
  trashBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
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
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontSize: 11, color: colors.slate },
  lockNote: { marginTop: 16, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  lockIcon: { marginTop: 1 },
  lockText: { flex: 1, fontSize: 11, lineHeight: 17, color: colors.muted },
});
