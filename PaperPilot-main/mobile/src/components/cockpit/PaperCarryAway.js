import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

/** Pause on 100% before the page jumps onto the plane. */
export const PAPER_CARRY_HOLD_MS = 420;

const JUMP_MS = 1780;
const FLY_MS = 3000;
/** Full jump + flight length. */
export const PAPER_CARRY_TOTAL_MS = JUMP_MS + FLY_MS;
const PLANE_W = 320;
const PLANE_H = 140;
const PAPER_W = 48;
const PAPER_H = 60;
const FLIGHT_SAMPLES = 41;

function flightFrames(glide) {
  const input = [];
  const x = [];
  const y = [];
  const rotate = [];
  for (let index = 0; index < FLIGHT_SAMPLES; index += 1) {
    const t = index / (FLIGHT_SAMPLES - 1);
    const progress = 0.5 - 0.5 * Math.cos(Math.PI * t);
    const wave = Math.sin(Math.PI * t);
    input.push(t);
    x.push(Math.round(progress * glide));
    y.push(Math.round(-wave * 10 - progress * 6));
    rotate.push(`${(Math.cos(Math.PI * t) * 2.5).toFixed(2)}deg`);
  }
  return { input, x, y, rotate };
}

/**
 * The page jumps onto the middle of a paper plane, then both glide right
 * through a light wind. Calls onDone when the flight finishes.
 */
export default function PaperCarryAway({ onDone }) {
  const { width: windowWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const width = measuredWidth || Math.max(0, windowWidth - 32);
  const jump = useRef(new Animated.Value(0)).current;
  const fly = useRef(new Animated.Value(0)).current;
  const wind = useRef(new Animated.Value(0)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      onDoneRef.current?.();
    };

    const windLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(wind, { toValue: 1, duration: 350, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(wind, { toValue: 0, duration: 350, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    );
    const run = Animated.sequence([
      Animated.timing(jump, {
        toValue: 0.5,
        duration: JUMP_MS / 2,
        easing: Easing.bezier(0.18, 0.75, 0.28, 1),
        useNativeDriver: false,
      }),
      Animated.timing(jump, {
        toValue: 1,
        duration: JUMP_MS / 2,
        easing: Easing.bezier(0.42, 0, 0.58, 1),
        useNativeDriver: false,
      }),
    ]);
    run.start(({ finished: jumped }) => {
      if (!jumped) return;
      windLoop.start();
      Animated.timing(fly, { toValue: 1, duration: FLY_MS, easing: Easing.linear, useNativeDriver: false }).start(
        ({ finished: flown }) => {
          if (flown) finish();
        }
      );
    });

    const backup = setTimeout(finish, PAPER_CARRY_TOTAL_MS + 200);
    return () => {
      clearTimeout(backup);
      run.stop();
      windLoop.stop();
      fly.stopAnimation();
    };
  }, [jump, fly, wind]);

  const glide = Math.max(340, width * 0.5 + 180);
  const frames = flightFrames(glide);

  const paperY = jump.interpolate({ inputRange: [0, 0.5, 1], outputRange: [130, -40, 0] });
  const paperRotate = jump.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ["-18deg", "6deg", "-6deg"],
  });
  const paperVisible = jump.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [PAPER_H, PAPER_H, PAPER_H / 2],
  });
  const windOpacity = Animated.multiply(
    fly.interpolate({ inputRange: [0, 0.01, 1], outputRange: [0, 1, 1] }),
    wind.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] })
  );

  return (
    <View
      style={styles.stage}
      onLayout={(e) => setMeasuredWidth(e.nativeEvent.layout.width)}
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.done}>Analysis complete</Text>
      <Animated.View
        style={[
          styles.flight,
          {
            transform: [
              { translateX: fly.interpolate({ inputRange: frames.input, outputRange: frames.x }) },
              { translateY: fly.interpolate({ inputRange: frames.input, outputRange: frames.y }) },
              { rotate: fly.interpolate({ inputRange: frames.input, outputRange: frames.rotate }) },
            ],
          },
        ]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: windOpacity }]}>
          <Svg width={PLANE_W} height={PLANE_H} viewBox={`0 0 ${PLANE_W} ${PLANE_H}`}>
            {["M52 72 C 30 58, 14 80, 0 66", "M58 88 C 32 100, 12 78, 0 94", "M46 104 C 24 116, 8 98, 0 110"].map(
              (d) => (
                <Path key={d} d={d} fill="none" stroke="#1bc9a0" strokeWidth={3.5} strokeLinecap="round" />
              )
            )}
          </Svg>
        </Animated.View>
        <Svg width={PLANE_W} height={PLANE_H} viewBox={`0 0 ${PLANE_W} ${PLANE_H}`} style={StyleSheet.absoluteFill}>
          <Path d="M28 44 L300 58 L62 90 Z" fill="#2ec9b6" />
          <Path d="M28 44 L300 58 L88 66 Z" fill="#8ff3e6" />
          <Path d="M48 78 L108 88 L66 116 Z" fill="#179e90" />
        </Svg>
        <Animated.View
          style={[
            styles.paper,
            { height: paperVisible, transform: [{ translateY: paperY }, { rotate: paperRotate }] },
          ]}
        >
          <Svg width={PAPER_W} height={PAPER_H} viewBox="0 0 72 90">
            <Rect x="1.5" y="1.5" width="69" height="87" rx="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
            <Rect x="12" y="14" width="34" height="5" rx="2.5" fill="#e2e8f0" />
            <Rect x="12" y="26" width="46" height="4" rx="2" fill="#e2e8f0" />
            <Rect x="12" y="36" width="40" height="4" rx="2" fill="#e2e8f0" />
            <Rect x="12" y="46" width="28" height="4" rx="2" fill="#b7ebe0" />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 20 },
  done: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "70%",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: "#1e293b",
  },
  flight: {
    position: "absolute",
    left: "50%",
    top: "42%",
    width: PLANE_W,
    height: PLANE_H,
    marginLeft: -PLANE_W / 2,
    marginTop: -PLANE_H / 2,
  },
  paper: {
    position: "absolute",
    left: PLANE_W * 0.42 - PAPER_W / 2,
    top: 32,
    width: PAPER_W,
    overflow: "hidden",
  },
});
