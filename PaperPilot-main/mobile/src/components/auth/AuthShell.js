import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../../theme";
import PaperPilotLogo from "../shell/PaperPilotLogo";

const QUOTE = "PaperPilot helps you get every academic document format-ready.";
const CHIPS = ["Format Checker", "AI Feedback", "Compliance Report"];

const COPY = {
  login: {
    headlineBefore: "Format Compliance ",
    headlineAccent: "Made Simple.",
    sub: "Check manuscripts against journal rules and get instant, citation-aware feedback.",
    quote: QUOTE,
  },
  register: {
    headlineBefore: "Your next submission, ",
    headlineAccent: "done right.",
    sub: "Create an account to save reviews, track format scores, and ship camera-ready papers faster.",
    quote: QUOTE,
  },
  forgot: {
    headlineBefore: "Back to your ",
    headlineAccent: "research, fast.",
    sub: "Confirm the 6-digit code we email you, then choose a new password.",
    quote: QUOTE,
  },
  passwordChanged: {
    headlineBefore: "You’re secure. ",
    headlineAccent: "Sign in again.",
    sub: "Every active session was ended after your password change.",
  },
};

/**
 * Mobile auth frame: navy brand header + form on authFormBg / pageBg.
 */
export default function AuthShell({ variant = "login", title, subtitle, children, footer }) {
  const copy = COPY[variant] || COPY.login;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <PaperPilotLogo tone="dark" align="start" markSize={44} style={styles.brand} />
            <Text style={styles.headline}>
              {copy.headlineBefore}
              <Text style={styles.headlineAccent}>{copy.headlineAccent}</Text>
            </Text>
            <Text style={styles.headerSub}>{copy.sub}</Text>
            <View style={styles.chips}>
              {CHIPS.map((item) => (
                <View key={item} style={styles.chip}>
                  <Text style={styles.chipText}>{item}</Text>
                </View>
              ))}
            </View>
            {copy.quote ? (
              <View style={styles.quoteWrap}>
                <Text style={styles.quote}>{copy.quote}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.formPanel}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

            {children}

            {footer}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    backgroundColor: colors.authFormBg || colors.pageBg,
  },
  header: {
    backgroundColor: colors.navy,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 28,
  },
  brand: { marginBottom: 22 },
  headline: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.white,
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  headlineAccent: {
    color: colors.accent,
  },
  headerSub: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(203,213,225,0.9)",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  chipText: { fontSize: 12, fontWeight: "500", color: "#e2e8f0" },
  quoteWrap: { marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" },
  quote: { fontSize: 13, lineHeight: 20, color: "#cbd5e1" },
  formPanel: {
    flexGrow: 1,
    backgroundColor: colors.authFormBg || "#EEF1F5",
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.navy,
    letterSpacing: -0.3,
    lineHeight: 30,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: colors.slate,
    lineHeight: 20,
  },
});
