/**
 * Issues detected panel — severity filters, page chips, expandable rows.
 */

import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";

const SEVERITY = {
  minor: {
    label: "Minor",
    pillBg: colors.amberBg,
    pillBorder: "#fde68a",
    pillText: colors.amber,
    activeBg: "#fde68a",
    badgeBg: "#fbbf24",
    borderLeft: "#fbbf24",
    rowBg: "#fffbeb",
    tagBg: "#fef3c7",
    tagText: "#b45309",
  },
  moderate: {
    label: "Moderate",
    pillBg: "#ffedd5",
    pillBorder: "#fed7aa",
    pillText: "#c2410c",
    activeBg: "#fdba74",
    badgeBg: "#f97316",
    borderLeft: "#fb923c",
    rowBg: "#fff7ed",
    tagBg: "#ffedd5",
    tagText: "#c2410c",
  },
  critical: {
    label: "Critical",
    pillBg: colors.roseBg,
    pillBorder: colors.roseBorder,
    pillText: colors.rose,
    activeBg: "#fecdd3",
    badgeBg: colors.rose,
    borderLeft: colors.rose,
    rowBg: "#fff1f2",
    tagBg: "#ffe4e6",
    tagText: colors.rose,
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

export function normalizeDetectedIssues(formatChecks = [], pageCountHint = 0) {
  const entries = [];
  let maxPage = Math.max(0, Number(pageCountHint) || 0);

  formatChecks.forEach((check, checkIdx) => {
    if (!check || check.result === "PASS") return;
    const severity = normalizeSeverity(check.severity, check.result);
    const rawLocs =
      Array.isArray(check.locations) && check.locations.length
        ? check.locations
        : [{ page: null, line: null, section: check.section || "General" }];

    rawLocs.forEach((loc, locIdx) => {
      const page = loc?.page == null || loc.page === "" ? null : Number(loc.page);
      const line = loc?.line == null || loc.line === "" ? null : Number(loc.line);
      if (page != null && !Number.isNaN(page)) maxPage = Math.max(maxPage, page);
      entries.push({
        id: `${check.id || check.issue_type || "chk"}-${checkIdx}-${locIdx}`,
        page,
        line: line != null && !Number.isNaN(line) ? line : null,
        section: loc?.section || check.section || "General",
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

  return { entries, pageCount: maxPage };
}

function IssueRow({ entry }) {
  const [open, setOpen] = useState(false);
  const s = SEVERITY[entry.severity] || SEVERITY.minor;
  const pageStr = entry.page != null ? `Page ${entry.page}` : "Doc";
  const lineStr = entry.line != null ? `, Line ${entry.line}` : "";

  return (
    <View style={[styles.issue, { borderLeftColor: s.borderLeft, backgroundColor: s.rowBg }]}>
      <Pressable style={styles.issueHead} onPress={() => setOpen((v) => !v)}>
        <View style={styles.locBadge}>
          <Text style={styles.locText}>
            {pageStr}
            <Text style={styles.locAccent}>{lineStr}</Text>
          </Text>
        </View>
        <Text style={styles.finding} numberOfLines={open ? undefined : 2}>
          {entry.finding}
        </Text>
        <View
          style={[
            styles.sevTag,
            { backgroundColor: s.tagBg, borderColor: s.pillBorder },
          ]}
        >
          <Text style={[styles.sevTagText, { color: s.tagText }]}>{s.label}</Text>
        </View>
      </Pressable>

      {open ? (
        <View style={styles.xai}>
          <Text style={styles.xaiLabel}>Explanation</Text>
          <Text style={styles.xaiBody}>{entry.explanation}</Text>
          {entry.recommendation ? (
            <View style={styles.recBox}>
              <Text style={styles.recText}>{entry.recommendation}</Text>
            </View>
          ) : null}
          <Text style={styles.locFoot}>
            {entry.page != null ? `Page ${entry.page}` : "Document-level"}
            {entry.line != null ? `, Line ${entry.line}` : ""}
            {entry.section ? ` · ${entry.section}` : ""}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function IssuesDetectedPanel({ formatChecks = [], pageCount: pageCountProp = 0 }) {
  const [severityFilter, setSeverityFilter] = useState(null);
  const [selectedPage, setSelectedPage] = useState("all");

  const { entries } = useMemo(
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
    const sourceEntries = severityFilter
      ? entries.filter((e) => e.severity === severityFilter)
      : entries;
    return [...new Set(sourceEntries.map((e) => e.page).filter((p) => p != null))].sort(
      (a, b) => a - b
    );
  }, [entries, severityFilter]);

  useEffect(() => {
    setSeverityFilter(null);
    setSelectedPage("all");
  }, [formatChecks]);

  useEffect(() => {
    if (severityFilter) setSelectedPage("all");
  }, [severityFilter]);

  const visibleEntries = useMemo(() => {
    let list = entries;
    if (severityFilter) list = list.filter((e) => e.severity === severityFilter);
    if (selectedPage !== "all") {
      const n = Number(selectedPage);
      list = list.filter((e) => e.page === n);
    }
    return list;
  }, [entries, severityFilter, selectedPage]);

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
      <View style={styles.pills}>
        {(["minor", "moderate", "critical"]).map((key) => {
          const s = SEVERITY[key];
          const count = counts[key];
          const active = severityFilter === key;
          return (
            <Pressable
              key={key}
              onPress={() => setSeverityFilter((cur) => (cur === key ? null : key))}
              style={[
                styles.pill,
                {
                  backgroundColor: active ? s.activeBg : s.pillBg,
                  borderColor: active ? s.badgeBg : s.pillBorder,
                  opacity: count === 0 ? 0.4 : 1,
                },
              ]}
            >
              <Text style={[styles.pillText, { color: s.pillText }]}>
                {count} {s.label}
              </Text>
            </Pressable>
          );
        })}
        {severityFilter ? (
          <Pressable onPress={() => setSeverityFilter(null)}>
            <Text style={styles.clearFilter}>Clear filter ×</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.pageChips}>
        <Pressable
          style={[styles.pageChip, selectedPage === "all" && styles.pageChipActive]}
          onPress={() => setSelectedPage("all")}
        >
          <Text
            style={[styles.pageChipText, selectedPage === "all" && styles.pageChipTextActive]}
          >
            All
          </Text>
        </Pressable>
        {pages.map((page) => (
          <Pressable
            key={page}
            style={[styles.pageChip, selectedPage === page && styles.pageChipActive]}
            onPress={() => setSelectedPage(page)}
          >
            <Text
              style={[
                styles.pageChipText,
                selectedPage === page && styles.pageChipTextActive,
              ]}
            >
              p.{page}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ gap: 10, marginTop: 12 }}>
        {visibleEntries.length ? (
          visibleEntries.map((entry) => <IssueRow key={entry.id} entry={entry} />)
        ) : (
          <Text style={styles.muted}>No issues found here.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: "hidden",
    paddingBottom: 14,
  },
  empty: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 24,
    alignItems: "center",
  },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  emptyBody: { marginTop: 6, fontSize: 12, color: colors.muted, textAlign: "center" },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    alignItems: "center",
  },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillText: { fontSize: 12, fontWeight: "700" },
  clearFilter: { fontSize: 11, fontWeight: "600", color: colors.slate, textDecorationLine: "underline" },
  pageChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  pageChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.fileBg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pageChipActive: {
    borderColor: colors.sidebar,
    backgroundColor: colors.sidebar,
  },
  pageChipText: { fontSize: 11, fontWeight: "700", color: colors.slate },
  pageChipTextActive: { color: colors.white },
  muted: { fontSize: 13, color: colors.muted, paddingHorizontal: 14 },
  issue: {
    marginHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    overflow: "hidden",
  },
  issueHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
  },
  locBadge: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  locText: { fontSize: 11, fontWeight: "700", color: colors.slate, fontFamily: "monospace" },
  locAccent: { color: colors.accent },
  finding: { flex: 1, fontSize: 13, fontWeight: "600", color: "#334155", lineHeight: 18 },
  sevTag: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sevTagText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  xai: {
    borderTopWidth: 1,
    borderTopColor: "rgba(226,232,240,0.9)",
    backgroundColor: colors.white,
    padding: 12,
  },
  xaiLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.muted,
  },
  xaiBody: { marginTop: 8, fontSize: 13, lineHeight: 19, color: colors.slate },
  recBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "rgba(22,191,168,0.3)",
    backgroundColor: "#f0fdfb",
    borderRadius: 10,
    padding: 10,
  },
  recText: { fontSize: 12, fontWeight: "600", color: "#0d7a6a", lineHeight: 18 },
  locFoot: { marginTop: 8, fontSize: 11, color: colors.muted },
});
