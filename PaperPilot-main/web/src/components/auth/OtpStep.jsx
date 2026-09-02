import { useEffect, useRef, useState } from "react";
import { sendOtp, verifyOtp } from "../../api.js";
import OtpInput from "../OtpInput.jsx";
import { formatCountdown } from "./messages.js";

/**
 * Shared 6-digit code screen for both email verification and password reset.
 * Codes are generated and checked entirely on the server; this only collects them.
 *
 * `onVerified` receives the single-use challenge token returned by the API.
 */
export default function OtpStep({
  email,
  purpose,
  title,
  subtitle,
  expiresIn,
  resendIn,
  devCode: initialDevCode,
  onVerified,
  onBack,
  backLabel = "Back",
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);
  const [devCode, setDevCode] = useState(initialDevCode || "");
  const [expiresAt, setExpiresAt] = useState(() => Date.now() + (expiresIn || 600) * 1000);
  const [resendAt, setResendAt] = useState(() => Date.now() + (resendIn || 60) * 1000);
  const [now, setNow] = useState(() => Date.now());
  const attemptedRef = useRef("");

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const secondsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const cooldownLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const expired = secondsLeft === 0;

  async function submit(candidate) {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await verifyOtp({ email, purpose, code: candidate });
      const token = purpose === "verify_email" ? res.signup_token : res.reset_token;
      await onVerified(token);
    } catch (err) {
      setError(err.message);
      setCode("");
      attemptedRef.current = "";
      setRound((r) => r + 1);
    } finally {
      setBusy(false);
    }
  }

  // Verify as soon as six digits are entered or pasted.
  useEffect(() => {
    if (busy || expired) return;
    if (code.length !== 6 || code === attemptedRef.current) return;
    attemptedRef.current = code;
    submit(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, busy, expired]);

  async function onResend() {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await sendOtp({ email, purpose });
      setExpiresAt(Date.now() + (res.expires_in || 600) * 1000);
      setResendAt(Date.now() + (res.resend_in || 60) * 1000);
      setDevCode(res.dev_code || "");
      setCode("");
      attemptedRef.current = "";
      setRound((r) => r + 1);
      setInfo("A new code is on its way. The previous code no longer works.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-7">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        We sent a 6-digit code to <span className="font-semibold text-navy">{email}</span>
      </div>

      <div className="mt-6">
        <OtpInput
          key={round}
          value={code}
          onChange={(next) => {
            setCode(next);
            if (error) setError("");
          }}
          error={error}
          disabled={busy || expired}
          autoFocus
        />
      </div>

      {devCode ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-700">
          Dev mode (no SMTP configured): your code is <span className="font-semibold">{devCode}</span>
        </p>
      ) : null}

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className={expired ? "text-rose-500" : "text-slate-500"} role="timer" aria-live="off">
          {expired ? "Code expired" : `Expires in ${formatCountdown(secondsLeft)}`}
        </span>
        <button
          type="button"
          onClick={onResend}
          disabled={busy || cooldownLeft > 0}
          className="font-medium text-accent transition hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-sm disabled:cursor-not-allowed disabled:text-slate-400"
        >
          {cooldownLeft > 0 ? `Resend code in ${cooldownLeft}s` : "Resend code"}
        </button>
      </div>

      {info ? (
        <p className="mt-3 text-sm text-accent" role="status">
          {info}
        </p>
      ) : null}

      <button
        type="button"
        disabled={busy || code.length !== 6 || expired}
        onClick={() => submit(code)}
        className="mt-6 w-full rounded-xl bg-accent py-3 text-sm font-semibold text-navy shadow-[0_10px_24px_rgba(27,201,160,0.28)] transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {busy ? "Verifying…" : "Verify code"}
      </button>

      <p className="mt-5 text-center text-sm text-slate-500">
        <button
          type="button"
          onClick={onBack}
          className="font-semibold text-accent hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-sm"
        >
          {backLabel}
        </button>
      </p>
    </div>
  );
}
