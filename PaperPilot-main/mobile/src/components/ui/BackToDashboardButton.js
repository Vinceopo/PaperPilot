import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

function ArrowLeftIcon({ size = 14, color = "#109b89" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Shared “Back to Dashboard” control — pill mint style used across cockpit screens.
 * Wrapper keeps top/bottom padding consistent on every screen.
 */
export default function BackToDashboardButton({
  onPress,
  label = "Back to Dashboard",
  style,
}) {
  if (!onPress) return null;
  return (
    <View style={[styles.wrap, style]}>
      <Pressable
        onPress={onPress}
        hitSlop={6}
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <ArrowLeftIcon />
        <Text style={styles.text}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#bfeee5",
    backgroundColor: "#f0fbf9",
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 14,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  btnPressed: { borderColor: "#16bfa8", backgroundColor: "#dcf7f2" },
  text: { fontSize: 12, fontWeight: "700", color: "#109b89" },
});
