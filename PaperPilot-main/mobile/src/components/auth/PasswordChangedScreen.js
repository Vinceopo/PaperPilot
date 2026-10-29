import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";
import AuthShell from "./AuthShell";

/**
 * Shown after a password change or reset, before the login form (matches web).
 */
export default function PasswordChangedScreen({ onContinue }) {
  return (
    <AuthShell
      variant="login"
      title="Password updated"
      subtitle="Your account is now signed out on every device."
    >
      <View style={styles.card}>
        <View style={styles.check}>
          <Text style={styles.checkMark}>✓</Text>
        </View>
        <Text style={styles.title}>Changing password is completed! Please login again</Text>
        <Text style={styles.body}>
          For your security, all active sessions have been ended. Sign in again with Google or your
          email and new password to continue.
        </Text>
        <Pressable
          onPress={onContinue}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.9 }]}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Continue to sign in</Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d1fae5",
    backgroundColor: colors.white,
    padding: 24,
    alignItems: "center",
  },
  check: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  checkMark: { color: colors.white, fontSize: 28, fontWeight: "700" },
  title: {
    marginTop: 18,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
    color: colors.navy,
    textAlign: "center",
  },
  body: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    textAlign: "center",
  },
  button: {
    marginTop: 24,
    width: "100%",
    borderRadius: 12,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: { fontSize: 14, fontWeight: "600", color: colors.navy },
});
