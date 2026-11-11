import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../../theme";
import PaperPilotLogo from "../shell/PaperPilotLogo";
import PrimaryButton from "../ui/PrimaryButton";

const GRAIN_BLEND = require("../../../assets/auth-grain-blend.png");

/**
 * Landing: grainy dark→steel blue blend background (reference texture),
 * solid white centered card — no soft white padding halo.
 */
export default function LandingScreen({ onGetStarted, onSignIn }) {
  return (
    <View style={styles.root}>
      <ImageBackground source={GRAIN_BLEND} style={styles.bg} resizeMode="cover" />
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.card}>
            <PaperPilotLogo tone="light" align="center" markSize={52} />

            <Text style={styles.welcome}>WELCOME TO PAPERPILOT</Text>
            <Text style={styles.headline}>
              Format Compliance <Text style={styles.headlineAccent}>Made Simple.</Text>
            </Text>
            <Text style={styles.body}>
              Check academic documents against formatting rules, trace issues in the original file, and
              download clear compliance reports.
            </Text>

            <PrimaryButton title="Get started" onPress={onGetStarted} style={styles.cta} />

            <Pressable onPress={onSignIn} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.signInRow}>
                Already have an account? <Text style={styles.signInLink}>Sign in</Text>
              </Text>
            </Pressable>
          </View>

          <Text style={styles.quote}>PaperPilot helps you get every academic document format-ready.</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0D0E2B",
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
  safe: {
    flex: 1,
    backgroundColor: "transparent",
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  card: {
    borderRadius: 20,
    backgroundColor: colors.white,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 22,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  welcome: {
    marginTop: 16,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: colors.muted,
  },
  headline: {
    marginTop: 8,
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 32,
    letterSpacing: -0.3,
    color: colors.navy,
    textAlign: "center",
  },
  headlineAccent: {
    color: colors.accent,
  },
  body: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: colors.slate,
    textAlign: "center",
  },
  cta: {
    alignSelf: "stretch",
    marginTop: 20,
    borderRadius: 999,
    minHeight: 52,
  },
  signInRow: {
    marginTop: 14,
    fontSize: 14,
    lineHeight: 20,
    color: colors.slate,
    textAlign: "center",
  },
  signInLink: {
    color: colors.accent,
    fontWeight: "700",
  },
  quote: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 18,
    color: "rgba(226,232,240,0.85)",
    textAlign: "center",
  },
});
