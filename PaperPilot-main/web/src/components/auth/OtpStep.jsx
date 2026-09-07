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
  const [phase, setPhase] = useState("entering"); // entering | verifying | success | error
  const [round, setRound] = useState(0);
  const [devCode, setDevCode] = useState(initialDevCode || "");
  const [expiresAt, setExpiresAt] = useState(() => Date.now() + (expiresIn || 300) * 1000);
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
  const locked = busy || phase === "verifying" || phase === "success";

  async function submit(candidate) {
    if (locked || expired) return;
    setBusy(true);
    setError("");
    setInfo("");
    setPhase("verifying");
    try {
      const res = await verifyOtp({ email, purpose, code: candidate });
      const token = purpose === "verify_email" ? res.signup_token : res.reset_token;
      setPhase("success");
      // Let the checkmark draw before handing off to the parent flow.
      await new Promise((r) => setTimeout(r, 700));
      await onVerified(token);
    } catch (err) {
      setPhase("error");
      setError(err.message);
      setCode("");
      attemptedRef.current = "";
      setRound((r) => r + 1);
      setTimeout(() => setPhase("entering"), 320);
    } finally {
      setBusy(false);
    }
  }

  // Verify as soon as six digits are entered or pasted.
  useEffect(() => {
    if (locked || expired) return;
    if (code.length !== 6 || code === attemptedRef.current) return;
    attemptedRef.current = code;
    submit(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, locked, expired]);

  async function onResend() {
    if (locked) return;
    setBusy(true);
    setError("");
    setInfo("");
    setPhase("entering");
    try {
      const res = await sendOtp({ email, purpose });
      setExpiresAt(Date.now() + (res.expires_in || 300) * 1000);
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
      {phase === "success" ? (
        <h2 className="text-center text-[1.65rem] font-semibold tracking-tight text-navy">
          Verified Successfully
        </h2>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          We sent a 6-digit code to <span className="font-semibold text-navy">{email}</span>
        </div>
      )}

      <div className="mt-6">
        <OtpInput
          key={round}
          value={code}
          onChange={(next) => {
            setCode(next);
            if (error) setError("");
            if (phase === "error") setPhase("entering");
          }}
          error={error}
          phase={phase}
          disabled={locked || expired}
          autoFocus
        />
      </div>

      {phase !== "success" && phase !== "verifying" ? (
        <>
          {/* Dev code banner removed — Resend delivers codes via email */}

          <div className="mt-4 flex items-center justify-between text-sm">
            <span className={expired ? "text-rose-500" : "text-slate-500"} role="timer" aria-live="off">
              {expired ? "Code expired" : `Expires in ${formatCountdown(secondsLeft)}`}
            </span>
            <button
              type="button"
              onClick={onResend}
              disabled={locked || cooldownLeft > 0}
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
            disabled={locked || code.length !== 6 || expired}
            onClick={() => submit(code)}
            className="mt-6 w-full rounded-xl bg-accent py-3 text-sm font-semibold text-navy shadow-[0_10px_24px_rgba(27,201,160,0.28)] transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {busy || phase === "verifying" ? "Verifying…" : "Verify code"}
          </button>

          <p className="mt-5 text-center text-sm text-slate-500">
            <button
              type="button"
              onClick={onBack}
              disabled={locked}
              className="font-semibold text-accent hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-sm disabled:opacity-50"
            >
              {backLabel}
            </button>
          </p>
        </>
      ) : null}
    </div>
  );
}
