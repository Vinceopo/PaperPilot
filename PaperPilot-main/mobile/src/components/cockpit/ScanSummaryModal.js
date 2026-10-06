import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";
import {
  formatCount,
  formatPct as pctLabel,
  formatScore,
  hasValue,
  plural,
  roundSharesToTotal,
} from "../../lib/scoreFormat";

const SEVERITY_STYLES = {
  critical: { bg: "#ffe4e6", border: "#fecdd3", text: "#9f1239" },
  moderate: { bg: "#ffedd5", border: "#fed7aa", text: "#9a3412" },
  minor: { bg: "#fef3c7", border: "#fde68a", text: "#92400e" },
};

const SEVERITY_KEYS = ["critical", "moderate", "minor"];
const SEVERITY_LABELS = { critical: "Critical", moderate: "Moderate", minor: "Minor" };

export default function ScanSummaryModal({
  visible,
  result,
  onViewDocument,
  onViewFullResult,
  onDismiss,
}) {
  if (!result) return null;

  const [rightPct, wrongPct] = roundSharesToTotal([result.rightPct, result.wrongPct]);
  const overall = result.overallScore;
  const clusterRows = (result.categoryWrongPct || [])
    .filter((row) => hasValue(row.pct) && row.failedUnits > 0)
    .sort((a, b) => b.pct - a.pct);
  const clusterShown = roundSharesToTotal(clusterRows.map((row) => row.pct));
  const categories = clusterRows.map((row, i) => ({ ...row, shown: clusterShown[i] }));
  const severityShown = result.severityPct
    ? roundSharesToTotal(SEVERITY_KEYS.map((key) => result.severityPct[key]))
    : null;
  const severity = severityShown
    ? Object.fromEntries(SEVERITY_KEYS.map((key, i) => [key, severityShown[i]]))
    : null;
  const issueCount = (result.formatChecks || []).filter(
    (c) => c.result === "FAIL" || c.result === "REVIEW"
  ).length;
  const unitsChecked = result.unitsChecked;
  const unitsFailed = result.unitsFailed;
  const nothingMeasured = hasValue(unitsChecked) && Number(unitsChecked) === 0;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
            <Text style={styles.kicker}>Scan complete</Text>
            <Text style={styles.title} numberOfLines={2}>
              {result.documentTitle || "Your manuscript"}
            </Text>
            <Text style={styles.subtitle}>
              Formatting compliance summary — not grammar or content.
              {issueCount > 0
                ? ` ${issueCount} issue type${issueCount === 1 ? "" : "s"} flagged.`
                : " No format issues flagged."}
            </Text>

            <View style={styles.scoreRow}>
              <View style={[styles.scoreBox, styles.scoreOverall]}>
                <Text style={[styles.scoreLabel, { color: colors.muted }]}>Overall</Text>
                <Text style={[styles.scoreValue, { color: "#172033" }]}>
                  {hasValue(overall) ? `${formatScore(overall, 0)}%` : "—"}
                </Text>
              </View>
              <View style={[styles.scoreBox, styles.scoreRight]}>
                <Text style={[styles.scoreLabel, { color: "#047857" }]}>Right</Text>
                <Text style={[styles.scoreValue, { color: "#047857" }]}>{pctLabel(rightPct)}</Text>
              </View>
              <View style={[styles.scoreBox, styles.scoreWrong]}>
                <Text style={[styles.scoreLabel, { color: "#be123c" }]}>Wrong</Text>
                <Text style={[styles.scoreValue, { color: "#be123c" }]}>{pctLabel(wrongPct)}</Text>
              </View>
            </View>

            {hasValue(unitsChecked) ? (
              <Text style={styles.units}>
                Checked {formatCount(unitsChecked)} formatting {plural(unitsChecked, "unit")}
                {hasValue(unitsFailed) ? ` · ${formatCount(unitsFailed)} failed` : ""}
              </Text>
            ) : null}
            {!result.scoringVersion ? (
              <Text style={styles.units}>
                Full unit counts are not stored for this scan. Re-analyse the manuscript to generate them.
              </Text>
            ) : null}
            {result.scoringConsistency && result.scoringConsistency.ok === false ? (
              <Text style={styles.consistencyWarn} accessibilityRole="alert">
                These results failed an internal consistency check. Re-run the analysis before relying on them.
              </Text>
            ) : null}

            {categories.length ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Where issues cluster (% of failed units)</Text>
                {categories.map((row) => (
                  <View key={row.section} style={styles.catRow}>
                    <Text style={styles.catLabel} numberOfLines={1}>
                      {row.section}
                    </Text>
                    <View style={styles.catTrack}>
                      <View
                        style={[
                          styles.catFill,
                          { width: `${Math.min(100, Math.max(0, row.pct))}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.catPct}>{pctLabel(row.shown)}</Text>
                  </View>
                ))}
              </View>
            ) : result.scoringVersion || nothingMeasured ? (
              <View style={styles.cleanBox}>
                <Text style={styles.cleanText}>
                  {nothingMeasured
                    ? "No formatting unit could be measured, so there is no failure breakdown."
                    : "No measured formatting unit failed."}
                </Text>
              </View>
            ) : null}

            <View style={styles.block}>
              <Text style={styles.blockTitle}>Severity mix (% of issues found)</Text>
              {severity ? (
                <View style={styles.sevRow}>
                  {SEVERITY_KEYS.map((key) => {
                    const c = SEVERITY_STYLES[key];
                    return (
                      <View
                        key={key}
                        style={[styles.sevChip, { backgroundColor: c.bg, borderColor: c.border }]}
                      >
                        <Text style={[styles.sevChipText, { color: c.text }]}>
                          {SEVERITY_LABELS[key]} {pctLabel(severity[key])}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.noIssues}>No issues found.</Text>
              )}
            </View>

            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [styles.secondaryBtn, pressed && { backgroundColor: "#f8fafc" }]}
                onPress={onViewDocument}
              >
                <Text style={styles.secondaryBtnText}>View Document</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.primaryBtn, pressed && { backgroundColor: "#047857" }]}
                onPress={onViewFullResult}
              >
                <Text style={styles.primaryBtnText}>View Full Result</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 512,
    maxHeight: "90%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    shadowColor: "#0f172a",
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  scroll: { padding: 22 },
  kicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: "#16bfa8",
  },
  title: { marginTop: 4, fontSize: 20, fontWeight: "700", color: "#172033" },
  subtitle: { marginTop: 4, fontSize: 12, lineHeight: 17, color: colors.muted },
  scoreRow: { marginTop: 18, flexDirection: "row", gap: 8 },
  scoreBox: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 12,
    alignItems: "center",
  },
  scoreOverall: { backgroundColor: "#f8fafc", borderColor: colors.border },
  scoreRight: { backgroundColor: "rgba(236,253,245,0.8)", borderColor: "#a7f3d0" },
  scoreWrong: { backgroundColor: "rgba(255,241,242,0.8)", borderColor: "#fecdd3" },
  scoreLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  scoreValue: { marginTop: 4, fontSize: 22, fontWeight: "800" },
  units: { marginTop: 8, fontSize: 11, lineHeight: 16, color: "#64748b", textAlign: "center" },
  consistencyWarn: {
    marginTop: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 11,
    lineHeight: 16,
    color: "#92400e",
    textAlign: "center",
  },
  noIssues: { fontSize: 12, color: "#64748b" },
  block: { marginTop: 18 },
  blockTitle: {
    marginBottom: 8,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  catRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  catLabel: { width: 92, fontSize: 13, fontWeight: "600", color: "#334155" },
  catTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    overflow: "hidden",
  },
  catFill: { height: 8, borderRadius: 999, backgroundColor: "#fb7185" },
  catPct: { width: 48, fontSize: 12, fontWeight: "700", color: "#475569", textAlign: "right" },
  cleanBox: {
    marginTop: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d1fae5",
    backgroundColor: "rgba(236,253,245,0.6)",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cleanText: { fontSize: 13, lineHeight: 19, color: "#065f46" },
  sevRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sevChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  sevChipText: { fontSize: 12, fontWeight: "600" },
  actions: { marginTop: 24, flexDirection: "row", gap: 12 },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { fontSize: 14, fontWeight: "700", color: "#334155" },
  primaryBtn: {
    flex: 1,
    backgroundColor: "#059669",
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { fontSize: 14, fontWeight: "700", color: colors.white },
});
