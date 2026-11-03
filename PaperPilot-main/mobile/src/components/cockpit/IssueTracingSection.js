/**
 * Issue Tracing + XAI — document preview with clickable findings.
 * RN port of web IssueTracingSection.jsx (stacked layout: preview on top, findings below).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";
import { categoryForIssue, normalizeDetectedIssues } from "./IssuesDetectedPanel";
import { normalizeIssueLocation } from "../../lib/scanMapper";
import { isApproximateTracing } from "../../lib/documentPreviewLocate";
import TraceDocumentViewer from "./TraceDocumentViewer";
import SelectField from "../ui/SelectField";

/** Findings rendered per "Show more" step; thousands at once would stall the phone. */
const RENDER_STEP = 40;
const PREVIEW_HEIGHT = 400;
const EMPTY_CHECKS = [];

const SEVERITY = {
  minor: {
    label: "Minor",
    tagBg: "#fef3c7",
    tagText: "#b45309",
    tagBorder: "#fde68a",
    activeBg: "rgba(255,251,235,0.9)",
    activeBorder: "#fcd34d",
  },
  moderate: {
    label: "Moderate",
    tagBg: "#ffedd5",
    tagText: "#c2410c",
    tagBorder: "#fed7aa",
    activeBg: "rgba(255,247,237,0.9)",
    activeBorder: "#fdba74",
  },
  critical: {
    label: "Critical",
    tagBg: "#ffe4e6",
    tagText: "#be123c",
    tagBorder: "#fecdd3",
    activeBg: "rgba(255,241,242,0.9)",
    activeBorder: "#fda4af",
  },
};

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

export default function IssueTracingSection({
  result,
  file = null,
  documentLoading = false,
  onFocusPreview = null,
}) {
  const [activeIssueId, setActiveIssueId] = useState(null);
  const [scrollTarget, setScrollTarget] = useState(null);
  const [highlight, setHighlight] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [limit, setLimit] = useState(RENDER_STEP);

  const formatChecks = result?.formatChecks || EMPTY_CHECKS;
  const pageCount = result?.pageCount || 0;
  const paginationNote = result?.pagination?.note || "";
  const approximateTrace = isApproximateTracing(result?.pagination);

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

  const filteredEntries = useMemo(() => {
    if (categoryFilter === "all") return enrichedEntries;
    return enrichedEntries.filter((entry) => entry.category === categoryFilter);
  }, [enrichedEntries, categoryFilter]);

  useEffect(() => {
    setCategoryFilter("all");
    setActiveIssueId(null);
    setHighlight(null);
    setScrollTarget(null);
  }, [formatChecks]);

  useEffect(() => {
    setLimit(RENDER_STEP);
  }, [formatChecks, categoryFilter]);

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
        // Match the same rule — do not reuse another category's highlight at the same page/line.
        if (entry.issue_type && check.issue_type && entry.issue_type !== check.issue_type) continue;
        if (entry.section && check.section && entry.section !== check.section) continue;
        for (const loc of check.locations || []) {
          const samePage = loc.page === entry.page;
          const sameLine =
            entry.line == null
              ? loc.line == null || loc.line === undefined
              : loc.line === entry.line;
          if (samePage && sameLine) {
            return loc;
          }
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
      setActiveIssueId(entry.id);
      const marked = {
        ...loc,
        severity: entry.severity,
        finding: entry.finding || entry.title || "",
        explanation: entry.explanation || loc.explanation || "",
        recommendation: entry.recommendation || loc.recommendation || "",
        section: entry.section || loc.section,
        issue_type: entry.issue_type || "",
        margin_side: loc.margin_side || loc.marginSide || "",
        page_region: loc.page_region || loc.pageRegion || "",
        page_align: loc.page_align || loc.pageAlign || entry.page_align || "",
        // Keep finding text as a locate hint when excerpt is missing.
        excerpt: loc.excerpt || entry.excerpt || "",
      };
      // Pagination: never paint body line 1 / chapter text — header/footer chip only.
      if (String(marked.section || "").toLowerCase() === "pagination") {
        marked.line = null;
        marked.excerpt = "";
        marked.bbox = null;
        if (!marked.page_region) marked.page_region = "top";
      }
      // Pin whenever we have a page (fallback highlight still paints if line/excerpt miss).
      const canLocate = marked.page != null;
      setHighlight({ id: entry.id, ...marked });
      if (canLocate) {
        setScrollTarget({ ...marked, token: Date.now() });
      } else {
        setScrollTarget(null);
      }
      // Stacked layout: bring the preview back into view so the highlight is visible.
      if (onFocusPreview) onFocusPreview();
    },
    [resolveLocation, onFocusPreview]
  );

  // Do not auto-jump to the first issue — wait until the user taps one.
  useEffect(() => {
    if (!filteredEntries.length) {
      setActiveIssueId(null);
      setHighlight(null);
      setScrollTarget(null);
      return;
    }
    if (activeIssueId && !filteredEntries.some((e) => e.id === activeIssueId)) {
      setActiveIssueId(null);
      setHighlight(null);
      setScrollTarget(null);
    }
  }, [filteredEntries, activeIssueId]);

  const hasPreview = Boolean(
    file || documentLoading || result?.cloudinaryUrl || result?.documentPreview
  );
  const showingFiltered = categoryFilter !== "all";
  const issueCountLabel = showingFiltered
    ? `${filteredEntries.length} of ${enrichedEntries.length} issue${enrichedEntries.length === 1 ? "" : "s"}`
    : `${enrichedEntries.length} issue${enrichedEntries.length === 1 ? "" : "s"}`;

  const selectOptions = useMemo(
    () => [
      { value: "all", label: `All categories (${enrichedEntries.length})` },
      ...categoryOptions.map((name) => ({
        value: name,
        label: `${name} (${categoryCounts[name] || 0})`,
      })),
    ],
    [categoryOptions, categoryCounts, enrichedEntries.length]
  );

  const visibleEntries = filteredEntries.slice(0, limit);
  const remainingCount = Math.max(0, filteredEntries.length - limit);

  return (
    <View style={styles.card}>
      <View style={styles.previewWrap}>
        {hasPreview ? (
          <View style={styles.previewFrame}>
            <TraceDocumentViewer
              key={file?.uri || result?.cloudinaryUrl || "preview"}
              file={file}
              documentLoading={documentLoading}
              documentUrl={result?.cloudinaryUrl || ""}
              documentName={result?.documentName || file?.name || ""}
              preview={result?.documentPreview}
              pageCount={pageCount}
              formatChecks={formatChecks}
              scrollTarget={scrollTarget}
              highlight={highlight}
              emptyLabel="Preview unavailable for this version."
            />
          </View>
        ) : (
          <View style={styles.previewEmpty}>
            <Text style={styles.previewEmptyText}>
              Document preview will appear when the manuscript file or document URL is available.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Issue tracing & XAI</Text>
        <Text style={styles.headerBody}>
          Select an issue to highlight it in the manuscript. Filter by category to narrow the list.
          {hiddenLocations > 0
            ? ` ${hiddenLocations} additional matching locations are counted in the totals.`
            : ""}
        </Text>
        {approximateTrace ? (
          <Text style={styles.approxNote}>
            Approximate locations — this Word file was scanned without exact page breaks. Highlights
            may be off by a page. For precise tracing, upload a PDF of the same manuscript (or
            open/save the DOCX in Word so rendered page breaks are stored).
          </Text>
        ) : null}
        {paginationNote ? <Text style={styles.paginationNote}>{paginationNote}</Text> : null}
      </View>

      <View style={styles.controls}>
        <View style={styles.controlsTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.countLabel}>{issueCountLabel}</Text>
            <Text style={styles.countHint}>
              Click to jump to the matching page and line when location data is available.
            </Text>
          </View>
          {showingFiltered ? (
            <Pressable onPress={() => setCategoryFilter("all")} hitSlop={8}>
              <Text style={styles.clearFilter}>Clear filter</Text>
            </Pressable>
          ) : null}
        </View>

        <View>
          <Text style={styles.categoryLabel}>Category</Text>
          <SelectField
            value={categoryFilter}
            options={selectOptions}
            onChange={setCategoryFilter}
            title="Filter by category"
            style={styles.select}
            textStyle={styles.selectText}
          />
        </View>
      </View>

      <View>
        {visibleEntries.map((entry, index) => {
          const active = entry.id === activeIssueId;
          const tone = SEVERITY[entry.severity] || SEVERITY.minor;
          const xai = consolidateXai(entry);
          const loc = resolveLocation(entry);
          const canLocate = loc.page != null || loc.line != null || loc.bbox || loc.excerpt;

          return (
            <Pressable
              key={entry.id}
              onPress={() => onSelectIssue(entry)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.item,
                index > 0 && styles.itemDivider,
                active && { backgroundColor: tone.activeBg, borderColor: tone.activeBorder },
                !active && pressed && styles.itemPressed,
              ]}
            >
              <View style={styles.tagRow}>
                <Text style={styles.locText}>{formatLocation(entry)}</Text>
                <View
                  style={[styles.sevTag, { backgroundColor: tone.tagBg, borderColor: tone.tagBorder }]}
                >
                  <Text style={[styles.sevTagText, { color: tone.tagText }]}>{tone.label}</Text>
                </View>
                {entry.category ? (
                  <View style={styles.catTag}>
                    <Text style={styles.catTagText}>{entry.category}</Text>
                  </View>
                ) : null}
                {!canLocate ? <Text style={styles.noLoc}>Location unavailable</Text> : null}
              </View>

              <Text style={styles.finding}>{xai.finding}</Text>

              {xai.rule ? (
                <Text style={styles.rule}>
                  <Text style={styles.ruleLabel}>Rule · </Text>
                  {xai.rule}
                </Text>
              ) : null}

              {xai.why ? (
                <Text style={styles.why}>
                  <Text style={styles.whyLabel}>Why · </Text>
                  {xai.why}
                </Text>
              ) : null}

              {xai.fix ? (
                <View style={styles.fixBox}>
                  <Text style={styles.fixText}>
                    <Text style={styles.fixLabel}>Fix · </Text>
                    {xai.fix}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}

        {remainingCount > 0 ? (
          <View style={styles.moreWrap}>
            <Pressable
              style={({ pressed }) => [styles.moreBtn, pressed && { backgroundColor: "#eefbf8" }]}
              onPress={() => setLimit((n) => n + RENDER_STEP)}
            >
              <Text style={styles.moreText}>
                Show {Math.min(RENDER_STEP, remainingCount)} more · {remainingCount} remaining
              </Text>
            </Pressable>
          </View>
        ) : null}

        {!enrichedEntries.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No formatting issues detected</Text>
            <Text style={styles.emptyBody}>
              All formatting checks passed against the confirmed mechanics.
            </Text>
          </View>
        ) : null}

        {enrichedEntries.length > 0 && filteredEntries.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No issues match these filters</Text>
            <Pressable onPress={() => setCategoryFilter("all")} hitSlop={8}>
              <Text style={styles.emptyClear}>Clear filter</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: colors.white,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  previewWrap: {
    backgroundColor: "#e8ecf1",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  previewFrame: {
    height: PREVIEW_HEIGHT,
    overflow: "hidden",
    borderRadius: 12,
    backgroundColor: "#e8ecf1",
  },
  previewEmpty: {
    minHeight: 256,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    backgroundColor: "rgba(255,255,255,0.6)",
    paddingHorizontal: 24,
  },
  previewEmptyText: { fontSize: 14, textAlign: "center", color: "#64748b" },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    backgroundColor: "#f8fffd",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 14, fontWeight: "700", color: "#1e293b" },
  headerBody: { marginTop: 2, fontSize: 11, lineHeight: 17, color: "#64748b" },
  approxNote: {
    marginTop: 4,
    overflow: "hidden",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 11,
    lineHeight: 17,
    color: "#78350f",
  },
  paginationNote: { marginTop: 4, fontSize: 11, lineHeight: 17, color: "#64748b" },
  controls: {
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  controlsTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  countLabel: { fontSize: 14, fontWeight: "700", color: "#1e293b" },
  countHint: { fontSize: 11, color: "#64748b" },
  clearFilter: { fontSize: 11, fontWeight: "600", color: "#0d9488", textDecorationLine: "underline" },
  categoryLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  select: { marginTop: 4, height: 38, borderRadius: 8, paddingHorizontal: 10 },
  selectText: { fontSize: 12, fontWeight: "600", color: "#334155" },
  item: {
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  itemDivider: { borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  itemPressed: { backgroundColor: "#f8fafc" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  locText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#16bfa8",
  },
  sevTag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  sevTagText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  catTag: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  catTagText: { fontSize: 10, fontWeight: "600", color: "#475569" },
  noLoc: { fontSize: 10, fontWeight: "600", color: "#94a3b8" },
  finding: { marginTop: 6, fontSize: 14, fontWeight: "600", lineHeight: 20, color: "#1e293b" },
  rule: { marginTop: 4, fontSize: 11, color: "#64748b" },
  ruleLabel: { fontWeight: "600", color: "#475569" },
  why: { marginTop: 8, fontSize: 12, lineHeight: 19, color: "#475569" },
  whyLabel: { fontWeight: "600", color: "#334155" },
  fixBox: {
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(22,191,168,0.25)",
    backgroundColor: "#f0fdfb",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  fixText: { fontSize: 11, fontWeight: "500", lineHeight: 17, color: "#0d7a6a" },
  fixLabel: { fontWeight: "700" },
  moreWrap: { padding: 16, borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  moreBtn: {
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingVertical: 12,
  },
  moreText: { fontSize: 12, fontWeight: "700", color: "#109b89" },
  empty: { alignItems: "center", paddingHorizontal: 16, paddingVertical: 40 },
  emptyTitle: { fontSize: 14, fontWeight: "600", color: "#334155", textAlign: "center" },
  emptyBody: { marginTop: 4, fontSize: 12, color: "#94a3b8", textAlign: "center" },
  emptyClear: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
    color: "#0d9488",
    textDecorationLine: "underline",
  },
});
