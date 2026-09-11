import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";
import PrimaryButton from "../ui/PrimaryButton";

export default function RegistrationSuccessScreen({ profile, onContinue }) {
  const fullName =
    profile?.fullName ||
    [profile?.firstName, profile?.middleName, profile?.lastName].filter(Boolean).join(" ") ||
    "PaperPilot user";

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        <View style={styles.accentBar} />
        <View style={styles.checkCircle}>
          <Text style={styles.checkMark}>✓</Text>
        </View>
        <Text style={styles.title}>Account Created Successfully!</Text>
        <Text style={styles.welcome}>
          Welcome to PaperPilot, {profile?.firstName || fullName}!
        </Text>

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

        <PrimaryButton
          style={styles.cta}
          title="Proceed to Check Format →"
          onPress={onContinue}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.pageBg,
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 28,
    overflow: "hidden",
  },
  accentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "#16bfa8",
  },
  checkCircle: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#16bfa8",
    borderWidth: 7,
    borderColor: "#dff7f3",
    alignItems: "center",
    justifyContent: "center",
  },
  checkMark: { color: colors.white, fontSize: 28, fontWeight: "700" },
  title: {
    marginTop: 12,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  welcome: {
    marginTop: 4,
    textAlign: "center",
    fontSize: 12,
    color: colors.muted,
  },
  details: {
    marginTop: 28,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 16,
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
  cta: { marginTop: 28 },
});
