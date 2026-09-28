import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import { useAppData } from "../context/AppDataContext";
import { createSubscriptionCheckout } from "../api";
import { colors } from "../theme";
import PrimaryButton from "../components/ui/PrimaryButton";
import UpgradePrompt from "../components/ui/UpgradePrompt";

const PREMIUM_MONTHLY = 949;
const PREMIUM_ANNUAL = 9490;

function peso(amount) {
  return `₱${Number(amount).toLocaleString("en-PH", { minimumFractionDigits: 0 })}`;
}

export default function SubscriptionScreen() {
  const { tier, remaining, limit, used, upgradeMessage, setUpgradeMessage, refreshSubscription } =
    useAppData();
  const isPremium = tier === "premium";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [billingPeriod, setBillingPeriod] = useState("monthly");
  const subscribeCta = isPremium
    ? billingPeriod === "annual"
      ? `Renew with PayMongo — ${peso(PREMIUM_ANNUAL)}/year`
      : `Renew with PayMongo — ${peso(PREMIUM_MONTHLY)}/month`
    : billingPeriod === "annual"
      ? `Pay with PayMongo — ${peso(PREMIUM_ANNUAL)}/year`
      : `Pay with PayMongo — ${peso(PREMIUM_MONTHLY)}/month`;

  async function startPayMongoCheckout(billingPeriod = "monthly") {
    setBusy(true);
    setError("");
    try {
      const data = await createSubscriptionCheckout({ billingPeriod });
      const url = data?.checkout_url;
      if (!url) throw new Error("PayMongo checkout URL was not returned.");
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error("Cannot open PayMongo checkout on this device.");
      await Linking.openURL(url);
      // Tier flips only when the webhook confirms payment — refresh when user returns.
      setTimeout(() => {
        refreshSubscription?.();
      }, 4000);
    } catch (err) {
      setError(err?.message || "Could not start PayMongo checkout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.kicker}>Settings / Subscription</Text>
      <Text style={styles.title}>Upgrade to Premium</Text>

      <View style={styles.hero}>
        <Text style={styles.heroBadge}>{tier} plan</Text>
        <Text style={styles.heroTitle}>
          {isPremium ? "Premium compliance workspace" : "Free compliance starter"}
        </Text>
        <Text style={styles.heroBody}>
          {used} of {limit} scans used · {remaining} remaining this month.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>What you get</Text>
        <Text style={styles.perk}>✓ {isPremium ? "50" : "3"} compliance scans / month</Text>
        <Text style={styles.perk}>
          {isPremium ? "✓" : "·"} Full manuscript version history
        </Text>
        <Text style={styles.perk}>
          {isPremium ? "✓" : "·"} Deeper AI explanations
        </Text>
        <Text style={styles.perk}>
          {isPremium ? "✓" : "·"} APA, MLA & IEEE citation styles
        </Text>
        <Text style={styles.note}>
          Card, GCash, Maya and other methods are entered on PayMongo Hosted Checkout — never inside
          PaperPilot.
        </Text>
      </View>

      {isPremium ? (
        <View style={styles.activeBox}>
          <Text style={styles.activeText}>Your Premium plan is active.</Text>
        </View>
      ) : null}

      <View style={styles.periodRow}>
        {[
          { id: "monthly", label: "Monthly" },
          { id: "annual", label: "Annual" },
        ].map((opt) => (
          <Pressable
            key={opt.id}
            onPress={() => setBillingPeriod(opt.id)}
            style={[styles.periodBtn, billingPeriod === opt.id && styles.periodBtnActive]}
          >
            <Text style={[styles.periodText, billingPeriod === opt.id && styles.periodTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <PrimaryButton
        title={busy ? "Opening PayMongo…" : subscribeCta}
        onPress={() => startPayMongoCheckout(billingPeriod)}
        disabled={busy}
        style={{ marginTop: 12 }}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <UpgradePrompt
        message={upgradeMessage}
        onClose={() => setUpgradeMessage("")}
        onUpgrade={() => {
          setUpgradeMessage("");
          startPayMongoCheckout("monthly");
        }}
      />
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
  hero: {
    marginTop: 18,
    borderRadius: 12,
    backgroundColor: colors.sidebar,
    padding: 18,
  },
  heroBadge: {
    alignSelf: "flex-start",
    overflow: "hidden",
    backgroundColor: "rgba(22,191,168,0.15)",
    color: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  heroTitle: { marginTop: 12, fontSize: 18, fontWeight: "700", color: colors.white },
  heroBody: { marginTop: 6, fontSize: 13, lineHeight: 19, color: "#94a3b8" },
  card: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 18,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.accentText,
    marginBottom: 10,
  },
  perk: { fontSize: 14, color: "#475569", marginBottom: 8 },
  note: { marginTop: 8, fontSize: 12, lineHeight: 18, color: colors.muted },
  activeBox: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    backgroundColor: colors.emeraldBg,
    borderRadius: 12,
    padding: 14,
  },
  activeText: { fontSize: 13, fontWeight: "600", color: colors.emerald },
  periodRow: {
    marginTop: 16,
    flexDirection: "row",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 999,
    padding: 4,
  },
  periodBtn: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  periodBtnActive: { backgroundColor: colors.accent },
  periodText: { fontSize: 12, fontWeight: "700", color: colors.slate },
  periodTextActive: { color: colors.white },
  error: { marginTop: 12, fontSize: 13, color: "#e11d48" },
});
