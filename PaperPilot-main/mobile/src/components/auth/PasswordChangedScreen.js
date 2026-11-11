import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";
import AuthShell from "./AuthShell";

/**
 * Shown after a password change or reset, before the login form.
 */
export default function PasswordChangedScreen({ onContinue }) {
  return (
    <AuthShell
      variant="passwordChanged"
      title="Password updated"
      subtitle="Your account is now signed out on every device."
    >
      <View style={styles.body}>
        <View style={styles.check}>
          <Text style={styles.checkMark}>✓</Text>
        </View>
        <Text style={styles.headline}>Password change completed. Please sign in again.</Text>
        <Text style={styles.copy}>
          For your security, all active sessions have been ended. Sign in with your email and new
          password to continue.
        </Text>
        <Pressable
          onPress={onContinue}
          accessibilityRole="button"
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaText}>Continue to sign in</Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  body: {
    marginTop: 18,
    alignItems: "center",
  },
  check: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  checkMark: { fontSize: 22, fontWeight: "700", color: colors.navy },
  headline: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
    color: colors.navy,
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
    marginTop: 22,
    alignSelf: "stretch",
    borderRadius: 999,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 52,
    justifyContent: "center",
  },
  ctaPressed: { backgroundColor: colors.accentHover },
  ctaText: { fontSize: 14, fontWeight: "700", color: colors.navy },
});
