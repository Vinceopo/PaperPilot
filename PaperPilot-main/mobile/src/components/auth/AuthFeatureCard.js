import { KeyboardAvoidingView, Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { colors } from "../../theme";
import KeyboardAwareScrollView, { keyboardAwareStyles } from "../ui/KeyboardAwareScrollView";

/**
 * Shared navy-header card used by Forgot Password, OTP, Account Created,
 * Password Changed, and similar auth flows (matches web AuthFeatureCard).
 *
 * mode="page" — full-viewport centered card (pre-login screens)
 */

function FeatureIcon({ name, size = 24, color = colors.accent }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: name === "check" ? 2 : 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  if (name === "mail") {
    return (
      <Svg {...common}>
        <Path d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
      </Svg>
    );
  }
  if (name === "shield") {
    return (
      <Svg {...common}>
        <Path d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 12 2.25c2.663 0 5.176.736 7.309 2.016A11.966 11.966 0 0 1 21.75 12c0 5.272-3.42 9.736-8.16 11.25A11.95 11.95 0 0 1 12 23.25a11.95 11.95 0 0 1-1.59-.105C5.67 21.736 2.25 17.272 2.25 12c0-2.63.84-5.066 2.266-7.034A11.958 11.958 0 0 1 12 2.25Z" />
      </Svg>
    );
  }
  if (name === "check") {
    return (
      <Svg {...common}>
        <Path d="m4.5 12.75 6 6 9-13.5" />
      </Svg>
    );
  }
  if (name === "user") {
    return (
      <Svg {...common}>
        <Path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </Svg>
    );
  }
  // lock (default)
  return (
    <Svg {...common}>
      <Path d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
    </Svg>
  );
}

export default function AuthFeatureCard({
  mode = "page",
  title,
  subtitle,
  icon = "lock",
  children,
  footer,
}) {
  const { width, height } = useWindowDimensions();
  const compact = height < 700 || width < 360;
  const iconNode = typeof icon === "string" ? <FeatureIcon name={icon} size={compact ? 20 : 24} /> : icon;

  const card = (
    <View style={[styles.card, mode === "page" && !compact && styles.cardTall]} accessibilityLabel={title}>
      <LinearGradient
        colors={["#101a30", "#15243d", "#1a3a5c"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, compact && styles.headerCompact]}
      >
        <View style={styles.headerGlowTeal} pointerEvents="none" />
        <View style={styles.headerGlowSky} pointerEvents="none" />
        <View style={styles.headerContent}>
          {iconNode ? (
            <View style={[styles.iconWrap, compact && styles.iconWrapCompact]}>
              {iconNode}
            </View>
          ) : null}
          <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>{subtitle}</Text>
          ) : null}
        </View>
      </LinearGradient>

      <View style={[styles.body, compact && styles.bodyCompact]}>
        {children}
        {footer}
      </View>
    </View>
  );

  if (mode !== "page") {
    return card;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <KeyboardAwareScrollView
          contentContainerStyle={styles.scroll}
          keyboardOpenContentStyle={keyboardAwareStyles.openTopAlign}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.pageGlowTop} pointerEvents="none" />
          <View style={styles.pageGlowBottom} pointerEvents="none" />
          {card}
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.authFormBg,
  },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  pageGlowTop: {
    position: "absolute",
    top: -40,
    right: -30,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(215,235,231,0.7)",
  },
  pageGlowBottom: {
    position: "absolute",
    bottom: -20,
    left: -20,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(220,228,240,0.8)",
  },
  card: {
    width: "100%",
    maxWidth: 448,
    alignSelf: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  cardTall: {
    minHeight: 360,
  },
  header: {
    paddingHorizontal: 28,
    paddingVertical: 28,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  headerCompact: {
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  headerGlowTeal: {
    position: "absolute",
    top: -32,
    right: -32,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(22,191,168,0.15)",
  },
  headerGlowSky: {
    position: "absolute",
    bottom: -40,
    left: 24,
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: "rgba(56,189,248,0.1)",
  },
  headerContent: {
    alignItems: "center",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(22,191,168,0.2)",
    borderWidth: 1,
    borderColor: "rgba(22,191,168,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  iconWrapCompact: {
    width: 44,
    height: 44,
    borderRadius: 12,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.white,
    letterSpacing: -0.3,
    textAlign: "center",
    lineHeight: 28,
  },
  titleCompact: {
    fontSize: 18,
    lineHeight: 24,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: "#cbd5e1",
    textAlign: "center",
  },
  subtitleCompact: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
  },
  body: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 28,
  },
  bodyCompact: {
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
});
