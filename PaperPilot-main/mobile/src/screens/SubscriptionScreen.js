import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useAppData } from "../context/AppDataContext";
import { cancelSubscription, confirmCheckoutPayment, subscribeToPlan } from "../api";
import { colors } from "../theme";
import AppShell from "../components/shell/AppShell";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { ChevronLeftIcon } from "../components/shell/icons";
import { APP_TIME_ZONE } from "../lib/timeZone";

const PREMIUM_MONTHLY = 949;
const PREMIUM_ANNUAL = 9490;
const PAYMONGO_LOGO = require("../../assets/paymongo-logo.png");

const FREE_FEATURES = ["3 scans / month", "View current version only", "APA style only"];
const PREMIUM_FEATURES = ["Up to 50 scans / month", "Unlimited version history", "APA, MLA, & IEEE styles"];

function peso(amount) {
  return `₱${Number(amount).toLocaleString("en-PH", { minimumFractionDigits: 0 })}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: APP_TIME_ZONE,
  });
}

function statusLabel(subscription) {
  const tier = String(subscription?.tier || "free").toLowerCase();
  const status = String(subscription?.status || "").toLowerCase();
  if (status === "canceled" || status === "cancelled") return "Free";
  if (tier === "premium") return "Active";
  if (status === "expired") return "Expired";
  return "Free";
}

function historyLabel(entry) {
  const action = entry?.action || "";
  if (action === "subscribed") return "Subscribed to Premium";
  if (action === "changed") return "Changed Premium plan";
  if (action === "canceled") return "Canceled Premium";
  if (action === "renewed") return "Renewed Premium";
  return action || "Update";
}

function DetailRow({ label, value, last, uppercase, capitalize }) {
  return (
    <View style={[styles.detailRow, last && styles.detailRowLast]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[
          styles.detailValue,
          uppercase && styles.uppercase,
          capitalize && styles.capitalize,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function PlanCard({ selected, onPress, title, children }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.planCard, selected && styles.planCardSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      {selected ? <Text style={styles.selectedTag}>Selected plan ✓</Text> : null}
      <Text style={styles.planTitle}>{title}</Text>
      {children}
    </Pressable>
  );
}

/** Subscription management — plans, PayMongo checkout, cancel, history (mirrors the web page). */
export default function SubscriptionScreen({ navigation }) {
  const { subscription, applySubscription, refreshSubscription, handleBackToDashboard } = useAppData();
  const tier = String(subscription?.tier || "free").toLowerCase();
  const isPremium = tier === "premium";

  const [billingPeriod, setBillingPeriod] = useState(
    subscription?.billing_period === "annual" ? "annual" : "monthly"
  );
  const [selectedPlan, setSelectedPlan] = useState("premium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [paymentCanceled, setPaymentCanceled] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(!isPremium);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmFreeOpen, setConfirmFreeOpen] = useState(false);

  useEffect(() => {
    setCheckoutOpen(!isPremium);
  }, [isPremium]);

  useEffect(() => {
    if (subscription?.billing_period) {
      setBillingPeriod(subscription.billing_period === "annual" ? "annual" : "monthly");
    }
  }, [subscription?.billing_period]);

  const price = billingPeriod === "annual" ? PREMIUM_ANNUAL : PREMIUM_MONTHLY;
  const subscribeCta = isPremium
    ? billingPeriod === "annual"
      ? `Renew with PayMongo — ${peso(PREMIUM_ANNUAL)}/year`
      : `Renew with PayMongo — ${peso(PREMIUM_MONTHLY)}/month`
    : billingPeriod === "annual"
      ? `Pay with PayMongo — ${peso(PREMIUM_ANNUAL)}/year`
      : `Pay with PayMongo — ${peso(PREMIUM_MONTHLY)}/month`;

  const history = useMemo(
    () => (Array.isArray(subscription?.history) ? subscription.history : []),
    [subscription]
  );
  const showManage = isPremium && !checkoutOpen;

  async function handleSubscribe() {
    setError("");
    setSuccess("");
    setPaymentCanceled(false);

    if (selectedPlan === "free") {
      if (!isPremium) {
        setSuccess("You are already on the Free plan.");
        return;
      }
      setConfirmFreeOpen(true);
      return;
    }

    setBusy(true);
    try {
      const result = await subscribeToPlan({ plan: "premium", billingPeriod });
      const url = result?.checkout_url;
      if (!url) throw new Error("PayMongo checkout URL was not returned.");
      await WebBrowser.openBrowserAsync(url);
      // Webhooks cannot reach a local API, so verify the session once the browser closes.
      const confirmed = await confirmCheckoutPayment({
        checkoutSessionId: result?.checkout_session_id,
      }).catch(() => null);
      if (String(confirmed?.tier || "").toLowerCase() === "premium") {
        applySubscription(confirmed);
        setCheckoutOpen(false);
        setSuccess("Welcome to Premium! Your PayMongo payment was confirmed.");
      } else {
        await refreshSubscription?.();
        setPaymentCanceled(true);
        setSelectedPlan("premium");
        setSuccess("Payment canceled. No charges were made.");
      }
    } catch (err) {
      setError(err?.message || "Could not start PayMongo checkout.");
    } finally {
      setBusy(false);
    }
  }

  async function runConfirmedFree() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const next = await subscribeToPlan({ plan: "free" });
      applySubscription(next);
      setCheckoutOpen(false);
      setSuccess("Switched to Free plan.");
      setConfirmFreeOpen(false);
    } catch (err) {
      setError(err?.message || "Could not switch plans.");
    } finally {
      setBusy(false);
    }
  }

  async function runConfirmedCancel() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const next = await cancelSubscription({ immediate: true });
      applySubscription(next);
      setCheckoutOpen(true);
      setSelectedPlan("premium");
      setSuccess("Subscription canceled. You are on the Free plan — 3 scans this month.");
      setConfirmCancelOpen(false);
    } catch (err) {
      setError(err?.message || "Could not cancel subscription.");
    } finally {
      setBusy(false);
    }
  }

  const planScanLimit = isPremium ? 50 : 3;
  const scansRemaining = Math.max(planScanLimit - Number(subscription?.used || 0), 0);

  return (
    <AppShell
      active="account"
      breadcrumb="Settings / Subscription"
      title={showManage ? "Manage Subscription" : "Upgrade to Premium"}
      onBack={() => navigation.goBack()}
      backLabel="Back"
    >
      <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
        <View style={styles.introRow}>
          <Text style={styles.intro}>
            {showManage
              ? "View status, renewal date, and billing history."
              : "Secure checkout powered by PayMongo (Card, GCash, Maya, and more)."}
          </Text>
          {isPremium && checkoutOpen ? (
            <Pressable
              onPress={() => {
                setCheckoutOpen(false);
                setError("");
                setSuccess("");
              }}
              style={({ pressed }) => [styles.toggleViewBtn, pressed && styles.toggleViewBtnPressed]}
            >
              <Text style={styles.toggleViewText}>View current plan</Text>
            </Pressable>
          ) : null}
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {subscription?.payment_issue ? (
          <View style={styles.warnBox}>
            <Text style={styles.warnText}>
              Payment issue detected
              {subscription.payment_issue_reason ? ` (${subscription.payment_issue_reason})` : ""}. Your Premium
              access stays active during the grace period — update billing via PayMongo or contact support if this
              persists.
            </Text>
          </View>
        ) : null}
        {success ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>{success}</Text>
            {!isPremium ? (
              <Pressable
                onPress={() => {
                  setSuccess("");
                  setPaymentCanceled(false);
                  setSelectedPlan("premium");
                  setCheckoutOpen(true);
                }}
                style={({ pressed }) => [styles.payAgainBtn, pressed && styles.accentPressed]}
              >
                <Text style={styles.payAgainText}>Pay for Premium again</Text>
              </Pressable>
            ) : null}
            {paymentCanceled ? (
              <Pressable
                onPress={() => {
                  handleBackToDashboard();
                  navigation.navigate("MainTabs", { screen: "Upload" });
                }}
                style={({ pressed }) => [styles.dashboardBtn, pressed && styles.accentPressed]}
              >
                <ChevronLeftIcon size={14} color={colors.white} />
                <Text style={styles.dashboardText}>Back to Dashboard</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {showManage ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardKicker}>Current plan</Text>
              <Text style={styles.currentPlan}>Premium</Text>
              <View style={styles.details}>
                <DetailRow label="Status" value={statusLabel(subscription)} />
                <DetailRow label="Billing period" value={subscription?.billing_period || "monthly"} capitalize />
                <DetailRow label="Payment method" value={subscription?.payment_method || "PayMongo"} uppercase />
                <DetailRow label="Renewal date" value={formatDate(subscription?.renews_at)} />
                <DetailRow
                  label="Scan allowance"
                  value={`${scansRemaining} of ${planScanLimit} remaining`}
                  last
                />
              </View>
              <View style={styles.manageActions}>
                <Pressable
                  onPress={() => {
                    setSelectedPlan("premium");
                    setCheckoutOpen(true);
                  }}
                  style={({ pressed }) => [styles.changePlanBtn, pressed && styles.accentPressed]}
                >
                  <Text style={styles.changePlanText}>
                    {String(subscription?.status || "").toLowerCase() === "canceled" ? "Pay again" : "Change plan"}
                  </Text>
                </Pressable>
                <Pressable
                  disabled={busy}
                  onPress={() => setConfirmCancelOpen(true)}
                  style={({ pressed }) => [
                    styles.cancelSubBtn,
                    pressed && styles.cancelSubBtnPressed,
                    busy && styles.disabled,
                  ]}
                >
                  {busy ? <ActivityIndicator size="small" color="#e11d48" /> : null}
                  <Text style={styles.cancelSubText}>Cancel subscription</Text>
                </Pressable>
              </View>
            </View>

            <View style={[styles.card, styles.cardSpacing]}>
              <View style={styles.historyHead}>
                <View style={styles.historyHeadText}>
                  <Text style={styles.cardKicker}>Subscription history</Text>
                  <Text style={styles.historySub}>Previous plans and payment records</Text>
                </View>
                <Pressable onPress={() => setShowHistory((v) => !v)} hitSlop={6}>
                  <Text style={styles.historyToggle}>{showHistory ? "Hide" : "View history"}</Text>
                </Pressable>
              </View>
              {showHistory ? (
                <View style={styles.historyList}>
                  {history.length === 0 ? (
                    <Text style={styles.historyEmpty}>No subscription history yet.</Text>
                  ) : null}
                  {history.map((entry, index) => (
                    <View key={entry.id || `${entry.action}-${entry.at}-${index}`} style={styles.historyItem}>
                      <Text style={styles.historyTitle}>{historyLabel(entry)}</Text>
                      <Text style={styles.historyMeta}>
                        {formatDate(entry.at)}
                        {entry.billing_period ? ` · ${entry.billing_period}` : ""}
                        {entry.payment_method ? ` · ${String(entry.payment_method).toUpperCase()}` : ""}
                        {entry.amount != null ? ` · ${peso(entry.amount)}` : ""}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.historyEmpty}>
                  {history.length
                    ? `${history.length} record${history.length === 1 ? "" : "s"} available.`
                    : "No payment records yet."}
                </Text>
              )}
            </View>
          </>
        ) : null}

        {checkoutOpen ? (
          <>
            <View style={styles.periodToggle}>
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

            <PlanCard selected={selectedPlan === "free"} onPress={() => setSelectedPlan("free")} title="Free Plan">
              <Text style={styles.planPrice}>₱0</Text>
              <View style={styles.featureList}>
                {FREE_FEATURES.map((f) => (
                  <Text key={f} style={styles.feature}>
                    • {f}
                  </Text>
                ))}
              </View>
            </PlanCard>

            <PlanCard
              selected={selectedPlan === "premium"}
              onPress={() => setSelectedPlan("premium")}
              title="Premium Plan"
            >
              <Text style={styles.planPrice}>
                {peso(price)}
                <Text style={styles.planPer}> / {billingPeriod === "annual" ? "year" : "month"}</Text>
              </Text>
              <Text style={styles.billedNote}>{billingPeriod === "annual" ? "Billed annually" : "Billed monthly"}</Text>
              <View style={styles.featureList}>
                {PREMIUM_FEATURES.map((f) => (
                  <Text key={f} style={styles.feature}>
                    • {f}
                  </Text>
                ))}
              </View>
              <View style={styles.bestFor}>
                <Text style={styles.bestForText}>Best for thesis writers</Text>
              </View>
            </PlanCard>

            <View style={[styles.card, styles.cardSpacing]}>
              <Text style={styles.checkoutTitle}>Secure checkout</Text>
              <Text style={styles.checkoutSub}>
                You will enter card, GCash, Maya, or other details on PayMongo — not on PaperPilot.
              </Text>
              <View style={styles.checkoutList}>
                <Text style={styles.checkoutItem}>• Card · GCash · Maya · GrabPay · QR Ph</Text>
                <Text style={styles.checkoutItem}>• Receipt emailed by PayMongo after payment</Text>
                <Text style={styles.checkoutItem}>• Premium unlocks when the webhook confirms payment</Text>
              </View>

              <View style={styles.summary}>
                <Text style={styles.cardKicker}>Payment summary</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    {selectedPlan === "premium"
                      ? `Premium (${billingPeriod === "annual" ? "Annual" : "Monthly"})`
                      : "Free Plan"}
                  </Text>
                  <Text style={styles.summaryValue}>{selectedPlan === "premium" ? peso(price) : "₱0"}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total due today</Text>
                  <Text style={styles.totalValue}>
                    {selectedPlan === "premium" ? `${peso(price)}.00` : "₱0.00"}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={handleSubscribe}
                disabled={busy}
                style={({ pressed }) => [styles.payBtn, pressed && styles.accentPressed, busy && styles.disabled]}
              >
                {busy ? <ActivityIndicator size="small" color={colors.white} /> : null}
                <Text style={styles.payText}>
                  {busy
                    ? "Opening PayMongo…"
                    : selectedPlan === "free"
                      ? isPremium
                        ? "Switch to Free Plan"
                        : "Stay on Free Plan"
                      : subscribeCta}
                </Text>
              </Pressable>

              <View style={styles.poweredBy}>
                <View style={styles.logoWrap}>
                  <Image source={PAYMONGO_LOGO} style={styles.logo} resizeMode="contain" accessibilityLabel="PayMongo" />
                </View>
                <Text style={styles.poweredText}>
                  Payments processed by PayMongo · Cancel anytime · Terms &amp; Privacy Policy
                </Text>
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>

      <ConfirmDialog
        open={confirmCancelOpen}
        title="Cancel Premium subscription?"
        message="You will return to the Free plan immediately, with 3 scans this month. You can subscribe to Premium again whenever you want."
        confirmLabel="Cancel subscription"
        tone="danger"
        busy={busy}
        onCancel={() => {
          if (busy) return;
          setConfirmCancelOpen(false);
        }}
        onConfirm={() => void runConfirmedCancel()}
      />

      <ConfirmDialog
        open={confirmFreeOpen}
        title="Switch to Free plan?"
        message="Your Premium subscription will end and you will move to the Free plan."
        confirmLabel="Switch to Free"
        busy={busy}
        onCancel={() => {
          if (busy) return;
          setConfirmFreeOpen(false);
        }}
        onConfirm={() => void runConfirmedFree()}
      />
    </AppShell>
  );
}

const cardShadow = {
  shadowColor: "#0f172a",
  shadowOpacity: 0.05,
  shadowRadius: 2,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pageBg },
  scroll: { padding: 16, paddingBottom: 40 },
  introRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 },
  intro: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.slate },
  toggleViewBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  toggleViewBtnPressed: { backgroundColor: "#f8fafc" },
  toggleViewText: { fontSize: 12, fontWeight: "600", color: "#334155" },
  errorBox: {
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fecdd3",
    backgroundColor: "#fff1f2",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorText: { fontSize: 14, lineHeight: 20, color: "#be123c" },
  warnBox: {
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  warnText: { fontSize: 14, lineHeight: 20, color: "#78350f" },
  successBox: {
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  successText: { fontSize: 14, lineHeight: 20, color: "#065f46" },
  payAgainBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    borderRadius: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  payAgainText: { fontSize: 12, fontWeight: "700", color: "#092823" },
  dashboardBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  dashboardText: { fontSize: 12, fontWeight: "700", color: colors.white },
  accentPressed: { backgroundColor: colors.accentHover },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 20,
    ...cardShadow,
  },
  cardSpacing: { marginTop: 16 },
  cardKicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.muted,
  },
  currentPlan: { marginTop: 8, fontSize: 20, fontWeight: "700", color: "#172033" },
  details: { marginTop: 20, gap: 12 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingBottom: 8,
  },
  detailRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  detailLabel: { fontSize: 14, color: colors.slate },
  detailValue: { flexShrink: 1, fontSize: 14, fontWeight: "600", color: "#1e293b", textAlign: "right" },
  uppercase: { textTransform: "uppercase" },
  capitalize: { textTransform: "capitalize" },
  manageActions: { marginTop: 24, flexDirection: "row", flexWrap: "wrap", gap: 12 },
  changePlanBtn: { borderRadius: 8, backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 10 },
  changePlanText: { fontSize: 12, fontWeight: "700", color: colors.white },
  cancelSubBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecdd3",
    backgroundColor: colors.white,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  cancelSubBtnPressed: { backgroundColor: "#fff1f2" },
  cancelSubText: { fontSize: 12, fontWeight: "600", color: "#e11d48" },
  disabled: { opacity: 0.5 },
  historyHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  historyHeadText: { flex: 1 },
  historySub: { marginTop: 4, fontSize: 14, color: colors.slate },
  historyToggle: { fontSize: 12, fontWeight: "600", color: colors.accentText },
  historyList: { marginTop: 16, gap: 12 },
  historyEmpty: { marginTop: 16, fontSize: 14, color: colors.muted },
  historyItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    backgroundColor: "#f8f9fb",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  historyTitle: { fontSize: 14, fontWeight: "600", color: "#1e293b" },
  historyMeta: { marginTop: 2, fontSize: 11, color: colors.slate },
  periodToggle: {
    alignSelf: "flex-start",
    flexDirection: "row",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 4,
    marginBottom: 16,
    ...cardShadow,
  },
  periodBtn: { borderRadius: 999, paddingHorizontal: 20, paddingVertical: 8 },
  periodBtnActive: { backgroundColor: colors.accent },
  periodText: { fontSize: 12, fontWeight: "700", color: colors.slate },
  periodTextActive: { color: colors.white },
  planCard: {
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 20,
    ...cardShadow,
  },
  planCardSelected: {
    borderColor: "#3b82f6",
    shadowColor: "#3b82f6",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  selectedTag: {
    marginBottom: 8,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#3b82f6",
  },
  planTitle: { fontSize: 14, fontWeight: "600", color: "#334155" },
  planPrice: { marginTop: 8, fontSize: 30, fontWeight: "700", color: "#172033" },
  planPer: { fontSize: 14, fontWeight: "500", color: colors.muted },
  billedNote: { marginTop: 4, fontSize: 11, color: colors.muted },
  featureList: { marginTop: 16, gap: 8 },
  feature: { fontSize: 12, color: colors.slate },
  bestFor: {
    marginTop: 20,
    alignSelf: "flex-start",
    borderRadius: 8,
    backgroundColor: "rgba(22,191,168,0.1)",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bestForText: { fontSize: 12, fontWeight: "600", color: colors.accentText },
  checkoutTitle: { fontSize: 16, fontWeight: "700", color: "#172033" },
  checkoutSub: { marginTop: 2, fontSize: 12, lineHeight: 17, color: colors.muted },
  checkoutList: { marginTop: 16, gap: 8 },
  checkoutItem: { fontSize: 12, color: "#475569" },
  summary: {
    marginTop: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    backgroundColor: "#f8f9fb",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  summaryRow: { marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryLabel: { fontSize: 14, color: "#475569" },
  summaryValue: { fontSize: 14, fontWeight: "600", color: "#1e293b" },
  totalRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  totalLabel: { fontSize: 12, fontWeight: "600", color: colors.slate },
  totalValue: { fontSize: 24, fontWeight: "700", color: colors.accent },
  payBtn: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...cardShadow,
  },
  payText: { fontSize: 14, fontWeight: "700", color: colors.white, textAlign: "center" },
  poweredBy: { marginTop: 12, alignItems: "center", gap: 8 },
  logoWrap: { borderRadius: 6, backgroundColor: "#020617", paddingHorizontal: 8, paddingVertical: 4 },
  logo: { width: 120, height: 24 },
  poweredText: { fontSize: 10, lineHeight: 15, color: colors.muted, textAlign: "center" },
});
