import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors } from "../../theme";

const COPY = {
  login: {
    headlineBefore: "Format Compliance ",
    headlineAccent: "Made Simple.",
    sub: "Check manuscripts against journal rules and get instant, citation-aware feedback.",
  },
  register: {
    headlineBefore: "Your next submission, ",
    headlineAccent: "done right.",
    sub: "Create an account to save reviews, track format scores, and ship camera-ready papers faster.",
  },
  forgot: {
    headlineBefore: "Back to your ",
    headlineAccent: "research, fast.",
    sub: "Confirm the 6-digit code we email you, then choose a new password.",
  },
};

function BrandMark({ light = false }) {
  return (
    <View style={styles.brandRow}>
      <View style={[styles.logo, light ? styles.logoOnLight : null]}>
        <Text style={[styles.logoGlyph, light ? styles.logoGlyphOnLight : null]}>✈</Text>
      </View>
      <Text style={[styles.brandName, light ? styles.brandNameOnLight : null]}>PaperPilot</Text>
    </View>
  );
}

/**
 * Mobile auth frame: navy brand header + form on authFormBg / pageBg.
 */
export default function AuthShell({
  variant = "login",
  title,
  subtitle,
  children,
  footer,
  onContinueAsGuest,
}) {
  const copy = COPY[variant] || COPY.login;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <BrandMark />
          <Text style={styles.headline}>
            {copy.headlineBefore}
            <Text style={styles.headlineAccent}>{copy.headlineAccent}</Text>
          </Text>
          <Text style={styles.headerSub}>{copy.sub}</Text>
        </View>

        <View style={styles.formPanel}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          {children}

          {footer}

          {onContinueAsGuest ? (
            <TouchableOpacity onPress={onContinueAsGuest} style={styles.guestBtn} accessibilityRole="button">
              <Text style={styles.guestText}>Continue without signing in</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.navy,
  },
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
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  logoOnLight: {
    backgroundColor: colors.accent,
  },
  logoGlyph: {
    fontSize: 16,
    color: colors.navy,
    fontWeight: "700",
  },
  logoGlyphOnLight: {
    color: colors.navy,
  },
  brandName: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.white,
    letterSpacing: -0.2,
  },
  brandNameOnLight: {
    color: colors.navy,
  },
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
  formPanel: {
    flexGrow: 1,
    backgroundColor: colors.authFormBg || "#EEF1F5",
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.navy,
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 4,
    fontSize: 14,
    color: colors.slate,
    lineHeight: 20,
  },
  guestBtn: {
    marginTop: 14,
    alignItems: "center",
  },
  guestText: {
    fontSize: 14,
    color: colors.muted,
    textDecorationLine: "underline",
  },
});
