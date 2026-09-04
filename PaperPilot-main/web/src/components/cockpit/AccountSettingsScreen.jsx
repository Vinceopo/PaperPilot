/**
 * AccountSettingsScreen
 *
 * Two-panel layout (LEFT = identity summary/navy, RIGHT = details/white).
 * The summary view is 100% read-only.  Each action button triggers exactly
 * one isolated flow, rendered as a separate view that replaces the summary.
 *
 * Views
 * ─────
 *  "summary"  – default two-panel read-only page
 *  "edit"     – edit First / Middle / Last / Contact, pre-filled, Save/Cancel
 *  "pwOtp"    – OTP entry (code was sent on button click)
 *  "pwNew"    – new-password + confirm-password, shown only after OTP verified
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { sendOtp, resetPasswordWithOtp, getProfile, updateUserProfile } from "../../api.js";
import { markPasswordChanged } from "../../services/auth.js";
import OtpStep from "../auth/OtpStep.jsx";
import { nameError, phoneError, usernameError } from "../auth/validation.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function digitsOnly(value, max = 11) {
  return (value || "").replace(/\D/g, "").slice(0, max);
}

function profileFields(data, fbUser) {
  const firstName = data?.firstName || "";
  const middleName = data?.middleName || "";
  const lastName = data?.lastName || "";
  const username = data?.username || "";
  const contactNumber = data?.contactNumber || "";
  if (firstName || lastName || middleName || username) {
    return { firstName, middleName, lastName, username, contactNumber };
  }
  const parts = (fbUser?.displayName || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
    lastName: parts.length > 1 ? parts[parts.length - 1] : "",
    username: "",
    contactNumber,
  };
}

function initials(first = "", last = "") {
  return `${(first[0] || "").toUpperCase()}${(last[0] || "").toUpperCase()}` || "?";
}

/** Resize an image File → 256×256 jpeg data-URL (keeps aspect ratio). */
function resizeImage(file, maxPx = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ─── shared ui atoms ─────────────────────────────────────────────────────────

function Avatar({ photoURL, first, last, size = "lg" }) {
  const sz = size === "lg" ? "h-24 w-24 text-3xl" : "h-14 w-14 text-lg";
  return (
    <div className={`${sz} relative shrink-0 overflow-hidden rounded-full bg-[#1a3a5c]`}>
      {photoURL ? (
        <img src={photoURL} alt="Profile photo" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-bold text-[#16bfa8]">
          {initials(first, last)}
        </span>
      )}
    </div>
  );
}

function PlanBadge({ tier }) {
  const isPremium = String(tier).toLowerCase() === "premium";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold ${
        isPremium
          ? "bg-[#16bfa8]/20 text-[#16bfa8]"
          : "bg-slate-600/40 text-slate-300"
      }`}
    >
      {isPremium ? "★ Premium plan" : "Free plan"}
    </span>
  );
}

function InfoRow({ label, value, badge }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-4 last:border-0">
      <span className="w-36 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="flex-1 text-sm text-slate-700">{value || <span className="italic text-slate-400">Not provided</span>}</span>
      {badge && (
        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">
          ✓ Verified
        </span>
      )}
    </div>
  );
}

function Field({ label, id, value, onChange, optional, type = "text", placeholder, error, maxLength, inputMode, hint }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}{optional && <span className="ml-1 font-normal text-slate-400">(optional)</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
        className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:ring-2 ${
          error
            ? "border-rose-400 focus:border-rose-400 focus:ring-rose-200"
            : "border-slate-300 focus:border-[#16bfa8] focus:ring-[#16bfa8]/20"
        }`}
      />
      {hint && !error && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
      {error && <p className="mt-1 text-[11px] text-rose-500" role="alert">{error}</p>}
    </div>
  );
}

function PwField({ label, id, value, onChange, show, onToggle, autoComplete }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete || "new-password"}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 pr-10 text-sm text-slate-800 outline-none transition focus:border-[#16bfa8] focus:ring-2 focus:ring-[#16bfa8]/20"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? "Hide" : "Show"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          {show ? (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

function BackLink({ onClick, label = "← Back to account" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-6 flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
      </svg>
      {label}
    </button>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function AccountSettingsScreen({ user, tier = "free", onSignOut }) {
  const [view, setView] = useState("summary"); // summary | edit | pwOtp | pwNew

  // Profile state (loaded from RTDB)
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [photoURL, setPhotoURL] = useState("");
  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);

  // Photo upload
  const photoInputRef = useRef(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");

  // Edit-profile form
  const [form, setForm] = useState({ firstName: "", middleName: "", lastName: "", username: "", contactNumber: "" });
  const [originalForm, setOriginalForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Change-password OTP
  const [otpMeta, setOtpMeta] = useState(null);   // { expires_in, resend_in, dev_code }
  const [sendingOtp, setSendingOtp] = useState(false);
  const [sendOtpError, setSendOtpError] = useState("");

  // Change-password new-password step
  const [resetToken, setResetToken] = useState("");
  const [pw, setPw] = useState({ newPw: "", confirm: "" });
  const [pwShow, setPwShow] = useState({ newPw: false, confirm: false });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState("");

  // ── load profile ────────────────────────────────────────────────────────
  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getProfile();
      applyProfile(data, user);
    } catch {
      applyProfile(null, user);
    } finally {
      setLoading(false);
    }
  }, [user]);

  function applyProfile(data, fbUser) {
    const f = profileFields(data, fbUser);
    setProfile(data);
    setForm(f);
    setOriginalForm(f);
    setPhotoURL(data?.photoURL || fbUser?.photoURL || "");
    setEmail(data?.email || fbUser?.email || "");
    setEmailVerified(data?.emailVerified ?? fbUser?.emailVerified ?? false);
  }

  useEffect(() => { loadProfile(); }, [loadProfile]);

  // ── derived ─────────────────────────────────────────────────────────────
  const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(" ") || "—";
  const canEditUsername = Boolean(user?.providerData?.some((p) => p.providerId === "password"));
  const isDirty = originalForm && (
    form.firstName !== originalForm.firstName ||
    form.middleName !== originalForm.middleName ||
    form.lastName !== originalForm.lastName ||
    (canEditUsername && form.username !== originalForm.username) ||
    form.contactNumber !== originalForm.contactNumber
  );
  const mobileErr = phoneError(form.contactNumber);
  const firstErr = nameError(form.firstName, "First name");
  const lastErr = nameError(form.lastName, "Last name");
  const middleErr = nameError(form.middleName, "Middle name", { required: false });
  const userErr = canEditUsername ? usernameError(form.username) : "";
  const editInvalid = Boolean(firstErr || lastErr || middleErr || mobileErr || userErr);

  // ── photo handler ────────────────────────────────────────────────────────
  async function handlePhotoFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setPhotoError("Please select an image file."); return; }
    setPhotoUploading(true);
    setPhotoError("");
    try {
      const dataUrl = await resizeImage(file, 256);
      await updateUserProfile({ photoUrl: dataUrl });
      setPhotoURL(dataUrl);
    } catch (err) {
      setPhotoError(err.message || "Photo upload failed.");
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  // ── edit-profile handlers ────────────────────────────────────────────────
  function setField(key) {
    return (e) => { setForm((p) => ({ ...p, [key]: e.target.value })); setSaveError(""); setSaveSuccess(false); };
  }

  function setMobileNumber(e) {
    setForm((p) => ({ ...p, contactNumber: digitsOnly(e.target.value, 11) }));
    setSaveError("");
    setSaveSuccess(false);
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    if (editInvalid) {
      setSaveError("Please fix the highlighted fields before saving.");
      return;
    }
    setSaving(true);
    setSaveError("");
    setSaveSuccess(false);
    const next = {
      firstName: form.firstName.trim(),
      middleName: form.middleName.trim(),
      lastName: form.lastName.trim(),
      contactNumber: form.contactNumber.trim(),
    };
    if (canEditUsername) next.username = form.username.trim();
    try {
      const updated = await updateUserProfile(next);
      applyProfile({ ...(profile || {}), ...updated, ...next }, user);
      setSaveSuccess(true);
      setView("summary");
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    setForm({ ...originalForm });
    setSaveError("");
    setSaveSuccess(false);
    setView("summary");
  }

  // ── change-password handlers ─────────────────────────────────────────────
  async function handleStartChangePassword() {
    setSendingOtp(true);
    setSendOtpError("");
    try {
      const res = await sendOtp({ email, purpose: "reset_password" });
      setOtpMeta(res);
      setView("pwOtp");
    } catch (err) {
      setSendOtpError(err.message);
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleOtpVerified(token) {
    setResetToken(token);
    setPw({ newPw: "", confirm: "" });
    setPwError("");
    setView("pwNew");
  }

  async function handleSetPassword(e) {
    e.preventDefault();
    setPwError("");
    if (pw.newPw.length < 8) { setPwError("Password must be at least 8 characters."); return; }
    if (!/[a-zA-Z]/.test(pw.newPw) || !/[0-9]/.test(pw.newPw)) {
      setPwError("Password must include at least one letter and one number."); return;
    }
    if (pw.newPw !== pw.confirm) { setPwError("Passwords do not match."); return; }
    setPwBusy(true);
    try {
      await resetPasswordWithOtp({ email, resetToken, newPassword: pw.newPw });
      markPasswordChanged();
      onSignOut();
    } catch (err) {
      setPwError(err.message);
      setPwBusy(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="grid min-h-64 place-items-center text-sm text-slate-400">
        Loading account settings…
      </div>
    );
  }

  // ══ VIEW: EDIT PROFILE ════════════════════════════════════════════════════
  if (view === "edit") {
    return (
      <div className="mx-auto max-w-xl">
        <BackLink onClick={handleCancelEdit} />
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800">Edit profile</h2>
          <p className="mt-0.5 text-xs text-slate-400">Changes take effect immediately after saving.</p>

          <form onSubmit={handleSaveEdit} className="mt-7 space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="First name"  id="ep-first"  value={form.firstName}  onChange={setField("firstName")} error={form.firstName ? firstErr : ""} />
              <Field label="Middle name" id="ep-mid"    value={form.middleName} onChange={setField("middleName")} optional error={middleErr} />
              <Field label="Last name"   id="ep-last"   value={form.lastName}   onChange={setField("lastName")} error={form.lastName ? lastErr : ""} />
            </div>
            {canEditUsername && (
              <Field
                label="Username"
                id="ep-username"
                value={form.username}
                onChange={setField("username")}
                placeholder="e.g. vince.opo"
                maxLength={20}
                hint="Required. 3–20 characters; letters, numbers, underscore, or period. Blank is not allowed."
                error={userErr}
              />
            )}
            <Field
              label="Mobile number"
              id="ep-contact"
              value={form.contactNumber}
              onChange={setMobileNumber}
              optional
              type="tel"
              inputMode="numeric"
              maxLength={11}
              placeholder="0912xxxxxxx"
              hint="Example: 0912xxxxxxx — 11 digits, starts with 09."
              error={mobileErr}
            />

            {/* Email read-only */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Email address</label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="w-full cursor-default rounded-xl border border-slate-200 bg-[#f8f9fb] px-4 py-2.5 pr-24 text-sm text-slate-400 outline-none"
                />
                {emailVerified && (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                    ✓ Verified
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Email cannot be changed from this screen.</p>
            </div>

            {saveError && <p className="text-xs text-rose-500" role="alert">{saveError}</p>}
            {saveSuccess && <p className="text-xs font-semibold text-emerald-600">✓ Saved!</p>}

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isDirty || saving || editInvalid}
                className="rounded-xl bg-[#16bfa8] px-7 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#12ae99] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ══ VIEW: OTP STEP (change password) ══════════════════════════════════════
  if (view === "pwOtp") {
    return (
      <div className="mx-auto max-w-sm">
        <BackLink onClick={() => { setView("summary"); setSendOtpError(""); }} />
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800">Verify your identity</h2>
          <p className="mt-0.5 text-xs text-slate-400">Enter the 6-digit code we sent to your email before setting a new password.</p>
          <OtpStep
            email={email}
            purpose="reset_password"
            title="Check your email"
            subtitle={`Enter the 6-digit code sent to ${email}`}
            expiresIn={otpMeta?.expires_in || 600}
            resendIn={otpMeta?.resend_in || 60}
            devCode={otpMeta?.dev_code || ""}
            onVerified={handleOtpVerified}
            onBack={() => { setView("summary"); setSendOtpError(""); }}
            backLabel="Cancel"
          />
        </div>
      </div>
    );
  }

  // ══ VIEW: NEW PASSWORD (after OTP verified) ════════════════════════════════
  if (view === "pwNew") {
    return (
      <div className="mx-auto max-w-sm">
        <BackLink onClick={() => setView("summary")} />
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800">Set new password</h2>
          <p className="mt-0.5 text-xs text-slate-400">Your identity has been verified. Choose a strong new password.</p>

          <form onSubmit={handleSetPassword} className="mt-6 space-y-4" noValidate>
            <PwField
              label="New password"
              id="pw-new"
              value={pw.newPw}
              onChange={(e) => { setPw((p) => ({ ...p, newPw: e.target.value })); setPwError(""); }}
              show={pwShow.newPw}
              onToggle={() => setPwShow((s) => ({ ...s, newPw: !s.newPw }))}
            />
            <PwField
              label="Confirm new password"
              id="pw-confirm"
              value={pw.confirm}
              onChange={(e) => { setPw((p) => ({ ...p, confirm: e.target.value })); setPwError(""); }}
              show={pwShow.confirm}
              onToggle={() => setPwShow((s) => ({ ...s, confirm: !s.confirm }))}
            />

            {/* Strength hints */}
            {pw.newPw.length > 0 && (
              <div className="flex flex-wrap gap-3 text-[11px]">
                {[
                  { ok: pw.newPw.length >= 8, label: "8+ characters" },
                  { ok: /[a-zA-Z]/.test(pw.newPw), label: "One letter" },
                  { ok: /[0-9]/.test(pw.newPw), label: "One number" },
                ].map(({ ok, label }) => (
                  <span key={label} className={`font-semibold ${ok ? "text-emerald-600" : "text-slate-400"}`}>
                    {ok ? "✓" : "○"} {label}
                  </span>
                ))}
              </div>
            )}

            {pwError && <p className="text-xs text-rose-500" role="alert">{pwError}</p>}

            <button
              type="submit"
              disabled={pwBusy || !pw.newPw || !pw.confirm}
              className="mt-2 w-full rounded-xl bg-[#16bfa8] py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#12ae99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pwBusy ? "Updating…" : "Set new password"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ══ VIEW: SUMMARY (default two-panel) ══════════════════════════════════════
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm md:flex">

      {/* ── LEFT PANEL ─────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center bg-[#101a30] px-8 py-10 text-white md:w-72 md:shrink-0">

        {/* Avatar */}
        <div className="relative">
          <Avatar photoURL={photoURL} first={form.firstName} last={form.lastName} size="lg" />
          {emailVerified && (
            <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white ring-2 ring-[#101a30]">
              ✓
            </span>
          )}
        </div>

        {/* Full name */}
        <p className="mt-4 text-center text-base font-bold leading-snug text-white">{fullName}</p>

        {/* Plan badge */}
        <div className="mt-2">
          <PlanBadge tier={tier} />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Change photo */}
        <div className="mt-8 w-full">
          <input
            ref={photoInputRef}
            id="photo-input"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoFile}
          />
          <label
            htmlFor="photo-input"
            className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-600 bg-[#1a2943] px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-[#1f3252] hover:text-white ${
              photoUploading ? "pointer-events-none opacity-60" : ""
            }`}
          >
            {photoUploading ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-[#16bfa8]" />
                Uploading…
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                </svg>
                Change photo
              </>
            )}
          </label>
          {photoError && <p className="mt-2 text-center text-[11px] text-rose-400">{photoError}</p>}
        </div>
      </div>

      {/* ── RIGHT PANEL ────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col bg-white px-8 py-10">

        <h2 className="text-xl font-bold text-slate-800">Account details</h2>
        <p className="mt-0.5 text-xs text-slate-400">Your account information is shown below. Use the buttons to make changes.</p>

        {/* Info rows */}
        <div className="mt-7 rounded-xl border border-slate-100 bg-[#f8f9fb] px-5">
          <InfoRow label="Email address" value={email} badge={emailVerified} />
          {canEditUsername && <InfoRow label="Username" value={form.username} />}
          <InfoRow label="Mobile number" value={form.contactNumber} />
        </div>

        {/* Action buttons */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {/* Edit profile */}
          <button
            type="button"
            onClick={() => { setSaveError(""); setSaveSuccess(false); setView("edit"); }}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
            </svg>
            Edit profile
          </button>

          {/* Change password */}
          <button
            type="button"
            onClick={handleStartChangePassword}
            disabled={sendingOtp}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#16bfa8] px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#12ae99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sendingOtp ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Sending code…
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                Change password
              </>
            )}
          </button>
        </div>

        {sendOtpError && (
          <p className="mt-3 text-xs text-rose-500" role="alert">{sendOtpError}</p>
        )}

      </div>
    </div>
  );
}
