import { useEffect, useRef } from "react";

export default function OtpInput({ value, onChange, error, disabled, autoFocus = false }) {
  const digits = (value || "").padEnd(6, " ").slice(0, 6).split("");
  const refs = useRef([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  function setAt(index, char) {
    const next = digits.map((d) => (d === " " ? "" : d));
    next[index] = char;
    onChange(next.join("").replace(/\s/g, "").slice(0, 6));
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
    else if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
  }

  function onPaste(e) {
    e.preventDefault();
    const pasted = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    onChange(pasted);
    refs.current[Math.min(pasted.length, 5)]?.focus();
  }

  return (
    <div>
      <div className="flex justify-between gap-2" role="group" aria-label="Six-digit verification code">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={i === 0 ? "otp-0" : undefined}
            className={`h-12 w-10 rounded-[10px] border text-center text-lg font-semibold text-navy outline-none transition sm:h-14 sm:w-12 ${
              error ? "border-rose-400" : "border-slate-200 focus:border-accent"
            }`}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={1}
            disabled={disabled}
            value={d.trim()}
            aria-label={`Digit ${i + 1}`}
            onChange={(e) => {
              const char = e.target.value.replace(/\D/g, "").slice(-1);
              if (!char) {
                setAt(i, "");
                return;
              }
              setAt(i, char);
              if (i < 5) refs.current[i + 1]?.focus();
            }}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={onPaste}
          />
        ))}
      </div>
      {error ? (
        <p className="mt-1.5 text-[13px] text-rose-500" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
