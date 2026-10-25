/**
 * Subscription management — view plans, PayMongo checkout, cancel, history.
 * Card / GCash / Maya fields live on PayMongo Hosted Checkout (not in-app forms).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { cancelSubscription, confirmCheckoutPayment, getSubscription, subscribeToPlan } from "../../api.js";
import BackToDashboardButton from "../BackToDashboardButton.jsx";
import ConfirmDialog from "../ConfirmDialog.jsx";
import Spinner from "../Spinner.jsx";
import paymongoLogo from "../../assets/paymongo-logo.png";
import {
  ANNUAL_SAVINGS_LABEL,
  FREE_FEATURES,
  PLAN_PRICES,
  PREMIUM_FEATURES,
  PRO_FEATURES,
  isPaidTier,
  normalizeTier,
  planLimit,
  planName,
  planPrice,
  resetWindow,
} from "../../lib/plans.js";
import { APP_TIME_ZONE } from "../../lib/timeZone.js";

export const PREMIUM_MONTHLY = PLAN_PRICES.premium.monthly;
export const PREMIUM_ANNUAL = PLAN_PRICES.premium.annual;

const CHECKOUT_PLAN_KEY = "pp_checkout_plan";

function storedCheckoutPlan() {
  try {
    const value = sessionStorage.getItem(CHECKOUT_PLAN_KEY);
    return isPaidTier(value) ? value : "";
  } catch {
    return "";
  }
}

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
  if (isPaidTier(tier)) return "Active";
  if (status === "expired") return "Expired";
  return "Free";
}

function historyLabel(entry) {
  const action = entry?.action || "";
  const name = planName(isPaidTier(entry?.tier) ? entry.tier : "premium");
  if (action === "subscribed") return `Subscribed to ${name}`;
  if (action === "changed") return `Changed ${name} plan`;
  if (action === "canceled") return `Canceled ${name}`;
  if (action === "renewed") return `Renewed ${name}`;
  return action || "Update";
}

function PaidPlanCard({ plan, selected, isCurrent, billingPeriod, features, badge, onSelect }) {
  const annual = billingPeriod === "annual";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
      className={`flex h-full min-h-[22rem] cursor-pointer flex-col rounded-2xl border bg-white p-5 text-left shadow-sm transition ${
        selected ? "border-[#3b82f6] ring-2 ring-[#3b82f6]/20" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      {/* Reserved row so Current Plan never shifts title/price vs other cards */}
      <div className="mb-2 flex h-4 items-center">
        {isCurrent ? (
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#3b82f6]">Current Plan ✓</p>
        ) : null}
      </div>
      <p className="text-sm font-semibold text-slate-700">{planName(plan)} Plan</p>
      <p className="mt-2 text-3xl font-bold text-[#172033]">
        {peso(planPrice(plan, billingPeriod))}
        <span className="ml-1 text-sm font-medium text-slate-400">/ {annual ? "year" : "month"}</span>
      </p>
      <p className="mt-1 min-h-[1.25rem] text-[11px] text-slate-400">
        {annual ? "Billed annually" : "Billed monthly"}
        {annual && (
          <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">
            {ANNUAL_SAVINGS_LABEL}
          </span>
        )}
      </p>
      <ul className="mt-4 flex-1 space-y-2 text-xs text-slate-500">
        {features.map((f) => (
          <li key={f}>• {f}</li>
        ))}
      </ul>
      <span className="mt-5 inline-flex rounded-lg bg-[#16bfa8]/10 px-4 py-2 text-xs font-semibold text-[#109b89]">
        {badge}
      </span>
    </div>
  );
}

export default function SubscriptionScreen({
  subscription,
  onSubscriptionChange,
  onBack,
  onBackToDashboard,
  billingReturn,
  onBillingSettled,
}) {
  const tier = normalizeTier(subscription?.tier);
  // Any paid plan (Premium or Pro).
  const isPremium = isPaidTier(tier);
  const currentPlanName = planName(tier);
  const limit = Number(subscription?.limit) || planLimit(tier);

  const [billingPeriod, setBillingPeriod] = useState(
    subscription?.billing_period === "annual" ? "annual" : "monthly"
  );
  const [selectedPlan, setSelectedPlan] = useState(
    () => storedCheckoutPlan() || (isPremium ? tier : "premium")
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [paymentCanceled, setPaymentCanceled] = useState(false);
  const [activating, setActivating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(!isPremium);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmFreeOpen, setConfirmFreeOpen] = useState(false);

  const price = planPrice(selectedPlan, billingPeriod);
  const perPeriod = billingPeriod === "annual" ? "year" : "month";
  const switchingPlan = isPremium && isPaidTier(selectedPlan) && selectedPlan !== tier;
  const subscribeCta =
    isPremium && selectedPlan === tier
      ? `Renew with PayMongo — ${peso(price)}/${perPeriod}`
      : switchingPlan
        ? `Switch to ${planName(selectedPlan)} with PayMongo — ${peso(price)}/${perPeriod}`
        : `Pay with PayMongo — ${peso(price)}/${perPeriod}`;

  const history = useMemo(
    () => (Array.isArray(subscription?.history) ? subscription.history : []),
    [subscription]
  );
  const onChangeRef = useRef(onSubscriptionChange);
  const onSettledRef = useRef(onBillingSettled);
  const paidActivatedRef = useRef(isPaidTier(tier));
  onChangeRef.current = onSubscriptionChange;
  onSettledRef.current = onBillingSettled;
  if (isPaidTier(tier)) paidActivatedRef.current = true;

  function pushSubscription(next, opts) {
    if (!next) return;
    // Once Pro/Premium is confirmed, ignore Free snapshots from confirm polling.
    if (paidActivatedRef.current && !isPaidTier(normalizeTier(next?.tier)) && !opts?.allowDowngrade) {
      return;
    }
    if (isPaidTier(normalizeTier(next?.tier))) paidActivatedRef.current = true;
    onChangeRef.current?.(next, opts);
  }

  function applyPremium(next) {
    const tierNow = normalizeTier(next?.tier);
    const expected = storedCheckoutPlan();
    if (next?.pending || !isPaidTier(tierNow) || (expected && tierNow !== expected)) return false;
    // Paid confirm must win over any in-flight Free snapshot from dashboard refresh.
    paidActivatedRef.current = true;
    pushSubscription(next, { allowDowngrade: false });
    setActivating(false);
    setError("");
    setCheckoutOpen(false);
    setSuccess(`Welcome to ${planName(tierNow)}! Your PayMongo payment was confirmed.`);
    try {
      sessionStorage.removeItem("pp_checkout_cs");
      sessionStorage.removeItem(CHECKOUT_PLAN_KEY);
    } catch {
      // ignore
    }
    onSettledRef.current?.();
    return true;
  }

  function showPayAgain(message) {
    setActivating(false);
    setSuccess("");
    setError(message);
    setSelectedPlan(storedCheckoutPlan() || "premium");
    setCheckoutOpen(true);
    onSettledRef.current?.();
  }

  useEffect(() => {
    if (billingReturn === "success") {
      const expectedPlan = storedCheckoutPlan() || "premium";
      setSuccess(`Payment received. Activating ${planName(expectedPlan)}…`);
      setPaymentCanceled(false);
      setActivating(true);
      setError("");
      setSelectedPlan(expectedPlan);
      setCheckoutOpen(true);
      // A renewal keeps the same tier, so only the confirm endpoint can prove it was paid.
      const tierAtReturn = tier;
      let cancelled = false;
      let timer = null;
      let tries = 0;

      async function activate() {
        const storedCs = (() => {
          try {
            return sessionStorage.getItem("pp_checkout_cs") || "";
          } catch {
            return "";
          }
        })();
        try {
          const next = await confirmCheckoutPayment({
            checkoutSessionId: storedCs || undefined,
          });
          if (cancelled) return true;
          if (applyPremium(next)) return true;
          pushSubscription(next);
        } catch {
          // Fall through to polling — webhook may still arrive.
        }
        return false;
      }

      void (async () => {
        if (await activate()) return;
        timer = setInterval(async () => {
          tries += 1;
          if (await activate()) {
            clearInterval(timer);
            return;
          }
          try {
            const next = await getSubscription();
            if (cancelled) return;
            if (normalizeTier(next?.tier) !== tierAtReturn && applyPremium(next)) {
              clearInterval(timer);
              return;
            }
            pushSubscription(next);
          } catch {
            // keep trying
          }
          if (tries >= 8) {
            clearInterval(timer);
            if (!cancelled) {
              showPayAgain(
                "We could not confirm your PayMongo payment yet. If you were charged, wait a minute and refresh this page — it will activate automatically. Otherwise, pay again below. Any paid plan time and scans you already have stay available."
              );
            }
          }
        }, 2000);
      })();

      return () => {
        cancelled = true;
        setActivating(false);
        if (timer) clearInterval(timer);
      };
    }
    if (billingReturn === "canceled") {
      setPaymentCanceled(true);
      setSuccess("Payment canceled. No charges were made.");
      setCheckoutOpen(true);
      setSelectedPlan(storedCheckoutPlan() || "premium");
      try {
        sessionStorage.removeItem("pp_checkout_cs");
        sessionStorage.removeItem(CHECKOUT_PLAN_KEY);
      } catch {
        // ignore
      }
      onSettledRef.current?.();
    }
    return undefined;
  }, [billingReturn]);

  async function handleSubscribe(e) {
    e?.preventDefault?.();
    setError("");
    setSuccess("");

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
      const result = await subscribeToPlan({
        plan: selectedPlan,
        billingPeriod,
      });
      const url = result?.checkout_url;
      if (!url) {
        throw new Error(
          "The PayMongo payment page could not be opened. You were not charged. Try again in a minute."
        );
      }
      try {
        if (result.checkout_session_id) {
          sessionStorage.setItem("pp_checkout_cs", String(result.checkout_session_id));
        }
        sessionStorage.setItem(CHECKOUT_PLAN_KEY, selectedPlan);
      } catch {
        // Private mode — confirm will use latest pending checkout on the server.
      }
      window.location.assign(url);
    } catch (err) {
      setError(
        err.message ||
          "The PayMongo payment page could not be opened. You were not charged. Try again in a minute."
      );
      setBusy(false);
    }
  }

  async function runConfirmedFree() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const next = await subscribeToPlan({ plan: "free" });
      paidActivatedRef.current = false;
      pushSubscription(next, { allowDowngrade: true });
      setCheckoutOpen(false);
      setSuccess("Switched to Free plan.");
      setConfirmFreeOpen(false);
    } catch (err) {
      setError(err.message || "Your plan could not be changed. Check your connection, then try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleCancelSubscription() {
    setConfirmCancelOpen(true);
  }

  async function runConfirmedCancel() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const next = await cancelSubscription({ immediate: true });
      paidActivatedRef.current = false;
      pushSubscription(next, { allowDowngrade: true });
      setCheckoutOpen(true);
      setSelectedPlan("premium");
      setSuccess("Subscription canceled. You are on the Free plan — 3 scans this month.");
      setConfirmCancelOpen(false);
    } catch (err) {
      setError(
        err.message || "Your subscription could not be canceled. Check your connection, then try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Settings / Subscription
          </p>
          <h2 className="mt-1 text-2xl font-bold text-[#172033]">
            {isPremium && !checkoutOpen ? "Manage Subscription" : "Upgrade your plan"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {isPremium && !checkoutOpen
              ? "View status, renewal date, and billing history."
              : "Secure checkout powered by PayMongo (Card, GCash, Maya, and more)."}
          </p>
        </div>
        {isPremium && checkoutOpen && (
          <button
            type="button"
            onClick={() => {
              setCheckoutOpen(false);
              setError("");
              setSuccess("");
            }}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            View current plan
          </button>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(error)}
        title="Something went wrong"
        message={error}
        confirmLabel="OK"
        cancelLabel={null}
        tone="danger"
        onConfirm={() => setError("")}
        onCancel={() => setError("")}
      />
      {subscription?.payment_issue && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          Payment issue detected
          {subscription.payment_issue_reason ? ` (${subscription.payment_issue_reason})` : ""}. Your{" "}
          {currentPlanName} access stays active during the grace period — update billing via PayMongo or
          contact support if this persists.
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3" role="status">
          <p className="text-sm text-emerald-800">{success}</p>
          {!isPremium && paymentCanceled && (
            <button
              type="button"
              onClick={() => {
                setSuccess("");
                setSelectedPlan(isPaidTier(selectedPlan) ? selectedPlan : "premium");
                setCheckoutOpen(true);
              }}
              className="mt-3 rounded-lg bg-[#16bfa8] px-5 py-2 text-xs font-bold text-[#092823] hover:bg-[#12ae99]"
            >
              Pay for {planName(isPaidTier(selectedPlan) ? selectedPlan : "premium")} again
            </button>
          )}
          {paymentCanceled && onBackToDashboard ? (
            <BackToDashboardButton onClick={onBackToDashboard} className="mt-3" />
          ) : null}
        </div>
      )}

      {isPremium && !checkoutOpen && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current plan</p>
            <p className="mt-2 text-xl font-bold text-[#172033]">{currentPlanName}</p>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Status</dt>
                <dd className="font-semibold text-slate-800">{statusLabel(subscription)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Billing period</dt>
                <dd className="font-semibold capitalize text-slate-800">
                  {subscription?.billing_period || "monthly"}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Payment method</dt>
                <dd className="font-semibold uppercase text-slate-800">
                  {subscription?.payment_method || "PayMongo"}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Current billing period</dt>
                <dd className="font-semibold text-slate-800">
                  {formatDate(subscription?.billing_period_start)} –{" "}
                  {formatDate(subscription?.billing_period_end || subscription?.renews_at)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Renewal date</dt>
                <dd className="font-semibold text-slate-800">{formatDate(subscription?.renews_at)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Scan allowance</dt>
                <dd className="text-right font-semibold text-slate-800">
                  {Math.max(limit - Number(subscription?.used || 0), 0)} of {limit} remaining this{" "}
                  {resetWindow(tier)}
                  {subscription?.reset_at ? (
                    <span className="block text-[11px] font-medium text-slate-400">
                      Resets {formatDate(subscription.reset_at)}
                    </span>
                  ) : null}
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedPlan(tier);
                  setCheckoutOpen(true);
                }}
                className="rounded-lg bg-[#16bfa8] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#12ae99]"
              >
                {String(subscription?.status || "").toLowerCase() === "canceled"
                  ? "Pay again"
                  : "Change plan"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleCancelSubscription}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-5 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              >
                {busy ? <Spinner className="h-3.5 w-3.5" /> : null}
                Cancel subscription
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Subscription history
                </p>
                <p className="mt-1 text-sm text-slate-500">Previous plans and payment records</p>
              </div>
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className="text-xs font-semibold text-[#109b89] hover:underline"
              >
                {showHistory ? "Hide" : "View history"}
              </button>
            </div>
            {showHistory && (
              <ul className="mt-4 max-h-72 space-y-3 overflow-y-auto">
                {history.length === 0 && (
                  <li className="text-sm text-slate-400">No subscription history yet.</li>
                )}
                {history.map((entry) => (
                  <li
                    key={entry.id || `${entry.action}-${entry.at}`}
                    className="rounded-xl border border-slate-100 bg-[#f8f9fb] px-4 py-3"
                  >
                    <p className="text-sm font-semibold text-slate-800">{historyLabel(entry)}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {formatDate(entry.at)}
                      {entry.billing_period ? ` · ${entry.billing_period}` : ""}
                      {entry.payment_method ? ` · ${String(entry.payment_method).toUpperCase()}` : ""}
                      {entry.amount != null ? ` · ${peso(entry.amount)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {!showHistory && (
              <p className="mt-4 text-sm text-slate-400">
                {history.length
                  ? `${history.length} record${history.length === 1 ? "" : "s"} available.`
                  : "No payment records yet."}
              </p>
            )}
          </div>
        </section>
      )}

      {checkoutOpen && (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-5">
            <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
              {[
                { id: "monthly", label: "Monthly" },
                { id: "annual", label: "Annual" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setBillingPeriod(opt.id)}
                  className={`rounded-full px-5 py-2 text-xs font-bold transition ${
                    billingPeriod === opt.id
                      ? "bg-[#16bfa8] text-white"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {opt.label}
                  {opt.id === "annual" && (
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${
                        billingPeriod === "annual" ? "bg-white/25 text-white" : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {ANNUAL_SAVINGS_LABEL}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="grid items-stretch gap-4 md:grid-cols-3">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setSelectedPlan("free")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelectedPlan("free");
                }}
                className={`flex h-full min-h-[22rem] cursor-pointer flex-col rounded-2xl border bg-white p-5 text-left shadow-sm transition ${
                  selectedPlan === "free"
                    ? "border-[#3b82f6] ring-2 ring-[#3b82f6]/20"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="mb-2 flex h-4 items-center">
                  {tier === "free" ? (
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#3b82f6]">
                      Current Plan ✓
                    </p>
                  ) : null}
                </div>
                <p className="text-sm font-semibold text-slate-700">Free Plan</p>
                <p className="mt-2 text-3xl font-bold text-[#172033]">₱0</p>
                <p className="mt-1 min-h-[1.25rem] text-[11px] text-slate-400">No billing</p>
                <ul className="mt-4 flex-1 space-y-2 text-xs text-slate-500">
                  {FREE_FEATURES.map((f) => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>
              </div>

              <PaidPlanCard
                plan="premium"
                selected={selectedPlan === "premium"}
                isCurrent={tier === "premium"}
                billingPeriod={billingPeriod}
                features={PREMIUM_FEATURES}
                badge="Best for thesis writers"
                onSelect={() => setSelectedPlan("premium")}
              />
              <PaidPlanCard
                plan="pro"
                selected={selectedPlan === "pro"}
                isCurrent={tier === "pro"}
                billingPeriod={billingPeriod}
                features={PRO_FEATURES}
                badge="Best for heavy revision cycles"
                onSelect={() => setSelectedPlan("pro")}
              />
            </div>
            {switchingPlan && (
              <p className="text-xs text-slate-500">
                Switching to {planName(selectedPlan)} starts a new billing period today, and your scan
                allowance changes to {planLimit(selectedPlan)} scans per {resetWindow(selectedPlan)}.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-bold text-[#172033]">Secure checkout</h3>
            <p className="mt-0.5 text-xs text-slate-400">
              You will enter card, GCash, Maya, or other details on PayMongo — not on PaperPilot.
            </p>

            <ul className="mt-4 space-y-2 text-xs text-slate-600">
              <li>• Card · GCash · Maya · GrabPay · QR Ph</li>
              <li>• Receipt emailed by PayMongo after payment</li>
              <li>• Your plan unlocks as soon as PayMongo confirms payment</li>
            </ul>

            <div className="mt-5 rounded-xl border border-slate-100 bg-[#f8f9fb] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Payment summary
              </p>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-slate-600">
                  {isPaidTier(selectedPlan)
                    ? `${planName(selectedPlan)} (${billingPeriod === "annual" ? "Annual" : "Monthly"})`
                    : "Free Plan"}
                </span>
                <span className="font-semibold text-slate-800">
                  {isPaidTier(selectedPlan) ? peso(price) : "₱0"}
                </span>
              </div>
              {isPaidTier(selectedPlan) && billingPeriod === "annual" && (
                <p className="mt-1 text-[11px] font-semibold text-emerald-700">
                  {ANNUAL_SAVINGS_LABEL} vs paying monthly for a year
                </p>
              )}
              <div className="mt-3 flex items-end justify-between border-t border-slate-200 pt-3">
                <span className="text-xs font-semibold text-slate-500">Total due today</span>
                <span className="text-2xl font-bold text-[#16bfa8]">
                  {isPaidTier(selectedPlan) ? `${peso(price)}.00` : "₱0.00"}
                </span>
              </div>
            </div>

            <form onSubmit={handleSubscribe} className="mt-5 space-y-3">
              <button
                type="submit"
                disabled={busy || activating}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#16bfa8] py-3 text-sm font-bold text-white shadow-sm hover:bg-[#12ae99] disabled:opacity-50"
              >
                {busy || activating ? <Spinner /> : null}
                {busy
                  ? "Redirecting to PayMongo…"
                  : activating
                    ? "Confirming your payment…"
                  : selectedPlan === "free"
                    ? isPremium
                      ? "Switch to Free Plan"
                      : "Stay on Free Plan"
                    : subscribeCta}
              </button>

              <div className="flex flex-col items-center gap-2 text-center">
                <img
                  src={paymongoLogo}
                  alt="PayMongo"
                  className="h-8 w-auto max-w-[11rem] rounded-md bg-slate-950 object-contain px-2 py-1"
                />
                <p className="text-[10px] text-slate-400">
                  Payments processed by PayMongo · Cancel anytime · Terms &amp; Privacy Policy
                </p>
              </div>
            </form>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={confirmCancelOpen}
        title={`Cancel ${currentPlanName} subscription?`}
        message={`You will return to the Free plan immediately, with 3 scans this month. You can subscribe to ${currentPlanName} again whenever you want.`}
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
        message={`Your ${currentPlanName} subscription will end and you will move to the Free plan.`}
        confirmLabel="Switch to Free"
        busy={busy}
        onCancel={() => {
          if (busy) return;
          setConfirmFreeOpen(false);
        }}
        onConfirm={() => void runConfirmedFree()}
      />
    </div>
  );
}
