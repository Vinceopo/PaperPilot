import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppData } from "../context/AppDataContext";
import { colors } from "../theme";
import {
  CATEGORY_ORDER,
  categoryForIssue,
  normalizeDetectedIssues,
} from "../components/cockpit/IssuesDetectedPanel";
import TraceDocumentViewer from "../components/cockpit/TraceDocumentViewer";
import BackToDashboardButton from "../components/ui/BackToDashboardButton";
import PrimaryButton from "../components/ui/PrimaryButton";
import { isApproximateTracing } from "../lib/documentPreviewLocate";
import { normalizeIssueLocation } from "../lib/scanMapper";

const SEVERITY = {
  minor: {
    label: "Minor",
    tagBg: "#fef3c7",
    tagBorder: "#fde68a",
    tagText: "#b45309",
    activeBg: "rgba(255,251,235,0.9)",
    activeBorder: "#fcd34d",
  },
  moderate: {
    label: "Moderate",
    tagBg: "#ffedd5",
    tagBorder: "#fed7aa",
    tagText: "#c2410c",
    activeBg: "rgba(255,247,237,0.9)",
    activeBorder: "#fdba74",
  },
  critical: {
    label: "Critical",
    tagBg: "#ffe4e6",
    tagBorder: "#fecdd3",
    tagText: "#be123c",
    activeBg: "rgba(255,241,242,0.9)",
    activeBorder: "#fda4af",
  },
};

function formatLocation(entry) {
  const parts = [];
  if (entry.page != null) parts.push(`Page ${entry.page}`);
  if (entry.line != null) parts.push(`Line ${entry.line}`);
  return parts.length ? parts.join(", ") : "Document";
}

function distinctText(primary, secondary) {
  const a = String(primary || "").trim();
  const b = String(secondary || "").trim();
  if (!b) return "";
  if (!a) return b;
  if (a.toLowerCase() === b.toLowerCase()) return "";
  if (a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase())) {
    return a.length >= b.length ? "" : b;
  }
  return b;
}

/** One concise XAI block per issue — no repeated finding / why / fix copy. */
function consolidateXai(entry) {
  const finding = String(entry.finding || "").trim() || "Formatting discrepancy detected";
  const why = distinctText(finding, entry.explanation);
  const fix = distinctText(finding, distinctText(why, entry.recommendation));
  const rule = String(entry.section || entry.category || "").trim();
  return { finding, why, fix, rule };
}

function toTarget(entry, loc) {
  const marked = {
    id: entry.id,
    page: loc.page ?? entry.page ?? null,
    line: loc.line ?? entry.line ?? null,
    bbox: loc.bbox || entry.bbox || null,
    excerpt: loc.excerpt || entry.excerpt || "",
    severity: entry.severity || "minor",
    finding: entry.finding || entry.title || "",
    explanation: entry.explanation || loc.explanation || "",
    recommendation: entry.recommendation || loc.recommendation || "",
    section: entry.section || loc.section || "",
    issue_type: entry.issue_type || "",
    margin_side: loc.margin_side || loc.marginSide || entry.margin_side || "",
    page_region: loc.page_region || loc.pageRegion || entry.page_region || "",
    page_align: loc.page_align || loc.pageAlign || entry.page_align || "",
  };
  if (String(marked.section || "").toLowerCase() === "pagination") {
    marked.line = null;
    marked.excerpt = "";
    marked.bbox = null;
    if (!marked.page_region) marked.page_region = "top";
  }
  return marked;
}

export default function DocumentReferenceScreen({ navigation }) {
  const { scanFlow } = useAppData();
  const result = scanFlow?.result;
  const leavingRef = useRef(false);
  const stepRef = useRef(scanFlow?.step);
  stepRef.current = scanFlow?.step;

  const formatChecks = result?.formatChecks || [];
  const pageCount = result?.pageCount || 0;
  const approximateTrace = isApproximateTracing(result?.pagination);
  const paginationNote = result?.pagination?.note || "";

  const { entries, hiddenLocations } = useMemo(
    () => normalizeDetectedIssues(formatChecks, pageCount),
    [formatChecks, pageCount]
  );

  const enrichedEntries = useMemo(
    () =>
      entries.map((entry) => ({
        ...entry,
        category: entry.category || categoryForIssue(entry),
      })),
    [entries]
  );

  const categoryCounts = useMemo(() => {
    const c = {};
    enrichedEntries.forEach((e) => {
      const key = e.category || "Other";
      c[key] = (c[key] || 0) + 1;
    });
    return c;
  }, [enrichedEntries]);

  const categoryOptions = useMemo(() => {
    const present = Object.keys(categoryCounts);
    const ordered = CATEGORY_ORDER.filter((name) => categoryCounts[name]);
    const extras = present
      .filter((name) => !CATEGORY_ORDER.includes(name))
      .sort((a, b) => a.localeCompare(b));
    return [...ordered, ...extras];
  }, [categoryCounts]);

  const [categoryFilter, setCategoryFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);

  const filteredEntries = useMemo(() => {
    if (categoryFilter === "all") return enrichedEntries;
    return enrichedEntries.filter((entry) => entry.category === categoryFilter);
  }, [enrichedEntries, categoryFilter]);

  // Only highlight after the user taps an issue (or arrives with an explicit selection).
  const initial = scanFlow?.traceHighlight;
  const [highlight, setHighlight] = useState(() =>
    initial?.page != null || initial?.line != null || initial?.id ? initial : null
  );

  useEffect(() => {
    setCategoryFilter("all");
    setHighlight(null);
  }, [formatChecks]);

  useEffect(() => {
    if (!highlight) return;
    if (!filteredEntries.length || (highlight.id && !filteredEntries.some((e) => e.id === highlight.id))) {
      if (highlight.id && enrichedEntries.some((e) => e.id === highlight.id) && categoryFilter !== "all") {
        return;
      }
      setHighlight(null);
    }
  }, [filteredEntries, enrichedEntries, highlight, categoryFilter]);

  useEffect(() => {
    return navigation.addListener("beforeRemove", () => {
      if (!leavingRef.current && stepRef.current === "documentTrace") scanFlow.openFullResult();
    });
  }, [navigation, scanFlow]);

  const resolveLocation = useCallback(
    (entry) => {
      if (entry.location) {
        const own = normalizeIssueLocation(entry.location);
        if (
          own.page != null ||
          own.line != null ||
          own.bbox ||
          own.excerpt ||
          own.margin_side ||
          own.page_region
        ) {
          return own;
        }
      }
      for (const check of formatChecks) {
        if (entry.issue_type && check.issue_type && entry.issue_type !== check.issue_type) continue;
        if (entry.section && check.section && entry.section !== check.section) continue;
        for (const loc of check.locations || []) {
          const samePage = loc.page === entry.page;
          const sameLine =
            entry.line == null
              ? loc.line == null || loc.line === undefined
              : loc.line === entry.line;
          if (samePage && sameLine) return loc;
        }
      }
      return normalizeIssueLocation({
        page: entry.page,
        line: entry.line,
        section: entry.section,
        margin_side: entry.margin_side,
        page_region: entry.page_region,
      });
    },
    [formatChecks]
  );

  const onSelectIssue = useCallback(
    (entry) => {
      const loc = resolveLocation(entry);
      const target = toTarget(entry, loc);
      setHighlight(target);
      scanFlow.selectTraceIssue({ ...entry, ...target });
    },
    [resolveLocation, scanFlow]
  );

  function backToResults() {
    leavingRef.current = true;
    scanFlow.openFullResult();
    navigation.navigate("MainTabs", { screen: "Results" });
  }

  function viewFullResult() {
    leavingRef.current = true;
    scanFlow.openFullResult();
    navigation.navigate("MainTabs", { screen: "Results" });
  }

  if (!result) {
    return (
      <SafeAreaView style={styles.empty}>
        <Text style={styles.emptyTitle}>No scan to trace</Text>
        <PrimaryButton
          title="Back to Upload"
          onPress={() => navigation.navigate("MainTabs", { screen: "Upload" })}
        />
      </SafeAreaView>
    );
  }

  const activeId = highlight?.id;
  const showingFiltered = categoryFilter !== "all";
  const issueCountLabel = showingFiltered
    ? `${filteredEntries.length} of ${enrichedEntries.length} issue${enrichedEntries.length === 1 ? "" : "s"}`
    : `${enrichedEntries.length} issue${enrichedEntries.length === 1 ? "" : "s"}`;

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={styles.toolbar}>
        <View style={styles.toolbarRow}>
          <BackToDashboardButton onPress={backToResults} label="Back to results" />
          <Pressable
            style={({ pressed }) => [styles.fullBtn, pressed && { backgroundColor: "#047857" }]}
            onPress={viewFullResult}
            accessibilityRole="button"
          >
            <Text style={styles.fullBtnText}>View Full Result</Text>
          </Pressable>
        </View>
        <Text style={styles.title}>Issue tracing &amp; XAI</Text>
        <Text style={styles.hint}>
          Select an issue to highlight it in the manuscript. Filter by category to narrow the list.
          {hiddenLocations > 0
            ? ` ${hiddenLocations} additional matching locations are counted in the totals.`
            : ""}
        </Text>
        {approximateTrace ? (
          <Text style={styles.approxNote}>
            Approximate locations — this file was scanned without exact page breaks. Highlights may
            be off by a page. For precise tracing, upload a PDF of the same manuscript.
          </Text>
        ) : null}
        {paginationNote ? <Text style={styles.hint}>{paginationNote}</Text> : null}
      </View>

      <View style={styles.docFrame}>
        <TraceDocumentViewer
          key={scanFlow.file?.uri || result.cloudinaryUrl || "empty"}
          file={scanFlow.file}
          documentUrl={result.cloudinaryUrl || ""}
          documentName={result.documentName || scanFlow.file?.name || ""}
          preview={result.documentPreview}
          pageCount={result.pageCount}
          formatChecks={result.formatChecks}
          highlight={highlight}
        />
      </View>

      <View style={styles.aside}>
        <View style={styles.asideHead}>
          <View style={styles.asideHeadRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.asideTitle}>{issueCountLabel}</Text>
              <Text style={styles.asideHint}>
                Tap to jump to the matching page and line when location data is available.
              </Text>
            </View>
            {showingFiltered ? (
              <Pressable onPress={() => setCategoryFilter("all")} hitSlop={8} accessibilityRole="button">
                <Text style={styles.clearFilter}>Clear filter</Text>
              </Pressable>
            ) : null}
          </View>

          <Text style={styles.filterLabel}>Category</Text>
          <Pressable
            onPress={() => setFilterOpen((open) => !open)}
            style={styles.filterBtn}
            accessibilityRole="button"
            accessibilityLabel="Filter by category"
          >
            <Text style={styles.filterBtnText}>
              {categoryFilter === "all"
                ? `All categories (${enrichedEntries.length})`
                : `${categoryFilter} (${categoryCounts[categoryFilter] || 0})`}
            </Text>
            <Text style={styles.filterChevron}>{filterOpen ? "▲" : "▼"}</Text>
          </Pressable>
          {filterOpen ? (
            <View style={styles.filterMenu}>
              <Pressable
                onPress={() => {
                  setCategoryFilter("all");
                  setFilterOpen(false);
                }}
                style={styles.filterOption}
              >
                <Text style={styles.filterOptionText}>All categories ({enrichedEntries.length})</Text>
              </Pressable>
              {categoryOptions.map((name) => (
                <Pressable
                  key={name}
                  onPress={() => {
                    setCategoryFilter(name);
                    setFilterOpen(false);
                  }}
                  style={styles.filterOption}
                >
                  <Text style={styles.filterOptionText}>
                    {name} ({categoryCounts[name] || 0})
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => item.id}
          initialNumToRender={20}
          windowSize={11}
          extraData={activeId}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.emptyList}>
              {!enrichedEntries.length ? (
                <>
                  <Text style={styles.emptyListTitle}>No formatting issues detected</Text>
                  <Text style={styles.noIssues}>
                    All formatting checks passed against the confirmed mechanics.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.emptyListTitle}>No issues match these filters</Text>
                  <Pressable onPress={() => setCategoryFilter("all")} hitSlop={8}>
                    <Text style={styles.clearFilter}>Clear filter</Text>
                  </Pressable>
                </>
              )}
            </View>
          }
          renderItem={({ item }) => {
            const active = item.id === activeId;
            const tone = SEVERITY[item.severity] || SEVERITY.minor;
            const xai = consolidateXai(item);
            const loc = resolveLocation(item);
            const canLocate = loc.page != null || loc.line != null || loc.bbox || loc.excerpt;
            return (
              <Pressable
                onPress={() => onSelectIssue(item)}
                style={({ pressed }) => [
                  styles.issueRow,
                  active
                    ? { backgroundColor: tone.activeBg, borderColor: tone.activeBorder }
                    : pressed
                      ? { backgroundColor: "#f8fafc" }
                      : null,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <View style={styles.issueMeta}>
                  <Text style={styles.issueLoc}>{formatLocation(item)}</Text>
                  <View style={[styles.sevTag, { backgroundColor: tone.tagBg, borderColor: tone.tagBorder }]}>
                    <Text style={[styles.sevTagText, { color: tone.tagText }]}>{tone.label}</Text>
                  </View>
                  {item.category ? (
                    <View style={styles.catTag}>
                      <Text style={styles.catTagText}>{item.category}</Text>
                    </View>
                  ) : null}
                  {!canLocate ? <Text style={styles.locMissing}>Location unavailable</Text> : null}
                </View>
                <Text style={styles.issueFinding}>{xai.finding}</Text>
                {xai.rule ? (
                  <Text style={styles.xaiLine}>
                    <Text style={styles.xaiLabel}>Rule · </Text>
                    {xai.rule}
                  </Text>
                ) : null}
                {xai.why ? (
                  <Text style={styles.xaiWhy}>
                    <Text style={styles.xaiWhyLabel}>Why · </Text>
                    {xai.why}
                  </Text>
                ) : null}
                {xai.fix ? (
                  <View style={styles.fixBox}>
                    <Text style={styles.fixText}>
                      <Text style={styles.fixBold}>Fix · </Text>
                      {xai.fix}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pageBg },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 12 },
  toolbar: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
  toolbarRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  fullBtn: {
    minHeight: 44,
    justifyContent: "center",
    backgroundColor: "#059669",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  fullBtnText: { fontSize: 12, fontWeight: "700", color: colors.white },
  title: { marginTop: 10, fontSize: 17, fontWeight: "700", color: "#172033" },
  hint: { marginTop: 2, fontSize: 12, lineHeight: 17, color: colors.muted },
  approxNote: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
    fontSize: 11,
    lineHeight: 16,
    color: "#92400e",
  },
  docFrame: {
    flex: 1.2,
    marginHorizontal: 12,
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#e8ecf1",
  },
  aside: {
    flex: 1.15,
    margin: 12,
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  asideHead: {
    zIndex: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    backgroundColor: "#f8fffd",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  asideHeadRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  asideTitle: { fontSize: 14, fontWeight: "700", color: "#1e293b" },
  asideHint: { marginTop: 1, fontSize: 11, color: colors.muted },
  clearFilter: { fontSize: 11, fontWeight: "600", color: "#0d9488", textDecorationLine: "underline" },
  filterLabel: {
    marginTop: 10,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  filterBtn: {
    marginTop: 4,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  filterBtnText: { fontSize: 12, fontWeight: "600", color: "#334155" },
  filterChevron: { fontSize: 10, color: colors.muted },
  filterMenu: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: "hidden",
  },
  filterOption: { paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#f1f5f9" },
  filterOptionText: { fontSize: 12, fontWeight: "600", color: "#334155" },
  separator: { height: 1, backgroundColor: "#f1f5f9" },
  issueRow: { paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: "transparent" },
  issueMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  issueLoc: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#16bfa8",
  },
  sevTag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  sevTagText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  catTag: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  catTagText: { fontSize: 10, fontWeight: "600", color: "#475569" },
  locMissing: { fontSize: 10, fontWeight: "600", color: "#94a3b8" },
  issueFinding: { marginTop: 6, fontSize: 14, fontWeight: "600", color: "#1e293b" },
  xaiLine: { marginTop: 4, fontSize: 11, color: "#64748b" },
  xaiLabel: { fontWeight: "600", color: "#475569" },
  xaiWhy: { marginTop: 8, fontSize: 12, lineHeight: 18, color: "#475569" },
  xaiWhyLabel: { fontWeight: "600", color: "#334155" },
  fixBox: {
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(22,191,168,0.25)",
    backgroundColor: "#f0fdfb",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  fixText: { fontSize: 11, fontWeight: "500", lineHeight: 16, color: "#0d7a6a" },
  fixBold: { fontWeight: "700" },
  emptyList: { paddingHorizontal: 16, paddingVertical: 32, alignItems: "center", gap: 8 },
  emptyListTitle: { fontSize: 14, fontWeight: "600", color: "#334155", textAlign: "center" },
  noIssues: { fontSize: 12, color: colors.muted, textAlign: "center" },
});
