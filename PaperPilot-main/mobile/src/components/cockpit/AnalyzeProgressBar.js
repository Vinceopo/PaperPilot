import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { colors } from "../../theme";
import PaperRollAnimation from "../ui/PaperRollAnimation";
import AnalysisProgress from "./AnalysisProgress";
import PaperCarryAway, { PAPER_CARRY_HOLD_MS, PAPER_CARRY_TOTAL_MS } from "./PaperCarryAway";

/** If the bar never visibly reaches 100%, start the flight anyway after this long. */
const MAX_HOLD_MS = 700;

/**
 * "Analysing your document" screen: paper-roll animation and step progress, then the
 * page flies off on a paper plane before full results open (calls onReveal).
 */
export default function AnalyzeProgressBar({ progress, resultReady = false, onReveal }) {
  const { height: windowHeight } = useWindowDimensions();
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);
  const progressRef = useRef(progress);
  const [phase, setPhase] = useState("progress");
  const [flightDone, setFlightDone] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const stageDone = String(progress?.stage || "").toLowerCase() === "done";

  progressRef.current = progress;

  // Keep the on-screen percent moving smoothly for the whole analysing phase.
  // Server updates raise the floor; between updates we still drift so it never stalls.
  useEffect(() => {
    let frame = 0;
    let lastTs = Date.now();
    const tick = () => {
      const now = Date.now();
      const dt = Math.min(0.05, Math.max(0, (now - lastTs) / 1000));
      lastTs = now;
      const currentProgress = progressRef.current || {};
      const server = Math.min(100, Math.max(0, Number(currentProgress.percent) || 0));
      const done =
        String(currentProgress.stage || "").toLowerCase() === "done" || server >= 99.5;
      let value = shownRef.current;
      if (done) {
        // Snap to 100 quickly once the server finishes — do not linger on the bar.
        value = value >= 99.5 ? 100 : Math.min(100, value + Math.max(8, (100 - value) * 0.45));
      } else if (value < server - 0.2) {
        value = Math.min(server, value + Math.max(0.8, (server - value) * 0.28));
      } else {
        const softCap = 97;
        if (value < softCap) {
          const driftPerSec = Math.max(8, (softCap - value) * 0.12);
          value = Math.min(softCap, Math.max(value, server) + driftPerSec * dt);
        }
      }
      shownRef.current = value;
      setShown(value);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const reachedFull = shown >= 99.5;

  useEffect(() => {
    if (!stageDone || phase !== "progress") return undefined;
    // Result already in hand: leave the progress screen after a short beat.
    const hold = resultReady && reachedFull ? PAPER_CARRY_HOLD_MS : reachedFull ? PAPER_CARRY_HOLD_MS : MAX_HOLD_MS;
    const timer = setTimeout(() => setPhase("fly"), hold);
    return () => clearTimeout(timer);
  }, [stageDone, reachedFull, phase, resultReady]);

  // The reveal must not depend on the animation's own callbacks firing.
  useEffect(() => {
    if (phase !== "fly") return undefined;
    const timer = setTimeout(() => setFlightDone(true), PAPER_CARRY_TOTAL_MS + 120);
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
