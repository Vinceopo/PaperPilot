import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { sendOtp, verifyOtp } from "../../api";
import { formatCountdown } from "../../lib/messages";
import { colors } from "../../theme";
import OtpInput from "../ui/OtpInput";
import PrimaryButton from "../ui/PrimaryButton";

/**
 * Shared 6-digit code screen for both email verification and password reset.
 * `onVerified` receives the single-use challenge token returned by the API.
 */
export default function OtpStep({
  email,
  purpose,
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
    <View style={styles.wrap}>
      <View style={styles.emailCard}>
        <Text style={styles.emailCopy}>
          We sent a 6-digit code to <Text style={styles.emailStrong}>{email}</Text>
        </Text>
      </View>

      <View style={styles.otpBlock}>
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
      </View>

      {devCode ? (
        <View style={styles.devBox}>
          <Text style={styles.devText}>
            Dev mode (no SMTP configured): your code is <Text style={styles.devCode}>{devCode}</Text>
          </Text>
        </View>
      ) : null}

      <View style={styles.metaRow}>
        <Text style={[styles.metaLeft, expired ? styles.expired : null]}>
          {expired ? "Code expired" : `Expires in ${formatCountdown(secondsLeft)}`}
        </Text>
        <TouchableOpacity onPress={onResend} disabled={busy || cooldownLeft > 0} accessibilityRole="button">
          <Text style={[styles.resend, busy || cooldownLeft > 0 ? styles.resendDisabled : null]}>
            {cooldownLeft > 0 ? `Resend code in ${cooldownLeft}s` : "Resend code"}
          </Text>
        </TouchableOpacity>
      </View>

      {info ? <Text style={styles.info}>{info}</Text> : null}

      <PrimaryButton
        style={styles.verifyBtn}
        title={busy ? "Verifying…" : "Verify code"}
        onPress={() => submit(code)}
        disabled={busy || code.length !== 6 || expired}
        busy={busy}
      />

      <TouchableOpacity onPress={onBack} style={styles.backBtn} accessibilityRole="button">
        <Text style={styles.backText}>{backLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 20 },
  emailCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  emailCopy: { fontSize: 14, color: colors.slate, lineHeight: 20 },
  emailStrong: { fontWeight: "700", color: colors.navy },
  otpBlock: { marginTop: 20 },
  devBox: {
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: colors.amberBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  devText: { fontSize: 13, color: colors.amber },
  devCode: { fontWeight: "700" },
  metaRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  metaLeft: { fontSize: 13, color: colors.slate },
  expired: { color: colors.rose },
  resend: { fontSize: 13, fontWeight: "600", color: colors.accentText },
  resendDisabled: { color: colors.muted },
  info: { marginTop: 10, fontSize: 13, color: colors.accentText },
  verifyBtn: { marginTop: 20 },
  backBtn: { marginTop: 18, alignItems: "center" },
  backText: { fontSize: 14, fontWeight: "700", color: colors.accentText },
});
