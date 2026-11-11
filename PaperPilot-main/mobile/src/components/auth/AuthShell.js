import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../../theme";
import PaperPilotLogo from "../shell/PaperPilotLogo";
import KeyboardAwareScrollView, { keyboardAwareStyles } from "../ui/KeyboardAwareScrollView";
import { useKeyboardScroll } from "../ui/KeyboardScrollContext";

const QUOTE = "PaperPilot helps you get every academic document format-ready.";
const CHIPS = ["Format Checker", "AI Feedback", "Compliance Report"];

/** Chips stay on login only. */
const SHOW_CHIPS = { login: true };

const COPY = {
  login: {
    headlineBefore: "Format Compliance ",
    headlineAccent: "Made Simple.",
    sub: "Check manuscripts against formatting rules and get instant, citation-aware feedback.",
    quote: QUOTE,
  },
  register: {
    headlineBefore: "Your next submission, ",
    headlineAccent: "done right.",
    sub: "Save reviews, track scores, and ship camera-ready papers faster.",
    quote: null,
  },
  forgot: {
    headlineBefore: "Back to your ",
    headlineAccent: "research, fast.",
    sub: "Confirm the 6-digit code we email you, then choose a new password.",
    quote: QUOTE,
  },
  passwordChanged: {
    headlineBefore: "You're secure. ",
    headlineAccent: "Sign in again.",
    sub: "Every active session was ended after your password change.",
    quote: QUOTE,
  },
};

function AuthHeader({ variant, copy, showChips, compact }) {
  const scroll = useKeyboardScroll();
  const keyboardOpen = Boolean(scroll?.keyboardOpen);

  return (
    <View style={[styles.header, compact && styles.headerCompact, keyboardOpen && styles.headerKeyboard]}>
      {!keyboardOpen ? (
        <>
          <PaperPilotLogo
            tone="dark"
            align="center"
            markSize={compact ? 32 : 44}
            subtitle={false}
            style={compact ? styles.brandCompact : styles.brand}
          />
          <Text style={[styles.headline, compact && styles.headlineCompact]}>
            {copy.headlineBefore}
            <Text style={styles.headlineAccent}>{copy.headlineAccent}</Text>
          </Text>
          <Text style={[styles.headerSub, compact && styles.headerSubCompact]}>{copy.sub}</Text>
          {showChips ? (
            <View style={styles.chips}>
              {CHIPS.map((item) => (
                <View key={item} style={styles.chip}>
                  <Text style={styles.chipText}>{item}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <PaperPilotLogo tone="dark" align="center" markSize={28} subtitle={false} style={styles.brandCompact} />
      )}
    </View>
  );
}

/**
 * Centered white auth card on navy.
 * Any focused input scrolls above the keyboard via KeyboardAwareScrollView.
 */
export default function AuthShell({ variant = "login", title, subtitle, children, footer }) {
  const copy = COPY[variant] || COPY.login;
  const showChips = Boolean(SHOW_CHIPS[variant]);
  const compact = variant === "register";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <KeyboardAwareScrollView
          contentContainerStyle={[styles.scroll, compact && styles.scrollCompact]}
          keyboardOpenContentStyle={keyboardAwareStyles.openTopAlign}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <AuthHeader variant={variant} copy={copy} showChips={showChips} compact={compact} />

          <AuthCard compact={compact} title={title} subtitle={subtitle} footer={footer}>
            {children}
          </AuthCard>

          <AuthQuote quote={copy.quote} />
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function AuthCard({ compact, title, subtitle, footer, children }) {
  const scroll = useKeyboardScroll();
  const keyboardOpen = Boolean(scroll?.keyboardOpen);
  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
      {subtitle && !keyboardOpen ? (
        <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>{subtitle}</Text>
      ) : null}
      {children}
      {footer}
    </View>
  );
}

function AuthQuote({ quote }) {
  const scroll = useKeyboardScroll();
  if (!quote || scroll?.keyboardOpen) return null;
  return <Text style={styles.quote}>{quote}</Text>;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  scrollCompact: {
    paddingVertical: 10,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 14,
  },
  headerCompact: {
    marginBottom: 8,
  },
  headerKeyboard: {
    marginBottom: 6,
  },
  brand: { marginBottom: 10 },
  brandCompact: { marginBottom: 4 },
  headline: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.white,
    lineHeight: 30,
    letterSpacing: -0.3,
    textAlign: "center",
  },
  headlineCompact: {
    fontSize: 18,
    lineHeight: 22,
  },
  headlineAccent: {
    color: colors.accent,
  },
  headerSub: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(203,213,225,0.92)",
    textAlign: "center",
    paddingHorizontal: 4,
  },
  headerSubCompact: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  chipText: { fontSize: 11, fontWeight: "500", color: "#e2e8f0" },
  card: {
    borderRadius: 20,
    backgroundColor: colors.white,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  cardCompact: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.navy,
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  titleCompact: {
    fontSize: 18,
    lineHeight: 22,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: colors.slate,
    lineHeight: 18,
  },
  subtitleCompact: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  quote: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 18,
    color: "#94a3b8",
    textAlign: "center",
    paddingHorizontal: 8,
  },
});
