import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";
import { formatCount, formatPct, formatScore, hasValue, plural, roundSharesToTotal } from "../../lib/scoreFormat";

const SEV_COLORS = {
  critical: { bg: colors.roseBg, border: colors.roseBorder, text: colors.rose },
  moderate: { bg: "#ffedd5", border: "#fed7aa", text: "#c2410c" },
  minor: { bg: colors.amberBg, border: "#fde68a", text: colors.amber },
};

function CategoryRow({ section, pctOfWrong }) {
  return (
    <View style={styles.catRow}>
      <Text style={styles.catLabel} numberOfLines={1}>
        {section}
      </Text>
      <View style={styles.catTrack}>
        <View style={[styles.catFill, { width: `${Math.min(100, Number(pctOfWrong) || 0)}%` }]} />
      </View>
      <Text style={styles.catPct}>{formatPct(pctOfWrong)}</Text>
    </View>
  );
}

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
  const clusterRows = [...(result.categoryWrongPct || [])]
    .filter((row) => hasValue(row.pctOfWrong) && row.failedUnits > 0)
    .sort((a, b) => b.pctOfWrong - a.pctOfWrong);
  const clusterShown = roundSharesToTotal(clusterRows.map((row) => row.pctOfWrong));
  const categories = clusterRows.map((row, index) => ({ ...row, shown: clusterShown[index] }));
  const severityShown = result.severityPct
    ? roundSharesToTotal(["critical", "moderate", "minor"].map((key) => result.severityPct[key]))
    : null;
  const severity = severityShown
    ? { critical: severityShown[0], moderate: severityShown[1], minor: severityShown[2] }
    : null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
            <Text style={styles.kicker}>Scan complete</Text>
            <Text style={styles.title} numberOfLines={2}>
              {result.documentTitle || "Manuscript"}
            </Text>

            <View style={styles.scoreRow}>
              <View style={[styles.scoreBox, styles.scoreOverall]}>
                <Text style={styles.scoreLabel}>Overall</Text>
                <Text style={styles.scoreValue}>{hasValue(overall) ? `${formatScore(overall, 0)}%` : "—"}</Text>
              </View>
              <View style={[styles.scoreBox, styles.scoreRight]}>
                <Text style={styles.scoreLabel}>Right</Text>
                <Text style={styles.scoreValue}>{formatPct(rightPct)}</Text>
              </View>
              <View style={[styles.scoreBox, styles.scoreWrong]}>
                <Text style={styles.scoreLabel}>Wrong</Text>
                <Text style={styles.scoreValue}>{formatPct(wrongPct)}</Text>
              </View>
            </View>
            {hasValue(result.unitsChecked) ? (
              <Text style={styles.unitLine}>
                Checked {formatCount(result.unitsChecked)} {plural(result.unitsChecked, "unit")}
                {hasValue(result.unitsFailed) ? ` · ${formatCount(result.unitsFailed)} failed` : ""}
              </Text>
            ) : null}
            {!result.scoringVersion ? (
              <Text style={styles.unitLine}>
                Full unit counts are not stored for this scan. Re-analyse the manuscript to generate them.
              </Text>
            ) : null}
            {result.scoringConsistency && result.scoringConsistency.ok === false ? (
              <Text style={styles.warn}>
                These results failed an internal consistency check. Re-run the analysis before relying on them.
              </Text>
            ) : null}

            {categories.length ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Where issues cluster (% of failed units)</Text>
                {categories.map((item) => (
                  <CategoryRow
                    key={item.section}
                    section={item.section}
                    pctOfWrong={item.shown}
                  />
                ))}
              </View>
            ) : result.scoringVersion || (hasValue(result.unitsChecked) && Number(result.unitsChecked) === 0) ? (
              <Text style={styles.unitLine}>
                {hasValue(result.unitsChecked) && Number(result.unitsChecked) === 0
                  ? "No formatting unit could be measured, so there is no failure breakdown."
                  : "No measured formatting unit failed."}
              </Text>
            ) : null}

            <View style={styles.block}>
              <Text style={styles.blockTitle}>Severity mix (% of issues found)</Text>
              {severity ? (
                <View style={styles.sevRow}>
                  {(["critical", "moderate", "minor"]).map((key) => {
                    const c = SEV_COLORS[key];
                    return (
                      <View
                        key={key}
                        style={[styles.sevChip, { backgroundColor: c.bg, borderColor: c.border }]}
                      >
                        <Text style={[styles.sevChipText, { color: c.text }]}>
                          {key} · {formatPct(severity[key])}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.blockTitle}>No issues found.</Text>
              )}
            </View>

            <View style={styles.actions}>
              <Pressable style={styles.secondaryBtn} onPress={onViewDocument}>
                <Text style={styles.secondaryBtnText}>View Document</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={onViewFullResult}>
                <Text style={styles.primaryBtnText}>View Full Result</Text>
              </Pressable>
            </View>

            <Pressable onPress={onDismiss} style={styles.dismissWrap}>
              <Text style={styles.dismiss}>Close</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "88%",
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scroll: { padding: 20, paddingBottom: 28 },
  kicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.accent,
  },
  title: { marginTop: 6, fontSize: 18, fontWeight: "700", color: colors.text },
  scoreRow: { marginTop: 16, flexDirection: "row", gap: 10 },
  scoreBox: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  scoreOverall: { backgroundColor: "#f8fafc", borderColor: colors.border },
  scoreRight: { backgroundColor: colors.emeraldBg, borderColor: "#a7f3d0" },
  scoreWrong: { backgroundColor: colors.roseBg, borderColor: colors.roseBorder },
  unitLine: { marginTop: 8, fontSize: 11, color: colors.muted, textAlign: "center" },
  warn: { marginTop: 8, fontSize: 11, color: "#92400e", textAlign: "center" },
  scoreLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.muted,
  },
  scoreValue: { marginTop: 4, fontSize: 28, fontWeight: "800", color: colors.text },
  block: { marginTop: 18 },
  blockTitle: { fontSize: 11, fontWeight: "800", color: colors.slate, marginBottom: 8 },
  catRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  catLabel: { width: 72, fontSize: 11, fontWeight: "600", color: colors.slate },
  catTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    overflow: "hidden",
  },
  catFill: { height: 8, borderRadius: 999, backgroundColor: colors.rose },
  catPct: { width: 36, fontSize: 11, fontWeight: "700", color: colors.slate, textAlign: "right" },
  sevRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sevChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sevChipText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  actions: { marginTop: 22, flexDirection: "row", gap: 10 },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryBtnText: { fontSize: 13, fontWeight: "700", color: colors.slate },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.emerald,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { fontSize: 13, fontWeight: "800", color: colors.white },
  dismissWrap: { marginTop: 14, alignItems: "center" },
  dismiss: { fontSize: 12, fontWeight: "600", color: colors.muted, textDecorationLine: "underline" },
});
