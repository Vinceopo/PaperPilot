import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";
import AuthFeatureCard from "./AuthFeatureCard";

/**
 * Account-created confirmation — navy-header card matching web.
 */
export default function RegistrationSuccessScreen({ profile, onContinue }) {
  const fullName =
    profile?.fullName ||
    [profile?.firstName, profile?.middleName, profile?.lastName].filter(Boolean).join(" ") ||
    "PaperPilot user";

  return (
    <AuthFeatureCard
      mode="page"
      icon="check"
      title="Account created successfully"
      subtitle={`Welcome to PaperPilot, ${profile?.firstName || fullName}!`}
    >
      <View style={styles.details}>
        <View style={[styles.row, styles.rowBorder]}>
          <Text style={styles.label}>Full name</Text>
          <Text style={styles.value}>{fullName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{profile?.email || "—"}</Text>
          <View style={styles.miniCheck}>
            <Text style={styles.miniCheckText}>✓</Text>
          </View>
        </View>
      </View>

      <Pressable
        onPress={onContinue}
        accessibilityRole="button"
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
      >
        <Text style={styles.ctaText}>Proceed to Check Format →</Text>
      </Pressable>
    </AuthFeatureCard>
  );
}

const styles = StyleSheet.create({
  details: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    backgroundColor: colors.inputBg,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  label: {
    width: 88,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.muted,
    paddingTop: 2,
  },
  value: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#334155",
    lineHeight: 20,
  },
  miniCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.emeraldBg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  miniCheckText: { fontSize: 10, color: colors.emerald, fontWeight: "700" },
  cta: {
    marginTop: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
    shadowColor: "#16bfa8",
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  ctaPressed: { backgroundColor: colors.accentHover },
  ctaText: { fontSize: 14, fontWeight: "700", color: colors.white },
});
