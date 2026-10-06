/**
 * IssuesDetectedPanel
 *
 * Lists every detected formatting issue in one place so authors can fix them
 * together. Severity pills are optional filters — default view is ALL issues.
 */

import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "../../theme";
import { normalizeIssueLocation } from "../../lib/scanMapper";

/** Issue cards rendered per "Show more" step; thousands at once would stall the phone. */
const RENDER_STEP = 40;

const SEVERITY = {
  minor: {
    label: "Minor",
    pillBg: "#fef3c7",
    pillBorder: "#fde68a",
    pillText: "#92400e",
    activeBg: "#fde68a",
    activeBorder: "#fbbf24",
    badge: "#fbbf24",
    rowBg: "rgba(255,251,235,0.4)",
    tagBg: "#fef3c7",
    tagBorder: "#fde68a",
    tagText: "#b45309",
  },
  moderate: {
    label: "Moderate",
    pillBg: "#ffedd5",
    pillBorder: "#fed7aa",
    pillText: "#9a3412",
    activeBg: "#fed7aa",
    activeBorder: "#fb923c",
    badge: "#f97316",
    rowBg: "rgba(255,247,237,0.4)",
    tagBg: "#ffedd5",
    tagBorder: "#fed7aa",
    tagText: "#c2410c",
  },
  critical: {
    label: "Critical",
    pillBg: "#ffe4e6",
    pillBorder: "#fecdd3",
    pillText: "#9f1239",
    activeBg: "#fecdd3",
    activeBorder: "#fb7185",
    badge: "#f43f5e",
    rowBg: "rgba(255,241,242,0.4)",
    tagBg: "#ffe4e6",
    tagBorder: "#fecdd3",
    tagText: "#be123c",
  },
};

function normalizeSeverity(raw, result) {
  const v = String(raw || "").toLowerCase();
  if (v === "critical" || v === "major") return "critical";
  if (v === "moderate" || v === "warning") return "moderate";
  if (v === "minor") return "minor";
  if (result === "FAIL") return "critical";
  if (result === "REVIEW") return "moderate";
  return "minor";
}

function severityRank(s) {
  return s === "critical" ? 3 : s === "moderate" ? 2 : 1;
}

function worstSeverity(list) {
  return list.reduce(
    (best, item) => (severityRank(item.severity) > severityRank(best) ? item.severity : best),
    "minor"
  );
}

export function normalizeDetectedIssues(formatChecks = [], pageCountHint = 0) {
  const entries = [];
  let maxPage = Math.max(0, Number(pageCountHint) || 0);
  let hiddenLocations = 0;

  formatChecks.forEach((check, checkIdx) => {
    if (!check || check.result === "PASS") return;
    const severity = normalizeSeverity(check.severity, check.result);
    const rawLocs =
      Array.isArray(check.locations) && check.locations.length
        ? check.locations
        : [{ page: null, line: null, section: check.section || "General" }];
    const reported = Number(check.count);
    if (Number.isFinite(reported) && reported > rawLocs.length) {
      hiddenLocations += reported - rawLocs.length;
    }

    rawLocs.forEach((loc, locIdx) => {
      const normalized = normalizeIssueLocation(loc);
      const page =
        normalized.page == null || Number.isNaN(normalized.page) ? null : normalized.page;
      const line =
        normalized.line == null || Number.isNaN(normalized.line) ? null : normalized.line;
      if (page != null) maxPage = Math.max(maxPage, page);
      entries.push({
        id: `${check.id || check.issue_type || "chk"}-${checkIdx}-${locIdx}`,
        page,
        line,
        section: normalized.section || check.section || "General",
        severity,
        title: check.name || check.title || check.issue_type || "Formatting issue",
        finding:
          check.finding ||
          check.details ||
          check.description ||
          check.name ||
          "Formatting discrepancy detected",
        explanation:
          check.explanation ||
          check.details ||
          check.description ||
          "This formatting rule does not match the confirmed mechanics.",
        recommendation: check.recommendation || "",
        result: check.result,
        location: normalized,
        bbox: normalized.bbox,
        excerpt: normalized.excerpt,
      });
    });
  });

  entries.sort((a, b) => {
    const pa = a.page ?? 999999;
    const pb = b.page ?? 999999;
    if (pa !== pb) return pa - pb;
    const la = a.line ?? 999999;
    const lb = b.line ?? 999999;
    if (la !== lb) return la - lb;
    return severityRank(b.severity) - severityRank(a.severity);
  });

  return { entries, pageCount: maxPage, hiddenLocations };
}

function TriangleIcon({ color, size = 14 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function SparkleIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" accessibilityLabel="XAI explanation">
      <Path
        d="M12 3.5 13.6 8.4 18.5 10 13.6 11.6 12 16.5 10.4 11.6 5.5 10 10.4 8.4 12 3.5Z"
        stroke="#94a3b8"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M18 15.5 18.7 17.3 20.5 18 18.7 18.7 18 20.5 17.3 18.7 15.5 18 17.3 17.3 18 15.5Z"
        stroke="#94a3b8"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CheckCircleIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        stroke={colors.accent}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function LocationBadge({ page, line }) {
  return (
    <View style={styles.locBadge}>
      <Text style={styles.locText}>
        {page != null ? `Page ${page}` : "Doc"}
        {line != null ? <Text style={styles.locAccent}>{`, Line ${line}`}</Text> : null}
      </Text>
    </View>
  );
}

function CountBadge({ count, color }) {
  return (
    <View style={[styles.countBadge, { backgroundColor: color }]}>
      <Text style={styles.countBadgeText}>{count}</Text>
    </View>
  );
}

function IssueItem({ entry }) {
  const s = SEVERITY[entry.severity] || SEVERITY.minor;
  return (
    <View style={styles.item}>
      <View style={styles.itemRow}>
        <View style={styles.lineBadge}>
          <Text style={[styles.lineBadgeText, entry.line == null && { color: "#94a3b8" }]}>
            {entry.line != null ? `Line ${entry.line}` : "Page"}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.tagRow}>
            <View style={[styles.sevTag, { backgroundColor: s.tagBg, borderColor: s.tagBorder }]}>
              <Text style={[styles.sevTagText, { color: s.tagText }]}>{s.label}</Text>
            </View>
            <Text style={styles.section}>{entry.section}</Text>
          </View>
          <Text style={styles.finding}>{entry.finding}</Text>
          <View style={styles.sparkle}>
            <SparkleIcon />
          </View>
          <Text style={styles.explanation}>{entry.explanation}</Text>
          {entry.recommendation ? (
            <View style={styles.recBox}>
              <CheckCircleIcon />
              <Text style={styles.recText}>{entry.recommendation}</Text>
            </View>
          ) : null}
          <Text style={styles.locFoot}>
            {entry.page != null ? `Page ${entry.page}` : "Document-level"}
            {entry.line != null ? `, Line ${entry.line}` : ""}
            {entry.section ? ` · ${entry.section}` : ""}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function IssuesDetectedPanel({
  formatChecks = [],
  pageCount: pageCountProp = 0,
  pagination = null,
}) {
  const [severityFilter, setSeverityFilter] = useState(null);
  const [selectedPage, setSelectedPage] = useState("all");
  const [reviewed, setReviewed] = useState(() => new Set());
  const [limit, setLimit] = useState(RENDER_STEP);

  const { entries, pageCount, hiddenLocations } = useMemo(
    () => normalizeDetectedIssues(formatChecks, pageCountProp),
    [formatChecks, pageCountProp]
  );

  const counts = useMemo(() => {
    const c = { minor: 0, moderate: 0, critical: 0 };
    entries.forEach((e) => {
      c[e.severity] = (c[e.severity] || 0) + 1;
    });
    return c;
  }, [entries]);

  const pages = useMemo(() => {
    const fromIssues = entries.map((e) => e.page).filter((p) => p != null);
    const total = Math.max(Number(pageCountProp) || 0, pageCount, ...fromIssues, 0);
    if (total > 0) return Array.from({ length: total }, (_, i) => i + 1);
    return [...new Set(fromIssues)].sort((a, b) => a - b);
  }, [entries, pageCount, pageCountProp]);

  useEffect(() => {
    setSeverityFilter(null);
    setSelectedPage("all");
    setReviewed(new Set());
  }, [formatChecks]);

  useEffect(() => {
    setLimit(RENDER_STEP);
  }, [formatChecks, severityFilter, selectedPage]);

  const visibleEntries = useMemo(() => {
    let list = entries;
    if (severityFilter) list = list.filter((e) => e.severity === severityFilter);
    if (selectedPage !== "all") {
      const n = Number(selectedPage);
      list = list.filter((e) => e.page === n);
    }
    return list;
  }, [entries, severityFilter, selectedPage]);

  const issueBlocks = useMemo(() => {
    const map = new Map();
    visibleEntries.slice(0, limit).forEach((entry) => {
      const key = `${entry.page ?? "doc"}`;
      if (!map.has(key)) map.set(key, { key, page: entry.page, items: [] });
      map.get(key).items.push(entry);
    });
    const pageTotals = new Map();
    visibleEntries.forEach((entry) => {
      const key = `${entry.page ?? "doc"}`;
      pageTotals.set(key, (pageTotals.get(key) || 0) + 1);
    });
    return [...map.values()]
      .map((block) => ({
        ...block,
        total: pageTotals.get(block.key) || block.items.length,
        severity: worstSeverity(block.items),
        items: [...block.items].sort((a, b) => {
          const lineA = a.line == null ? Number.MAX_SAFE_INTEGER : Number(a.line);
          const lineB = b.line == null ? Number.MAX_SAFE_INTEGER : Number(b.line);
          if (lineA !== lineB) return lineA - lineB;
          return severityRank(b.severity) - severityRank(a.severity);
        }),
      }))
      .sort((a, b) => {
        const pageA = a.page == null ? Number.MAX_SAFE_INTEGER : Number(a.page);
        const pageB = b.page == null ? Number.MAX_SAFE_INTEGER : Number(b.page);
        return pageA - pageB;
      });
  }, [visibleEntries, limit]);

  const entriesByPage = useMemo(() => {
    const map = new Map();
    const filtered = severityFilter ? entries.filter((e) => e.severity === severityFilter) : entries;
    filtered.forEach((e) => {
      const key = e.page ?? "all";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    });
    return map;
  }, [entries, severityFilter]);

  const isReviewed = reviewed.has(String(selectedPage));
  const totalVisible = severityFilter ? counts[severityFilter] : entries.length;
  const paginationNote = pagination?.note || "";
  const remainingCount = Math.max(0, visibleEntries.length - limit);

  if (!entries.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No formatting issues detected</Text>
        <Text style={styles.emptyBody}>
          All formatting checks passed against the confirmed mechanics.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {entries.length} formatting finding{entries.length === 1 ? "" : "s"} to review
        </Text>
        <Text style={styles.headerBody}>
          {counts.critical} critical · {counts.moderate} moderate · {counts.minor} minor. Each card
          explains what failed, why it matters, and how to fix it — filter by severity or page if you
          want a smaller pass.
          {hiddenLocations > 0
            ? ` ${hiddenLocations} additional matching locations are counted in the totals.`
            : ""}
        </Text>
        {paginationNote ? <Text style={styles.headerNote}>{paginationNote}</Text> : null}
      </View>

      <View style={styles.pills}>
        {["minor", "moderate", "critical"].map((key) => {
          const s = SEVERITY[key];
          const count = counts[key];
          const active = severityFilter === key;
          return (
            <Pressable
              key={key}
              onPress={() => {
                setSeverityFilter((cur) => (cur === key ? null : key));
                setSelectedPage("all");
              }}
              accessibilityState={{ selected: active }}
              style={[
                styles.pill,
                {
                  backgroundColor: active ? s.activeBg : s.pillBg,
                  borderColor: active ? s.activeBorder : s.pillBorder,
                  opacity: count === 0 ? 0.4 : 1,
                },
              ]}
            >
              <TriangleIcon color={s.pillText} size={13} />
              <Text style={[styles.pillText, { color: s.pillText }]}>
                {count} {s.label}
              </Text>
            </Pressable>
          );
        })}
        {severityFilter ? (
          <Pressable onPress={() => setSeverityFilter(null)} hitSlop={6}>
            <Text style={styles.showAll}>Show all issues ×</Text>
          </Pressable>
        ) : (
          <Text style={styles.filterHint}>Optional filter only — default is every issue</Text>
        )}
      </View>

      <View style={styles.aside}>
        <Text style={styles.asideLabel}>Pages</Text>
        <ScrollView style={styles.pageList} nestedScrollEnabled>
          <Pressable
            onPress={() => setSelectedPage("all")}
            style={[styles.pageBtn, selectedPage === "all" && styles.pageBtnActive]}
          >
            <Text style={[styles.pageBtnText, selectedPage === "all" && styles.pageBtnTextActive]}>
              All issues
            </Text>
            {totalVisible > 0 ? (
              <CountBadge
                count={totalVisible}
                color={SEVERITY[severityFilter || worstSeverity(entries)].badge}
              />
            ) : null}
          </Pressable>
          {pages.map((page) => {
            const pageEntries = entriesByPage.get(page) || [];
            const active = selectedPage === page;
            return (
              <Pressable
                key={page}
                onPress={() => setSelectedPage(page)}
                style={[styles.pageBtn, active && styles.pageBtnActive]}
              >
                <Text style={[styles.pageBtnText, active && styles.pageBtnTextActive]}>Page {page}</Text>
                {pageEntries.length ? (
                  <CountBadge count={pageEntries.length} color={SEVERITY[worstSeverity(pageEntries)].badge} />
                ) : (
                  <Text style={styles.zero}>0</Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.listHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.listTitle}>
            {selectedPage === "all"
              ? severityFilter
                ? `All ${SEVERITY[severityFilter].label} issues`
                : "All issues (every severity)"
              : `Page ${selectedPage}`}
            <Text style={styles.listCount}>
              {" "}
              · {visibleEntries.length} issue{visibleEntries.length !== 1 ? "s" : ""}
            </Text>
          </Text>
          {isReviewed ? <Text style={styles.reviewedText}>✓ Marked as reviewed</Text> : null}
        </View>
        <Pressable
          hitSlop={6}
          onPress={() =>
            setReviewed((prev) => {
              const next = new Set(prev);
              const key = String(selectedPage);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            })
          }
        >
          <Text style={styles.reviewBtn}>{isReviewed ? "Undo reviewed" : "Mark reviewed"}</Text>
        </Pressable>
      </View>

      {visibleEntries.length === 0 ? (
        <Text style={styles.noneHere}>No issues found here.</Text>
      ) : (
        <View style={styles.blocks}>
          {issueBlocks.map((block) => {
            const s = SEVERITY[block.severity] || SEVERITY.minor;
            const lines = [
              ...new Set(block.items.map((item) => item.line).filter((line) => line != null)),
            ];
            return (
              <View key={block.key} style={[styles.block, { backgroundColor: s.rowBg }]}>
                <View style={styles.blockHead}>
                  <View style={styles.blockHeadRow}>
                    <LocationBadge page={block.page} line={lines.length === 1 ? lines[0] : null} />
                    <View style={[styles.sevTag, { backgroundColor: s.tagBg, borderColor: s.tagBorder }]}>
                      <Text style={[styles.sevTagText, { color: s.tagText }]}>
                        {block.total} on this page
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.blockNote}>
                    On each page, line 1 is the first typeable/visible line; numbers restart at 1
                  </Text>
                </View>
                {block.items.map((entry, index) => (
                  <View key={entry.id} style={index > 0 ? styles.itemDivider : null}>
                    <IssueItem entry={entry} />
                  </View>
                ))}
              </View>
            );
          })}
          {remainingCount > 0 ? (
            <Pressable
              style={({ pressed }) => [styles.moreBtn, pressed && { backgroundColor: "#eefbf8" }]}
              onPress={() => setLimit((n) => n + RENDER_STEP)}
            >
              <Text style={styles.moreText}>
                Show {Math.min(RENDER_STEP, remainingCount)} more · {remainingCount} remaining
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  empty: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 28,
    alignItems: "center",
  },
  emptyTitle: { fontSize: 14, fontWeight: "600", color: "#334155" },
  emptyBody: { marginTop: 4, fontSize: 12, color: "#94a3b8", textAlign: "center" },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    backgroundColor: "#f8fffd",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 14, fontWeight: "700", color: "#1e293b" },
  headerBody: { marginTop: 2, fontSize: 11, lineHeight: 17, color: "#64748b" },
  headerNote: { marginTop: 4, fontSize: 11, lineHeight: 17, color: "#64748b" },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pillText: { fontSize: 12, fontWeight: "600" },
  showAll: { fontSize: 11, fontWeight: "600", color: "#0d9488" },
  filterHint: { width: "100%", fontSize: 11, color: "#94a3b8" },
  aside: {
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    backgroundColor: "#fafbfc",
    paddingBottom: 10,
  },
  asideLabel: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  pageList: { maxHeight: 260, paddingHorizontal: 8 },
  pageBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 2,
  },
  pageBtnActive: { backgroundColor: "rgba(226,232,240,0.8)" },
  pageBtnText: { fontSize: 14, fontWeight: "500", color: "#475569" },
  pageBtnTextActive: { fontWeight: "700", color: "#1e293b" },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: { fontSize: 10, fontWeight: "700", color: colors.white },
  zero: { fontSize: 10, fontWeight: "600", color: "#cbd5e1" },
  listHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  listTitle: { fontSize: 16, fontWeight: "700", color: "#1e293b" },
  listCount: { fontWeight: "400", color: "#94a3b8" },
  reviewedText: { marginTop: 2, fontSize: 11, fontWeight: "600", color: "#059669" },
  reviewBtn: { fontSize: 14, fontWeight: "600", color: colors.accent },
  noneHere: { marginTop: 28, marginBottom: 24, paddingHorizontal: 16, fontSize: 14, color: "#94a3b8" },
  blocks: { gap: 12, padding: 16 },
  block: {
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  blockHead: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(226,232,240,0.7)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  blockHeadRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  blockNote: { marginTop: 4, fontSize: 11, lineHeight: 16, color: "#94a3b8" },
  locBadge: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  locText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
    fontFamily: "Menlo",
  },
  locAccent: { color: colors.accent },
  sevTag: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sevTagText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  itemDivider: { borderTopWidth: 1, borderTopColor: "rgba(226,232,240,0.7)" },
  item: { backgroundColor: "rgba(255,255,255,0.7)", paddingHorizontal: 14, paddingVertical: 14 },
  itemRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  lineBadge: {
    marginTop: 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  lineBadgeText: { fontSize: 10, fontWeight: "700", color: "#0d9488" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  section: { fontSize: 11, fontWeight: "600", color: "#94a3b8" },
  finding: { marginTop: 4, fontSize: 14, lineHeight: 20, fontWeight: "600", color: "#1e293b" },
  sparkle: { marginTop: 8, width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  explanation: { marginTop: 4, fontSize: 14, lineHeight: 21, color: "#475569" },
  recBox: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(22,191,168,0.3)",
    backgroundColor: "#f0fdfb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  recText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: "500", color: "#0d7a6a" },
  locFoot: { marginTop: 8, fontSize: 11, color: "#94a3b8" },
  moreBtn: {
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingVertical: 12,
  },
  moreText: { fontSize: 12, fontWeight: "700", color: "#109b89" },
});
