import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from "react-native";
import { colors } from "../../theme";

export default function PrimaryButton({
  title,
  onPress,
  disabled = false,
  busy = false,
  style,
}) {
  const isDisabled = disabled || busy;
  return (
    <TouchableOpacity
      style={[styles.btn, isDisabled ? styles.btnDisabled : null, style]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      {busy ? (
        <ActivityIndicator color={colors.navy} />
      ) : (
        <Text style={styles.label}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: "100%",
    borderRadius: 12,
    backgroundColor: "#16bfa8",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    shadowColor: "#1bc9a0",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.navy,
  },
});
