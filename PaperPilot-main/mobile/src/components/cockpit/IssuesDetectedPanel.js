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

const CATEGORY_ORDER = [
  "Fonts",
  "Margins",
  "Indentation",
  "Spacing",
  "Alignment",
  "Pagination",
  "Captions",
  "Citations",
  "Other",
];

/** Maps a finding to the same category buckets used on web Score Breakdown / Issue Tracing. */
export function categoryForIssue(entry = {}) {
  const section = String(entry.section || entry.category || "").trim();
  if (section) {
    const known = CATEGORY_ORDER.find((name) => name.toLowerCase() === section.toLowerCase());
    return known || section;
  }
  const type = String(entry.issue_type || "").toLowerCase();
  if (type.startsWith("font") || type.includes("heading")) return "Fonts";
  if (type.includes("margin") || type.includes("paper") || type.includes("orientation")) {
    return "Margins";
  }
  if (type.includes("indent")) return "Indentation";
  if (type.includes("spacing") || type.includes("line_spacing") || type.includes("word_spacing")) {
    return "Spacing";
  }
  if (type.includes("align")) return "Alignment";
  if (type.includes("pagination") || type.includes("page_number") || type.includes("page_token")) {
    return "Pagination";
  }
  if (type.includes("caption") || type.startsWith("table_") || type.startsWith("figure_")) {
    return "Captions";
  }
  if (type.includes("citation")) return "Citations";
  return "Other";
}

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
  const seenCards = new Set();

  formatChecks.forEach((check, checkIdx) => {
    if (!check || check.result === "PASS") return;
    const severity = normalizeSeverity(check.severity, check.result);
    const issueType = check.issue_type || check.id || "";
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
      const bbox = normalized.bbox;
      const bboxKey = bbox
        ? [bbox.x, bbox.y, bbox.w, bbox.h].map((n) => Number(n || 0).toFixed(3)).join(",")
        : "";
      const excerpt = String(normalized.excerpt || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80)
        .toLowerCase();
      const cardKey = `${issueType}|${page ?? ""}|${line ?? ""}|${bboxKey}|${excerpt}`;
      if (seenCards.has(cardKey)) return;
      seenCards.add(cardKey);
      const locSummary = typeof loc?.summary === "string" ? loc.summary.trim() : "";
      const locExplanation = typeof loc?.explanation === "string" ? loc.explanation.trim() : "";
      const locRecommendation =
        typeof loc?.recommendation === "string" ? loc.recommendation.trim() : "";
      const draft = {
        id: `${check.id || check.issue_type || "chk"}-${checkIdx}-${locIdx}`,
        issue_type: issueType,
        page,
        line,
        section: normalized.section || check.section || "General",
        severity,
        title: check.name || check.title || check.issue_type || "Formatting issue",
        finding:
          locSummary ||
          check.finding ||
          check.details ||
          check.description ||
          check.name ||
          "Formatting discrepancy detected",
        explanation:
          locExplanation ||
          check.explanation ||
          check.details ||
          check.description ||
          "This formatting rule does not match the confirmed mechanics.",
        recommendation: locRecommendation || check.recommendation || "",
        result: check.result,
        location: normalized,
        bbox: normalized.bbox,
        excerpt: normalized.excerpt,
        margin_side: loc?.margin_side || loc?.marginSide || normalized.margin_side || "",
        page_region: loc?.page_region || loc?.pageRegion || normalized.page_region || "",
      };
      draft.category = categoryForIssue(draft);
      entries.push(draft);
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


function SparkleIcon({ size = 16 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityLabel="AI">
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

/** One concise XAI block per issue — matches web IssueTracingSection. */
function consolidateXai(entry) {
  const finding = String(entry.finding || "").trim() || "Formatting discrepancy detected";
  const why = distinctText(finding, entry.explanation);
  const fix = distinctText(finding, distinctText(why, entry.recommendation));
  const rule = String(entry.section || entry.category || "").trim();
  return { finding, why, fix, rule };
}

function IssueItem({ entry, onTrace }) {
  const s = SEVERITY[entry.severity] || SEVERITY.minor;
  const xai = consolidateXai(entry);
  const category = entry.category || categoryForIssue(entry);
  const body = (
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
          {category ? (
            <View style={styles.categoryChip}>
              <Text style={styles.categoryChipText}>{category}</Text>
            </View>
          ) : null}
          <View style={styles.aiTag}>
            <View style={styles.aiIconBox} accessibilityLabel="AI-detected finding">
              <SparkleIcon size={14} />
            </View>
          </View>
        </View>
        <Text style={styles.finding}>{xai.finding}</Text>
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
          <View style={styles.recBox}>
            <Text style={styles.recText}>
              <Text style={styles.fixLabel}>Fix · </Text>
              {xai.fix}
            </Text>
          </View>
        ) : null}
        <Text style={styles.locFoot}>
          {entry.page != null ? `Page ${entry.page}` : "Document-level"}
          {entry.line != null ? `, Line ${entry.line}` : ""}
        </Text>
        {onTrace ? <Text style={styles.traceHint}>Tap to trace in document</Text> : null}
      </View>
    </View>
  );

  if (!onTrace) {
    return <View style={styles.item}>{body}</View>;
  }

  return (
    <Pressable
      onPress={() => onTrace(entry)}
      accessibilityRole="button"
      accessibilityLabel={`Trace ${entry.finding || "issue"} in document`}
      style={({ pressed }) => [styles.item, styles.itemTraceable, pressed && styles.itemPressed]}
    >
      {body}
    </Pressable>
  );
}

export default function IssuesDetectedPanel({
  formatChecks = [],
  pageCount: pageCountProp = 0,
  pagination = null,
  onTraceIssue = null,
}) {
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [selectedPage, setSelectedPage] = useState("all");
  const [reviewed, setReviewed] = useState(() => new Set());
  const [limit, setLimit] = useState(RENDER_STEP);

  const { entries, pageCount, hiddenLocations } = useMemo(
    () => normalizeDetectedIssues(formatChecks, pageCountProp),
    [formatChecks, pageCountProp]
  );

  const categoryCounts = useMemo(() => {
    const c = {};
    entries.forEach((e) => {
      const key = e.category || categoryForIssue(e);
      c[key] = (c[key] || 0) + 1;
    });
    return c;
  }, [entries]);

  const categoryOptions = useMemo(() => {
    const ordered = CATEGORY_ORDER.filter((name) => categoryCounts[name]);
    const extras = Object.keys(categoryCounts)
      .filter((name) => !CATEGORY_ORDER.includes(name))
      .sort((a, b) => a.localeCompare(b));
    return [...ordered, ...extras];
  }, [categoryCounts]);

  const pages = useMemo(() => {
    const fromIssues = entries.map((e) => e.page).filter((p) => p != null);
    const total = Math.max(Number(pageCountProp) || 0, pageCount, ...fromIssues, 0);
    if (total > 0) return Array.from({ length: total }, (_, i) => i + 1);
    return [...new Set(fromIssues)].sort((a, b) => a - b);
  }, [entries, pageCount, pageCountProp]);

  useEffect(() => {
    setCategoryFilter(null);
    setSelectedPage("all");
    setReviewed(new Set());
  }, [formatChecks]);

  useEffect(() => {
    setLimit(RENDER_STEP);
  }, [formatChecks, categoryFilter, selectedPage]);

  const visibleEntries = useMemo(() => {
    let list = entries;
    if (categoryFilter) {
      list = list.filter((e) => (e.category || categoryForIssue(e)) === categoryFilter);
    }
    if (selectedPage !== "all") {
      const n = Number(selectedPage);
      list = list.filter((e) => e.page === n);
    }
    return list;
  }, [entries, categoryFilter, selectedPage]);

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
    let filtered = entries;
    if (categoryFilter) {
      filtered = filtered.filter((e) => (e.category || categoryForIssue(e)) === categoryFilter);
    }
    filtered.forEach((e) => {
      const key = e.page ?? "all";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    });
    return map;
  }, [entries, categoryFilter]);

  const isReviewed = reviewed.has(String(selectedPage));
  const totalVisible = categoryFilter
    ? categoryCounts[categoryFilter] || 0
    : entries.length;
  const paginationNote = pagination?.note || "";
  const remainingCount = Math.max(0, visibleEntries.length - limit);
  const filtersActive = Boolean(categoryFilter);

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
          Each card explains what failed, why it matters, and how to fix it — filter by category or
          page if you want a smaller pass.
          {hiddenLocations > 0
            ? ` ${hiddenLocations} additional matching locations are counted in the totals.`
            : ""}
        </Text>
        {paginationNote ? <Text style={styles.headerNote}>{paginationNote}</Text> : null}
      </View>

      <View style={styles.categoryBlock}>
        <Text style={styles.categoryLabel}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          <Pressable
            onPress={() => {
              setCategoryFilter(null);
              setSelectedPage("all");
            }}
            accessibilityState={{ selected: !categoryFilter }}
            style={[styles.categoryPill, !categoryFilter && styles.categoryPillActive]}
          >
            <Text style={[styles.categoryPillText, !categoryFilter && styles.categoryPillTextActive]}>
              All categories ({entries.length})
            </Text>
          </Pressable>
          {categoryOptions.map((name) => {
            const active = categoryFilter === name;
            const count = categoryCounts[name] || 0;
            return (
              <Pressable
                key={name}
                onPress={() => {
                  setCategoryFilter((cur) => (cur === name ? null : name));
                  setSelectedPage("all");
                }}
                accessibilityState={{ selected: active }}
                style={[styles.categoryPill, active && styles.categoryPillActive]}
              >
                <Text style={[styles.categoryPillText, active && styles.categoryPillTextActive]}>
                  {name} ({count})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {filtersActive ? (
          <Pressable onPress={() => setCategoryFilter(null)} hitSlop={6} style={styles.clearFilter}>
            <Text style={styles.showAll}>Clear filter</Text>
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
              <CountBadge count={totalVisible} color={SEVERITY[worstSeverity(entries)].badge} />
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
              ? categoryFilter
                ? `${categoryFilter} issues`
                : "All issues (every category)"
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
                    <IssueItem entry={entry} onTrace={onTraceIssue} />
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
  itemTraceable: { minHeight: 48 },
  itemPressed: { backgroundColor: "rgba(220,247,242,0.85)" },
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
  aiTag: { flexDirection: "row", alignItems: "center", gap: 6 },
  aiIconBox: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  explanation: { marginTop: 8, fontSize: 14, lineHeight: 21, color: "#475569" },
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
  categoryChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  categoryChipText: { fontSize: 10, fontWeight: "600", color: "#475569" },
  xaiLine: { marginTop: 4, fontSize: 11, lineHeight: 16, color: "#64748b" },
  xaiLabel: { fontWeight: "600", color: "#475569" },
  xaiWhy: { marginTop: 8, fontSize: 12, lineHeight: 18, color: "#475569" },
  xaiWhyLabel: { fontWeight: "600", color: "#334155" },
  fixLabel: { fontWeight: "700" },
  categoryBlock: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 8,
  },
  categoryLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  categoryRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 8 },
  categoryPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: "center",
  },
  categoryPillActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  categoryPillText: { fontSize: 12, fontWeight: "600", color: "#475569" },
  categoryPillTextActive: { color: colors.accentText },
  clearFilter: { alignSelf: "flex-start" },
  traceHint: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.accentText,
  },
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
