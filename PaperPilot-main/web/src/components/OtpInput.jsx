import { useEffect, useRef, useState } from "react";

const LENGTH = 6;
const BOX =
  "h-12 w-10 rounded-[10px] border text-center text-lg font-semibold text-navy outline-none transition sm:h-14 sm:w-12";

/**
 * 6-digit OTP boxes with entry / verifying / success / error animation phases.
 * External props stay compatible: value, onChange, error, disabled, autoFocus.
 * Optional `phase` drives the verifying/success animations from the parent OTP screen.
 */
export default function OtpInput({
  value,
  onChange,
  error,
  disabled,
  autoFocus = false,
  phase, // "entering" | "verifying" | "success" | "error" | undefined
}) {
  const digits = (value || "").padEnd(LENGTH, " ").slice(0, LENGTH).split("");
  const refs = useRef([]);
  const [focused, setFocused] = useState(0);
  const [shake, setShake] = useState(false);

  const resolved =
    phase ||
    (error ? "error" : "entering");

  useEffect(() => {
    if (autoFocus && resolved === "entering") refs.current[0]?.focus();
  }, [autoFocus, resolved]);

  useEffect(() => {
    if (resolved !== "error") return undefined;
    setShake(true);
    const id = setTimeout(() => setShake(false), 320);
    return () => clearTimeout(id);
  }, [resolved, error]);

  function setAt(index, char) {
    const next = digits.map((d) => (d === " " ? "" : d));
    next[index] = char;
    onChange(next.join("").replace(/\s/g, "").slice(0, LENGTH));
  }

  function onKeyDown(i, e) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[i].trim()) setAt(i, "");
      else if (i > 0) {
        refs.current[i - 1]?.focus();
        setAt(i - 1, "");
      }
    } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === "ArrowRight" && i < LENGTH - 1) refs.current[i + 1]?.focus();
  }

  function onPaste(e) {
    e.preventDefault();
    const pasted = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, LENGTH);
    if (!pasted) return;
    onChange(pasted);
    refs.current[Math.min(pasted.length, LENGTH - 1)]?.focus();
  }

  if (resolved === "verifying" || resolved === "success") {
    return (
      <div className="otp-stage flex min-h-14 items-center justify-center" aria-live="polite">
        <div
          className={`otp-morph ${resolved === "success" ? "otp-morph--success" : "otp-morph--verifying"}`}
          role="status"
          aria-label={resolved === "success" ? "Verified" : "Verifying"}
        >
          {resolved === "verifying" ? (
            <span className="otp-pulse-dot" />
          ) : (
            <svg className="otp-check" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                className="otp-check-path"
                d="M5 12.5 10 17.5 19 7"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        className={`flex justify-between gap-2 ${shake ? "otp-shake" : ""} ${
          resolved === "error" ? "otp-error-flash" : ""
        }`}
        role="group"
        aria-label="Six-digit verification code"
      >
        {digits.map((d, i) => {
          const isActive = focused === i && !disabled;
          return (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              id={i === 0 ? "otp-0" : undefined}
              className={`${BOX} ${
                error || resolved === "error"
                  ? "border-rose-400"
                  : "border-slate-200 focus:border-accent"
              } ${isActive ? "otp-box-pulse" : ""}`}
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              maxLength={1}
              disabled={disabled}
              value={d.trim()}
              aria-label={`Digit ${i + 1}`}
              onFocus={() => setFocused(i)}
              onChange={(e) => {
                const char = e.target.value.replace(/\D/g, "").slice(-1);
                if (!char) {
                  setAt(i, "");
                  return;
                }
                setAt(i, char);
                if (i < LENGTH - 1) refs.current[i + 1]?.focus();
              }}
              onKeyDown={(e) => onKeyDown(i, e)}
              onPaste={onPaste}
            />
          );
        })}
      </div>
      {error && phase !== "verifying" && phase !== "success" ? (
        <p className="mt-1.5 text-[13px] text-rose-500" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
