import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../../theme";
import PaperPilotLogo from "../shell/PaperPilotLogo";
import PrimaryButton from "../ui/PrimaryButton";

/**
 * Account-created confirmation — same navy + centered white card language as auth.
 */
export default function RegistrationSuccessScreen({ profile, onContinue }) {
  const fullName =
    profile?.fullName ||
    [profile?.firstName, profile?.middleName, profile?.lastName].filter(Boolean).join(" ") ||
    "PaperPilot user";

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.scroll}>
        <View style={styles.header}>
          <PaperPilotLogo tone="dark" align="center" markSize={40} subtitle={false} style={styles.brand} />
          <Text style={styles.headline}>
            You're in. <Text style={styles.headlineAccent}>Let's check a paper.</Text>
          </Text>
          <Text style={styles.headerSub}>Your account is ready. Review the details below, then continue.</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.checkCircle}>
            <Text style={styles.checkMark}>✓</Text>
          </View>
          <Text style={styles.title}>Account Created Successfully!</Text>
          <Text style={styles.welcome}>Welcome to PaperPilot, {profile?.firstName || fullName}!</Text>

          <View style={styles.details}>
            <Text style={styles.detailsLabel}>ACCOUNT DETAILS</Text>

            <Text style={styles.fieldLabel}>Full Name</Text>
            <View style={styles.fieldBox}>
              <Text style={styles.fieldValue}>{fullName}</Text>
              <View style={styles.miniCheck}>
                <Text style={styles.miniCheckText}>✓</Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Email Address</Text>
            <View style={styles.fieldBox}>
              <Text style={styles.fieldValue} numberOfLines={1}>
                {profile?.email}
              </Text>
            </View>
          </View>

          <PrimaryButton style={styles.cta} title="Proceed to Check Format →" onPress={onContinue} />
        </View>

        <Text style={styles.quote}>PaperPilot helps you get every academic document format-ready.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  scroll: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  header: {
    alignItems: "center",
    marginBottom: 14,
  },
  brand: { marginBottom: 10 },
  headline: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.white,
    lineHeight: 28,
    letterSpacing: -0.3,
    textAlign: "center",
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
  },
  card: {
    borderRadius: 20,
    backgroundColor: colors.white,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 22,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  checkCircle: {
    alignSelf: "center",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    borderWidth: 5,
    borderColor: "#dff7f3",
    alignItems: "center",
    justifyContent: "center",
  },
  checkMark: { color: colors.navy, fontSize: 22, fontWeight: "700" },
  title: {
    marginTop: 12,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "700",
    color: colors.navy,
  },
  welcome: {
    marginTop: 4,
    textAlign: "center",
    fontSize: 13,
    color: colors.slate,
  },
  details: {
    marginTop: 22,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 14,
  },
  detailsLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.muted,
  },
  fieldLabel: {
    marginTop: 12,
    fontSize: 11,
    fontWeight: "700",
    color: colors.slate,
  },
  fieldBox: {
    marginTop: 6,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fieldValue: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.text },
  miniCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.emeraldBg,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  miniCheckText: { fontSize: 11, color: colors.emerald, fontWeight: "700" },
  cta: { marginTop: 22, borderRadius: 999, minHeight: 48 },
  quote: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 18,
    color: "#94a3b8",
    textAlign: "center",
  },
});
