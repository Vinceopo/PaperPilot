import { StyleSheet, Text, View } from "react-native";
import Svg, { G, Path, Rect } from "react-native-svg";
import { useFonts, Quicksand_600SemiBold, Quicksand_700Bold } from "@expo-google-fonts/quicksand";

const INK = "#1e5756";
const TEAL = "#3f9a8c";
const MINT = "#b1e7cb";

export function PaperPilotMark({ size = 48, tile = true }) {
  return (
    <Svg width={size} height={(size * 69) / 64} viewBox="4 1 64 69">
      {tile ? <Rect x="4" y="1" width="64" height="69" rx="15" fill={MINT} /> : null}
      <G stroke={INK} strokeWidth="3.2" strokeLinejoin="round">
        <Rect x="13.5" y="14.5" width="25" height="48.5" fill={TEAL} />
        <Path d="M21.5 7.5H45.5L58.5 20.5V47.5H38.5V55H21.5Z" fill={MINT} />
        <Path d="M45.5 7.5V20.5H58.5Z" fill={TEAL} />
        <Path d="M31 32L36.5 39.5L50.5 21.5" fill="none" strokeWidth="4" strokeLinecap="round" />
      </G>
    </Svg>
  );
}

/**
 * Brand lockup: mark with the PAPERPILOT wordmark and tagline stacked beneath.
 * Text has no backdrop so it sits directly on whatever surface hosts it.
 */
export default function PaperPilotLogo({ markSize = 48, subtitle = true, tone = "light", align = "center", style }) {
  const [fontsLoaded] = useFonts({ Quicksand_600SemiBold, Quicksand_700Bold });
  const onDark = tone === "dark";
  const start = align === "start";
  return (
    <View style={[styles.col, start ? styles.start : styles.center, style]}>
      <PaperPilotMark size={markSize} />
      <Text
        style={[
          styles.word,
          fontsLoaded && { fontFamily: "Quicksand_700Bold", fontWeight: undefined },
          onDark ? styles.wordDark : styles.wordLight,
          start ? styles.textStart : styles.textCenter,
        ]}
      >
        PAPERPILOT
      </Text>
      {subtitle ? (
        <View style={styles.tagline}>
          {["An AI-powered academic document", "analysis and compliance checking system"].map((line) => (
            <Text
              key={line}
              numberOfLines={1}
              style={[
                styles.taglineText,
                fontsLoaded && { fontFamily: "Quicksand_600SemiBold", fontWeight: undefined },
                onDark ? styles.taglineDark : styles.taglineLight,
                start ? styles.textStart : styles.textCenter,
              ]}
            >
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { flexDirection: "column", minWidth: 0 },
  center: { alignItems: "center" },
  start: { alignItems: "flex-start" },
  word: { marginTop: 8, fontSize: 23, fontWeight: "700", lineHeight: 26, letterSpacing: 1.4 },
  wordLight: { color: "#225b5f" },
  wordDark: { color: "#e6faf5" },
  tagline: { marginTop: 6 },
  taglineText: {
    fontSize: 8,
    fontWeight: "600",
    lineHeight: 12.4,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  taglineLight: { color: "#1f9e97" },
  taglineDark: { color: "#5fd3c1" },
  textCenter: { textAlign: "center" },
  textStart: { textAlign: "left" },
});
