import { StyleSheet, Text, View } from "react-native";
import { useAppData } from "../context/AppDataContext";
import { colors } from "../theme";
import PrimaryButton from "../components/ui/PrimaryButton";
import UpgradePrompt from "../components/ui/UpgradePrompt";

export default function SubscriptionScreen() {
  const { tier, remaining, limit, upgradeMessage, setUpgradeMessage } = useAppData();
  const isPremium = tier === "premium";

  return (
    <View style={styles.root}>
      <Text style={styles.kicker}>Billing</Text>
      <Text style={styles.title}>Subscription</Text>

      <View style={styles.card}>
        <Text style={styles.planBadge}>{tier} plan</Text>
        <Text style={styles.headline}>
          {isPremium ? "Premium compliance workspace" : "Free compliance starter"}
        </Text>
        <Text style={styles.body}>
          {remaining} of {limit} scans remaining this month.
        </Text>

        <View style={styles.perks}>
          <Text style={styles.perk}>✓ {isPremium ? "50" : "3"} compliance scans / month</Text>
          <Text style={styles.perk}>
            {isPremium ? "✓" : "·"} Full manuscript version history
          </Text>
          <Text style={styles.perk}>
            {isPremium ? "✓" : "·"} Deeper AI explanations
          </Text>
        </View>
      </View>

      {!isPremium ? (
        <PrimaryButton
          title="Subscribe to Premium"
          onPress={() =>
            setUpgradeMessage(
              "Upgrade to Premium for 50 monthly scans, full version history, and deeper AI explanations."
            )
          }
          style={{ marginTop: 16 }}
        />
      ) : null}

      <UpgradePrompt message={upgradeMessage} onClose={() => setUpgradeMessage("")} />
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
  planBadge: {
    alignSelf: "flex-start",
    overflow: "hidden",
    backgroundColor: colors.accentMuted,
    color: colors.accentText,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  headline: { marginTop: 14, fontSize: 18, fontWeight: "700", color: colors.text },
  body: { marginTop: 8, fontSize: 14, lineHeight: 20, color: colors.slate },
  perks: { marginTop: 16, gap: 8 },
  perk: { fontSize: 14, color: "#475569" },
});
