import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAppData } from "../context/AppDataContext";
import { colors } from "../theme";

const ORDER = { critical: 0, moderate: 1, minor: 2 };
const SEVERITY = {
  critical: { bg: colors.roseBg, border: colors.roseBorder, text: colors.rose },
  moderate: { bg: colors.amberBg, border: "#fde68a", text: colors.amber },
  minor: { bg: colors.skyBg, border: "#bae6fd", text: colors.sky },
};

function IssueCard({ issue, premium }) {
  const [open, setOpen] = useState(false);
  const severity = String(issue.severity || "minor").toLowerCase();
  const tone = SEVERITY[severity] || SEVERITY.minor;
  const locations = issue.locations || [];
  const pages = [...new Set(locations.map((loc) => loc.page).filter(Boolean))];

  return (
    <View style={styles.issue}>
      <View style={styles.issueTop}>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.severity,
              { backgroundColor: tone.bg, borderColor: tone.border, color: tone.text },
            ]}
          >
            {severity}
          </Text>
          <Text style={styles.issueTitle}>
            {issue.title || issue.summary || issue.issue_type}
          </Text>
          <Text style={styles.issueSummary}>{issue.summary}</Text>
        </View>
        <Text style={styles.count}>
          {issue.count || locations.length || 1} instance
          {(issue.count || locations.length) === 1 ? "" : "s"}
        </Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.whyBox}>
          <Text style={styles.boxLabel}>Why it was flagged</Text>
          <Text style={styles.boxBody}>
            {issue.explanation || "The document differs from the selected mechanics."}
          </Text>
        </View>
        <View style={styles.fixBox}>
          <Text style={[styles.boxLabel, { color: colors.emerald }]}>How to fix it</Text>
          <Text style={styles.boxBody}>
            {issue.recommendation || "Update the formatting to match the selected mechanics."}
          </Text>
        </View>
      </View>

      {pages.length ? (
        <View style={{ marginTop: 12 }}>
          <Pressable onPress={() => setOpen((v) => !v)}>
            <Text style={styles.locToggle}>
              {open ? "Hide" : "Show"} exact locations · page{pages.length === 1 ? "" : "s"}{" "}
              {pages.join(", ")}
            </Text>
          </Pressable>
          {open ? (
            <View style={styles.locList}>
              {locations.map((location, index) => (
                <Text key={`${location.page}-${location.line}-${index}`} style={styles.locItem}>
                  Page {location.page}, line {location.line || "—"}
                  {location.section ? ` · ${location.section}` : ""}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {!premium && issue.premium_detail_available ? (
        <Text style={styles.premiumTeaser}>
          Premium includes deeper AI reasoning for this issue.
        </Text>
      ) : null}
    </View>
  );
}

export default function ScanResultScreen() {
  const { result, tier } = useAppData();
  const issues = useMemo(
    () =>
      [...(result?.issues || [])].sort(
        (a, b) => (ORDER[a.severity] ?? 3) - (ORDER[b.severity] ?? 3)
      ),
    [result]
  );

  if (!result) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>No scan results yet</Text>
        <Text style={styles.emptyBody}>
          Upload a manuscript and run Upload & Analyse to see compliance findings here.
        </Text>
      </View>
    );
  }

  const sections = result.sections || result.section_checks || [];
  const score = Number(result.formatting_score ?? result.overall_score ?? 0);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>Compliance results</Text>
            <Text style={styles.title}>Formatting scan complete</Text>
            <Text style={styles.subtitle}>Issues are grouped and prioritized by impact.</Text>
          </View>
          <View style={styles.scoreCircle}>
            <Text style={styles.scoreValue}>{score.toFixed(2)}</Text>
            <Text style={styles.scoreLabel}>score</Text>
          </View>
        </View>

        {sections.length ? (
          <View style={{ marginTop: 20 }}>
            <Text style={styles.sectionTitle}>Section breakdown</Text>
            <View style={styles.sectionGrid}>
              {sections.map((section, index) => (
                <View key={section.section || section.name || index} style={styles.sectionCard}>
                  <Text style={styles.sectionName} numberOfLines={1}>
                    {section.section || section.name}
                  </Text>
                  <Text style={styles.sectionScore}>
                    {Number(section.formatting_score ?? section.score ?? 0).toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ marginTop: 20 }}>
          <View style={styles.issuesHeader}>
            <Text style={styles.sectionTitle}>Prioritized issues</Text>
            <Text style={styles.muted}>
              {issues.length} grouped finding{issues.length === 1 ? "" : "s"}
            </Text>
          </View>

          {issues.length ? (
            <View style={{ gap: 12, marginTop: 12 }}>
              {issues.map((issue, index) => (
                <IssueCard
                  key={`${issue.severity}-${issue.issue_type}-${index}`}
                  issue={issue}
                  premium={tier === "premium"}
                />
              ))}
            </View>
          ) : (
            <View style={styles.cleanBox}>
              <Text style={styles.cleanText}>
                No formatting deviations were detected against the selected mechanics.
              </Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pageBg },
  scroll: { padding: 16, paddingBottom: 40 },
  emptyWrap: {
    flex: 1,
    backgroundColor: colors.pageBg,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  emptyBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    textAlign: "center",
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 18,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  kicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.accent,
  },
  title: { marginTop: 4, fontSize: 20, fontWeight: "600", color: "#1e293b" },
  subtitle: { marginTop: 4, fontSize: 13, color: colors.muted },
  scoreCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 8,
    borderColor: "#d1fae5",
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreValue: { fontSize: 22, fontWeight: "700", color: colors.emerald },
  scoreLabel: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.slate,
  },
  sectionTitle: { fontSize: 14, fontWeight: "600", color: "#334155" },
  sectionGrid: { marginTop: 10, gap: 8 },
  sectionCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.fileBg,
    borderRadius: 12,
    padding: 12,
  },
  sectionName: { flex: 1, fontSize: 13, color: colors.slate },
  sectionScore: { fontWeight: "700", color: colors.emerald },
  issuesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  muted: { fontSize: 12, color: colors.slate },
  issue: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.fileBg,
    borderRadius: 12,
    padding: 14,
  },
  issueTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  severity: {
    alignSelf: "flex-start",
    overflow: "hidden",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  issueTitle: { marginTop: 8, fontSize: 15, fontWeight: "600", color: "#1e293b" },
  issueSummary: { marginTop: 4, fontSize: 13, lineHeight: 19, color: colors.slate },
  count: {
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    color: colors.slate,
    overflow: "hidden",
  },
  grid: { marginTop: 14, gap: 10 },
  whyBox: {
    borderWidth: 1,
    borderColor: "#f1f5f9",
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: 12,
  },
  fixBox: { backgroundColor: colors.emeraldBg, borderRadius: 10, padding: 12 },
  boxLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.slate,
  },
  boxBody: { marginTop: 6, fontSize: 13, lineHeight: 19, color: colors.slate },
  locToggle: { fontSize: 12, fontWeight: "600", color: "#16a994" },
  locList: {
    marginTop: 8,
    maxHeight: 140,
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: 12,
  },
  locItem: { fontSize: 12, color: colors.slate, marginBottom: 4 },
  premiumTeaser: { marginTop: 12, fontSize: 12, color: "#c4b5fd" },
  cleanBox: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.2)",
    backgroundColor: "rgba(16,185,129,0.06)",
    padding: 16,
  },
  cleanText: { fontSize: 13, color: colors.emerald },
});
