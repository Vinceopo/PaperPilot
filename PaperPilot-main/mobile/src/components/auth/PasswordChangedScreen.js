import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";
import AuthShell from "./AuthShell";

/**
 * Shown after a password change or reset, before the login form.
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
          For your security, all active sessions have been ended. Sign in again with your email and
          new password to continue.
        </Text>
        <Pressable
          onPress={onContinue}
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Continue to sign in"
        >
          <Text style={styles.btnText}>Continue to sign in</Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d1fae5",
    backgroundColor: colors.white,
    paddingHorizontal: 28,
    paddingVertical: 28,
    alignItems: "center",
  },
  check: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#16bfa8",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  checkMark: { fontSize: 24, fontWeight: "700", color: colors.white },
  title: {
    marginTop: 20,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
    color: colors.navy,
    textAlign: "center",
  },
  body: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: colors.slate,
    textAlign: "center",
  },
  btn: {
    marginTop: 28,
    alignSelf: "stretch",
    borderRadius: 12,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnPressed: { backgroundColor: colors.accentHover },
  btnText: { fontSize: 14, fontWeight: "600", color: colors.navy },
});
