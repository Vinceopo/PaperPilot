/**
 * Subscription management — view plans, PayMongo checkout, cancel, history.
 * Card / GCash / Maya fields live on PayMongo Hosted Checkout (not in-app forms).
 */

import { useEffect, useMemo, useState } from "react";
import { cancelSubscription, getSubscription, subscribeToPlan } from "../../api.js";
import ConfirmDialog from "../ConfirmDialog.jsx";
import Spinner from "../Spinner.jsx";

export const PREMIUM_MONTHLY = 949;
export const PREMIUM_ANNUAL = 9490;

const FREE_FEATURES = ["3 scans / month", "View current version only", "APA style only"];
const PREMIUM_FEATURES = [
  "Up to 50 scans / month",
  "Unlimited version history",
  "APA, MLA, & IEEE styles",
];

function peso(amount) {
  return `₱${Number(amount).toLocaleString("en-PH", { minimumFractionDigits: 0 })}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function statusLabel(subscription) {
  const tier = String(subscription?.tier || "free").toLowerCase();
  const status = String(subscription?.status || "").toLowerCase();
  if (tier === "premium" && status === "canceled") return "Canceled (active until renewal)";
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

export default function SubscriptionScreen({
  subscription,
  onSubscriptionChange,
  onBack,
  onBackToDashboard,
  billingReturn,
}) {
  const tier = String(subscription?.tier || "free").toLowerCase();
  const isPremium = tier === "premium";

  const [billingPeriod, setBillingPeriod] = useState(
    subscription?.billing_period === "annual" ? "annual" : "monthly"
  );
  const [selectedPlan, setSelectedPlan] = useState(isPremium ? "premium" : "premium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [paymentCanceled, setPaymentCanceled] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(!isPremium);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmFreeOpen, setConfirmFreeOpen] = useState(false);

  const price = billingPeriod === "annual" ? PREMIUM_ANNUAL : PREMIUM_MONTHLY;
  const subscribeCta =
    billingPeriod === "annual"
      ? `Pay with PayMongo — ${peso(PREMIUM_ANNUAL)}/year`
      : `Pay with PayMongo — ${peso(PREMIUM_MONTHLY)}/month`;

  const history = useMemo(
    () => (Array.isArray(subscription?.history) ? subscription.history : []),
    [subscription]
  );

  useEffect(() => {
    if (billingReturn === "success") {
      setSuccess("Payment received. Activating Premium… if it is not active yet, wait a few seconds and refresh.");
      setPaymentCanceled(false);
      setCheckoutOpen(false);
      let tries = 0;
      const timer = setInterval(async () => {
        tries += 1;
        try {
          const next = await getSubscription();
          onSubscriptionChange?.(next);
          if (String(next?.tier || "").toLowerCase() === "premium") {
            setSuccess("Welcome to Premium! Your PayMongo payment was confirmed.");
            clearInterval(timer);
          } else if (tries >= 8) {
            setSuccess(
              "Payment received — Premium is still activating. Refresh in a moment if your plan has not updated."
            );
            clearInterval(timer);
          }
        } catch {
          if (tries >= 8) clearInterval(timer);
        }
      }, 2000);
      return () => clearInterval(timer);
    }
    if (billingReturn === "canceled") {
      setPaymentCanceled(true);
      setSuccess("Payment canceled. No charges were made.");
      setCheckoutOpen(true);
    }
    return undefined;
  }, [billingReturn, onSubscriptionChange]);

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
        plan: "premium",
        billingPeriod,
      });
      const url = result?.checkout_url;
      if (!url) {
        throw new Error("PayMongo checkout URL was not returned.");
      }
      window.location.assign(url);
    } catch (err) {
      setError(err.message || "Could not start PayMongo checkout.");
      setBusy(false);
    }
  }

  async function runConfirmedFree() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const next = await subscribeToPlan({ plan: "free" });
      onSubscriptionChange?.(next);
      setCheckoutOpen(false);
      setSuccess("Switched to Free plan.");
      setConfirmFreeOpen(false);
    } catch (err) {
      setError(err.message || "Could not switch plans.");
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
      onSubscriptionChange?.(next);
      setCheckoutOpen(true);
      setSuccess("Premium subscription canceled. You are now on the Free plan.");
      setConfirmCancelOpen(false);
    } catch (err) {
      setError(err.message || "Could not cancel subscription.");
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
            {isPremium && !checkoutOpen ? "Manage Subscription" : "Upgrade to Premium"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {isPremium && !checkoutOpen
              ? "View status, renewal date, and billing history."
              : "Secure checkout powered by PayMongo (Card, GCash, Maya, and more)."}
          </p>
        </div>
        {isPremium && (
          <button
            type="button"
            onClick={() => {
              setCheckoutOpen((open) => !open);
              setError("");
              setSuccess("");
            }}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {checkoutOpen ? "View current plan" : "Change plan"}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
          {error}
        </div>
      )}
      {subscription?.payment_issue && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          Payment issue detected
          {subscription.payment_issue_reason ? ` (${subscription.payment_issue_reason})` : ""}. Your
          Premium access stays active during the grace period — update billing via PayMongo or contact
          support if this persists.
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3" role="status">
          <p className="text-sm text-emerald-800">{success}</p>
          {paymentCanceled && onBackToDashboard && (
            <button
              type="button"
              onClick={onBackToDashboard}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#16bfa8] px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#12ae99]"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Back to Dashboard
            </button>
          )}
        </div>
      )}

      {isPremium && !checkoutOpen && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current plan</p>
            <p className="mt-2 text-xl font-bold text-[#172033]">Premium</p>
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
                <dt className="text-slate-500">Renewal date</dt>
                <dd className="font-semibold text-slate-800">{formatDate(subscription?.renews_at)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Scan allowance</dt>
                <dd className="font-semibold text-slate-800">
                  {subscription?.remaining ?? 0} of {subscription?.limit ?? 50} remaining
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedPlan("premium");
                  setCheckoutOpen(true);
                }}
                className="rounded-lg bg-[#16bfa8] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#12ae99]"
              >
                Change plan
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
                </button>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setSelectedPlan("free")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelectedPlan("free");
                }}
                className={`cursor-pointer rounded-2xl border bg-white p-5 text-left shadow-sm transition ${
                  selectedPlan === "free"
                    ? "border-[#3b82f6] ring-2 ring-[#3b82f6]/20"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                {selectedPlan === "free" && (
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#3b82f6]">
                    Selected plan ✓
                  </p>
                )}
                <p className="text-sm font-semibold text-slate-700">Free Plan</p>
                <p className="mt-2 text-3xl font-bold text-[#172033]">₱0</p>
                <ul className="mt-4 space-y-2 text-xs text-slate-500">
                  {FREE_FEATURES.map((f) => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => setSelectedPlan("premium")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelectedPlan("premium");
                }}
                className={`cursor-pointer rounded-2xl border bg-white p-5 text-left shadow-sm transition ${
                  selectedPlan === "premium"
                    ? "border-[#3b82f6] ring-2 ring-[#3b82f6]/20"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                {selectedPlan === "premium" && (
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#3b82f6]">
                    Selected plan ✓
                  </p>
                )}
                <p className="text-sm font-semibold text-slate-700">Premium Plan</p>
                <p className="mt-2 text-3xl font-bold text-[#172033]">
                  {billingPeriod === "annual" ? peso(PREMIUM_ANNUAL) : peso(PREMIUM_MONTHLY)}
                  <span className="ml-1 text-sm font-medium text-slate-400">
                    / {billingPeriod === "annual" ? "year" : "month"}
                  </span>
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {billingPeriod === "annual" ? "Billed annually" : "Billed monthly"}
                </p>
                <ul className="mt-4 space-y-2 text-xs text-slate-500">
                  {PREMIUM_FEATURES.map((f) => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>
                <span className="mt-5 inline-flex rounded-lg bg-[#16bfa8]/10 px-4 py-2 text-xs font-semibold text-[#109b89]">
                  Best for thesis writers
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-bold text-[#172033]">Secure checkout</h3>
            <p className="mt-0.5 text-xs text-slate-400">
              You will enter card, GCash, Maya, or other details on PayMongo — not on PaperPilot.
            </p>

            <ul className="mt-4 space-y-2 text-xs text-slate-600">
              <li>• Card · GCash · Maya · GrabPay · QR Ph</li>
              <li>• Receipt emailed by PayMongo after payment</li>
              <li>• Premium unlocks when the webhook confirms payment</li>
            </ul>

            <div className="mt-5 rounded-xl border border-slate-100 bg-[#f8f9fb] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Payment summary
              </p>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-slate-600">
                  {selectedPlan === "premium"
                    ? `Premium (${billingPeriod === "annual" ? "Annual" : "Monthly"})`
                    : "Free Plan"}
                </span>
                <span className="font-semibold text-slate-800">
                  {selectedPlan === "premium" ? peso(price) : "₱0"}
                </span>
              </div>
              <div className="mt-3 flex items-end justify-between border-t border-slate-200 pt-3">
                <span className="text-xs font-semibold text-slate-500">Total due today</span>
                <span className="text-2xl font-bold text-[#16bfa8]">
                  {selectedPlan === "premium" ? `${peso(price)}.00` : "₱0.00"}
                </span>
              </div>
            </div>

            <form onSubmit={handleSubscribe} className="mt-5 space-y-3">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#16bfa8] py-3 text-sm font-bold text-white shadow-sm hover:bg-[#12ae99] disabled:opacity-50"
              >
                {busy ? <Spinner /> : null}
                {busy
                  ? "Redirecting to PayMongo…"
                  : selectedPlan === "free"
                    ? isPremium
                      ? "Switch to Free Plan"
                      : "Stay on Free Plan"
                    : subscribeCta}
              </button>

              <p className="text-center text-[10px] text-slate-400">
                Payments processed by PayMongo · Cancel anytime · Terms &amp; Privacy Policy
              </p>
            </form>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={confirmCancelOpen}
        title="Cancel Premium subscription?"
        message="You will return to the Free plan immediately. This cannot be undone from this screen."
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
    </div>
  );
}
