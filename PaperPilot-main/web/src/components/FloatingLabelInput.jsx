import { useId, useState } from "react";

const ICONS = {
  mail: (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4 7.5 12 13l8-5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5.5 18.5c1.2-2.6 3.5-4 6.5-4s5.3 1.4 6.5 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  at: (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="7.25" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.7" />
      <path d="M15.1 12v1.4a2.2 2.2 0 0 0 4.2-.4V12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
};

export default function FloatingLabelInput({
  id,
  label,
  type = "text",
  value,
  onChange,
  onBlur,
  icon = "mail",
  error,
  hint,
  autoComplete,
  showPasswordToggle = false,
  maxLength,
  autoCapitalize,
  disabled = false,
  inputMode,
  spellCheck,
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  const resolvedType = isPassword && visible ? "text" : type;

  return (
    <div className="w-full">
      <div className={`fl-field ${error ? "fl-field--error" : ""}`}>
        <span className="fl-icon" aria-hidden="true">
          {ICONS[icon]}
        </span>
        <input
          id={inputId}
          className="fl-input"
          type={resolvedType}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder=" "
          autoComplete={autoComplete}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          disabled={disabled}
          inputMode={inputMode}
          spellCheck={spellCheck}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
        />
        <label htmlFor={inputId} className="fl-label">
          {label}
        </label>
        {showPasswordToggle && isPassword && (
          <button
            type="button"
            className="fl-toggle"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
          >
            {visible ? (
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
                <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                <path
                  d="M10.5 6.3A9.7 9.7 0 0 1 12 6.2c5.2 0 8.8 4.6 9.7 5.8-.4.6-1.3 1.8-2.8 3M6.2 6.2C4.2 7.6 2.9 9.4 2.3 12c.9 1.2 4.5 5.8 9.7 5.8 1.3 0 2.5-.3 3.6-.7"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
                <path
                  d="M9.9 9.9A3 3 0 0 0 12 15a3 3 0 0 0 2.1-.9"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
                <path
                  d="M2.3 12C3.2 10.8 6.8 6.2 12 6.2s8.8 4.6 9.7 5.8c-.9 1.2-4.5 5.8-9.7 5.8S3.2 13.2 2.3 12Z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <circle cx="12" cy="12" r="2.7" stroke="currentColor" strokeWidth="1.7" />
              </svg>
            )}
          </button>
        )}
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 text-[13px] text-rose-500" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-[13px] text-slate-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
