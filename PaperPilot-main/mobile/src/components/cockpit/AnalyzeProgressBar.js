import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";

const STAGE_LABELS = {
  queued: "Queued",
  parsing: "Parsing document",
  checking: "Checking formatting",
  scoring: "Scoring results",
  done: "Complete",
  failed: "Failed",
};

export default function AnalyzeProgressBar({ progress }) {
  const percent = Math.min(100, Math.max(0, Number(progress?.percent ?? 0)));
  const stage = String(progress?.stage || "checking").toLowerCase();
  const message = progress?.message || STAGE_LABELS[stage] || "Analysing…";

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Analysing…</Text>
      <Text style={styles.message}>{message}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%` }]} />
      </View>
      <Text style={styles.percent}>{Math.round(percent)}%</Text>
      <Text style={styles.hint}>Checking formatting against your mechanics profile.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.pageBg,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  message: { marginTop: 8, fontSize: 13, color: colors.slate, textAlign: "center" },
  track: {
    marginTop: 20,
    width: "100%",
    maxWidth: 320,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
    overflow: "hidden",
  },
  fill: {
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  percent: { marginTop: 8, fontSize: 12, fontWeight: "700", color: colors.accentText },
  hint: { marginTop: 12, fontSize: 12, color: colors.muted, textAlign: "center" },
});
