import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";
import AuthFeatureCard from "./AuthFeatureCard";

/**
 * Shown after a password change or reset, before the login form.
 */
export default function PasswordChangedScreen({ onContinue }) {
  return (
    <AuthFeatureCard
      mode="page"
      icon="check"
      title="Password updated"
      subtitle="Your account is now signed out on every device."
    >
      <View style={styles.body}>
        <View style={styles.check}>
          <Text style={styles.checkMark}>✓</Text>
        </View>
        <Text style={styles.headline}>Changing password is completed! Please login again</Text>
        <Text style={styles.copy}>
          For your security, all active sessions have been ended. Sign in again with your email and
          new password to continue.
        </Text>
        <Pressable
          onPress={onContinue}
          accessibilityRole="button"
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaText}>Continue to sign in</Text>
        </Pressable>
      </View>
    </AuthFeatureCard>
  );
}

const styles = StyleSheet.create({
  body: {
    alignItems: "center",
  },
  check: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#16bfa8",
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  checkMark: { fontSize: 20, fontWeight: "700", color: colors.white },
  headline: {
    marginTop: 20,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
    color: "#1e293b",
    textAlign: "center",
  },
  copy: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: colors.slate,
    textAlign: "center",
  },
  cta: {
    marginTop: 28,
    alignSelf: "stretch",
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
