import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppData } from "../context/AppDataContext";
import { auth } from "../firebase";
import { signOutUser } from "../services/auth";
import { colors } from "../theme";
import PrimaryButton from "../components/ui/PrimaryButton";

export default function AccountScreen({ navigation }) {
  const { user, tier, remaining, limit } = useAppData();

  return (
    <View style={styles.root}>
      <Text style={styles.kicker}>Settings</Text>
      <Text style={styles.title}>Account</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{user?.email || "—"}</Text>

        <Text style={[styles.label, { marginTop: 16 }]}>Plan</Text>
        <Text style={[styles.value, styles.capitalize]}>{tier} plan</Text>

        <Text style={[styles.label, { marginTop: 16 }]}>Scans remaining</Text>
        <Text style={styles.value}>
          {remaining} of {limit} this month
        </Text>
      </View>

      <PrimaryButton
        title="Manage subscription"
        onPress={() => navigation.navigate("Subscription")}
        style={{ marginTop: 16 }}
      />

      <Pressable
        style={styles.signOut}
        onPress={() => {
          signOutUser(auth);
        }}
      >
        <Text style={styles.signOutText}>↪ Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pageBg, padding: 16 },
  kicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.muted,
  },
  title: { marginTop: 4, fontSize: 22, fontWeight: "700", color: colors.text },
  card: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 18,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.muted,
  },
  value: { marginTop: 6, fontSize: 16, fontWeight: "600", color: colors.text },
  capitalize: { textTransform: "capitalize" },
  signOut: { marginTop: 28, alignItems: "center", padding: 12 },
  signOutText: { fontSize: 15, fontWeight: "600", color: colors.rose },
});
