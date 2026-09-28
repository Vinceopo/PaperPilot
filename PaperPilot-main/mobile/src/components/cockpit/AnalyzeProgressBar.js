import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";

export default function AnalyzeProgressBar({ progress }) {
  const target = Math.min(100, Math.max(0, Number(progress?.percent) || 0));
  const [shown, setShown] = useState(0);
  const stage = String(progress?.stage || "queued");
  const message = progress?.message || "";

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setShown((current) => {
        if (current >= target - 0.15) return target;
        return Math.min(target, current + Math.max(0.35, (target - current) * 0.14));
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  const width = `${Math.min(100, Math.max(0, shown))}%`;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Analysing…</Text>
      <View style={styles.metaRow}>
        <Text style={styles.stage}>{stage}</Text>
        <Text style={styles.percent}>{Math.round(shown)}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width }]} />
      </View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
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
  metaRow: {
    marginTop: 16,
    width: "100%",
    maxWidth: 320,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  stage: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.slate,
    textTransform: "capitalize",
  },
  track: {
    marginTop: 8,
    width: "100%",
    maxWidth: 320,
    height: 12,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    overflow: "hidden",
  },
  fill: {
    height: 12,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  percent: { fontSize: 12, fontWeight: "600", color: colors.slate },
  message: { marginTop: 8, fontSize: 12, color: colors.muted, textAlign: "center" },
});
