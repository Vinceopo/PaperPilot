import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { colors } from "../../theme";
import PaperRollAnimation from "../ui/PaperRollAnimation";
import AnalysisProgress from "./AnalysisProgress";
import PaperCarryAway, { PAPER_CARRY_HOLD_MS, PAPER_CARRY_TOTAL_MS } from "./PaperCarryAway";

/** If the bar never visibly reaches 100%, start the flight anyway after this long. */
const MAX_HOLD_MS = 2500;

/**
 * "Analysing your document" screen: paper-roll animation and step progress, then the
 * page flies off on a paper plane before full results open (calls onReveal).
 */
export default function AnalyzeProgressBar({ progress, resultReady = false, onReveal }) {
  const { height: windowHeight } = useWindowDimensions();
  const target = Math.min(100, Math.max(0, Number(progress?.percent) || 0));
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);
  const [phase, setPhase] = useState("progress");
  const [flightDone, setFlightDone] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const stageDone = String(progress?.stage || "").toLowerCase() === "done";

  useEffect(() => {
    let frame = 0;
    let value = shownRef.current;
    const tick = () => {
      value =
        value >= target - 0.15
          ? target
          : Math.min(target, value + Math.max(0.35, (target - value) * 0.14));
      shownRef.current = value;
      setShown(value);
      if (value !== target) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  const reachedFull = shown >= 99.5;

  useEffect(() => {
    if (!stageDone || phase !== "progress") return undefined;
    const timer = setTimeout(() => setPhase("fly"), reachedFull ? PAPER_CARRY_HOLD_MS : MAX_HOLD_MS);
    return () => clearTimeout(timer);
  }, [stageDone, reachedFull, phase]);

  // The reveal must not depend on the animation's own callbacks firing.
  useEffect(() => {
    if (phase !== "fly") return undefined;
    const timer = setTimeout(() => setFlightDone(true), PAPER_CARRY_TOTAL_MS + 600);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    Animated.timing(fade, {
      toValue: phase === "fly" ? 0 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [phase, fade]);

  useEffect(() => {
    if (flightDone && resultReady) onReveal?.();
  }, [flightDone, resultReady, onReveal]);

  // Nudge the analyzing block ~13% of screen height below geometric center.
  const centerNudge = Math.round(windowHeight * 0.13);

  return (
    <View style={styles.page}>
      <View style={[styles.card, { minHeight: Math.max(420, windowHeight * 0.72) }]}>
        <View style={[styles.centerSlot, { paddingTop: centerNudge }]}>
          <Animated.View
            style={[styles.inner, { opacity: fade }]}
            pointerEvents={phase === "fly" ? "none" : "auto"}
          >
            <PaperRollAnimation size={176} />
            <Text style={styles.title}>
              {stageDone ? "Analysis complete" : "Analysing your document…"}
            </Text>
            <AnalysisProgress progress={progress} percent={shown} />
          </Animated.View>
        </View>
        {phase === "fly" ? <PaperCarryAway onDone={() => setFlightDone(true)} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.pageBg,
    padding: 16,
  },
  card: {
    flex: 1,
    width: "100%",
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  centerSlot: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  inner: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  title: {
    width: "100%",
    fontSize: 16,
    fontWeight: "700",
    color: "#1e293b",
    textAlign: "center",
  },
});
