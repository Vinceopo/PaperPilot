import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { ANALYSIS_STEPS, describeAnalysisProgress } from "../../lib/analysisProgress";

const SLOW_STEP_MS = 20_000;

/** Progress bar plus a status line naming the active analysis step. */
export default function AnalysisProgress({ progress, percent }) {
  const { stepIndex, done } = describeAnalysisProgress(progress);
  const [slow, setSlow] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setSlow(false);
    if (done) return undefined;
    const timer = setTimeout(() => setSlow(true), SLOW_STEP_MS);
    return () => clearTimeout(timer);
  }, [stepIndex, done]);

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [stepIndex, done, fade]);

  const safePercent = Math.min(100, Math.max(0, Number(percent) || 0));
  const activeStep = ANALYSIS_STEPS[Math.min(stepIndex, ANALYSIS_STEPS.length - 1)];

  return (
    <View style={styles.wrap}>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>{done ? "Complete" : "Analyzing…"}</Text>
        <Text style={styles.meta}>{Math.round(safePercent)}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${safePercent}%` }]} />
      </View>
      <Animated.Text
        style={[
          styles.step,
          {
            opacity: fade,
            transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }],
          },
        ]}
      >
        {done ? "Analysis complete" : `${activeStep.label}…`}
      </Animated.Text>
      {slow ? (
        <Text style={styles.slow}>Long documents can take a minute or two. Please keep this page open.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  meta: { fontSize: 12, fontWeight: "600", color: "#64748b", fontVariant: ["tabular-nums"] },
  track: {
    marginTop: 8,
    height: 12,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    overflow: "hidden",
  },
  fill: { height: 12, borderRadius: 999, backgroundColor: "#16bfa8" },
  step: { marginTop: 12, fontSize: 14, lineHeight: 21, color: "#475569", textAlign: "center" },
  slow: { marginTop: 4, fontSize: 11, color: "#94a3b8", textAlign: "center" },
});
