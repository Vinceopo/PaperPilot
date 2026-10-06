import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { useAppData } from "../context/AppDataContext";
import { auth } from "../firebase";
import { getProfile, otpBypassToken, resetPasswordWithOtp, sendOtp, updateUserProfile } from "../api";
import { signOutUser } from "../services/auth";
import { loadNotifications, pushNotification, saveNotifications } from "../lib/notifications";
import { nameError, phoneError, usernameError } from "../lib/validation";
import { colors } from "../theme";
import AppShell from "../components/shell/AppShell";
import OtpStep from "../components/auth/OtpStep";
import { CameraIcon, ChevronLeftIcon, EyeIcon, PadlockIcon, PencilIcon } from "../components/shell/icons";

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

/** Square-crop pick from the library, resized to a 256px JPEG data URL (like the web). */
async function pickProfilePhoto() {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (picked.canceled || !picked.assets?.[0]?.uri) return null;
  const context = ImageManipulator.manipulate(picked.assets[0].uri);
  context.resize({ width: 256 });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.85, format: SaveFormat.JPEG, base64: true });
  if (!saved.base64) throw new Error("Could not read the selected photo.");
  return `data:image/jpeg;base64,${saved.base64}`;
}

function Avatar({ photoURL, first, last }) {
  return (
    <View style={styles.avatar}>
      {photoURL ? (
        <Image source={{ uri: photoURL }} style={styles.avatarImage} accessibilityLabel="Profile photo" />
      ) : (
        <Text style={styles.avatarInitials}>{initials(first, last)}</Text>
      )}
    </View>
  );
}

function PlanBadge({ tier }) {
  const isPremium = String(tier).toLowerCase() === "premium";
  return (
    <View style={[styles.planBadge, isPremium ? styles.planBadgePremium : styles.planBadgeFree]}>
      <Text style={[styles.planBadgeText, isPremium ? styles.planBadgeTextPremium : styles.planBadgeTextFree]}>
        {isPremium ? "★ Premium plan" : "Free plan"}
        </Text>
    </View>
  );
}

function InfoRow({ label, value, badge, last }) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoValueRow}>
        {value ? (
          <Text style={styles.infoValue}>{value}</Text>
        ) : (
          <Text style={[styles.infoValue, styles.infoEmpty]}>Not provided</Text>
        )}
        {badge ? (
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedText}>✓ Verified</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Field({ label, value, onChangeText, optional, placeholder, error, hint, maxLength, keyboardType, autoCapitalize }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {optional ? <Text style={styles.fieldOptional}> (optional)</Text> : null}
        </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        maxLength={maxLength}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={[styles.input, error ? styles.inputError : null]}
      />
      {hint && !error ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function PwField({ label, value, onChangeText, show, onToggle }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.pwWrap}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          style={[styles.input, styles.pwInput]}
        />
        <Pressable onPress={onToggle} style={styles.pwToggle} hitSlop={8} accessibilityLabel={show ? "Hide" : "Show"}>
          <EyeIcon size={16} off={show} />
        </Pressable>
      </View>
    </View>
  );
}

function BackLink({ onPress, label = "Back to account" }) {
  return (
    <Pressable onPress={onPress} style={styles.backLink} hitSlop={6}>
      <ChevronLeftIcon size={16} color={colors.slate} />
      <Text style={styles.backLinkText}>{label}</Text>
    </Pressable>
  );
}

export default function AccountScreen({ navigation }) {
  const { user, tier } = useAppData();
  const [view, setView] = useState("summary"); // summary | edit | pwOtp | pwNew

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [photoURL, setPhotoURL] = useState("");
  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);

  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");

  const [form, setForm] = useState({ firstName: "", middleName: "", lastName: "", username: "", contactNumber: "" });
  const [originalForm, setOriginalForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [otpMeta, setOtpMeta] = useState(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [sendOtpError, setSendOtpError] = useState("");

  const [resetToken, setResetToken] = useState("");
  const [pw, setPw] = useState({ newPw: "", confirm: "" });
  const [pwShow, setPwShow] = useState({ newPw: false, confirm: false });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState("");

  const applyProfile = useCallback((data, fbUser) => {
    const f = profileFields(data, fbUser);
    setProfile(data);
    setForm(f);
    setOriginalForm(f);
    setPhotoURL(data?.photoURL || fbUser?.photoURL || "");
    setEmail(data?.email || fbUser?.email || "");
    setEmailVerified(data?.emailVerified ?? fbUser?.emailVerified ?? false);
  }, []);

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
  }, [user, applyProfile]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(" ") || "—";
  const providers = user?.providerData || [];
  const hasPasswordProvider = providers.some((p) => p?.providerId === "password");
  const isGoogleAccount = providers.some((p) => p?.providerId === "google.com");
  const canEditUsername = hasPasswordProvider && !isGoogleAccount;
  const isDirty =
    originalForm &&
    (form.firstName !== originalForm.firstName ||
      form.middleName !== originalForm.middleName ||
      form.lastName !== originalForm.lastName ||
      (canEditUsername && form.username !== originalForm.username) ||
      form.contactNumber !== originalForm.contactNumber);
  const mobileErr = phoneError(form.contactNumber);
  const firstErr = nameError(form.firstName, "First name");
  const lastErr = nameError(form.lastName, "Last name");
  const middleErr = nameError(form.middleName, "Middle name", { required: false });
  const userErr = canEditUsername ? usernameError(form.username) : "";
  const editInvalid = Boolean(firstErr || lastErr || middleErr || mobileErr || userErr);

  async function handleChangePhoto() {
    if (photoUploading) return;
    setPhotoError("");
    let dataUrl;
    try {
      dataUrl = await pickProfilePhoto();
    } catch (err) {
      setPhotoError(err?.message || "Could not open the selected photo.");
      return;
    }
    if (!dataUrl) return;
    setPhotoUploading(true);
    try {
      await updateUserProfile({ photoUrl: dataUrl });
      setPhotoURL(dataUrl);
    } catch (err) {
      setPhotoError(err?.message || "Photo upload failed.");
    } finally {
      setPhotoUploading(false);
    }
  }

  function setField(key) {
    return (text) => {
      setForm((p) => ({ ...p, [key]: text }));
      setSaveError("");
      setSaveSuccess(false);
    };
  }

  async function handleSaveEdit() {
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
      setSaveError(err?.message || "Could not save your profile.");
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

  async function handleStartChangePassword() {
    setSendingOtp(true);
    setSendOtpError("");
    try {
      const res = await sendOtp({ email, purpose: "reset_password" });
      const bypass = otpBypassToken(res, "reset_password");
      if (bypass) {
        setResetToken(bypass);
        setPw({ newPw: "", confirm: "" });
        setPwError("");
        setView("pwNew");
        return;
      }
      setOtpMeta(res);
      setView("pwOtp");
    } catch (err) {
      setSendOtpError(err?.message || "Could not send the code.");
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

  async function handleSetPassword() {
    setPwError("");
    if (pw.newPw.length < 8) {
      setPwError("Password must be at least 8 characters.");
      return;
    }
    if (!/[a-zA-Z]/.test(pw.newPw) || !/[0-9]/.test(pw.newPw)) {
      setPwError("Password must include at least one letter and one number.");
      return;
    }
    if (pw.newPw !== pw.confirm) {
      setPwError("Passwords do not match.");
      return;
    }
    setPwBusy(true);
    try {
      await resetPasswordWithOtp({ email, resetToken, newPassword: pw.newPw });
      if (user?.uid) {
        const next = pushNotification(await loadNotifications(user.uid), {
          id: `password-${user.uid}-${Date.now()}`,
          type: "password",
          title: "Password changed",
          body: "Your account password was updated successfully.",
          createdAt: new Date().toISOString(),
          read: false,
        });
        await saveNotifications(next, user.uid);
      }
      await signOutUser(auth);
    } catch (err) {
      setPwError(err?.message || "Could not update the password.");
      setPwBusy(false);
    }
  }

  function renderBody() {
    if (loading) {
      return (
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>Loading account settings…</Text>
        </View>
      );
    }

    if (view === "edit") {
      return (
        <>
          <BackLink onPress={handleCancelEdit} />
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Edit profile</Text>
            <Text style={styles.formSubtitle}>Changes take effect immediately after saving.</Text>
            <View style={styles.formFields}>
              <Field
                label="First name"
                value={form.firstName}
                onChangeText={setField("firstName")}
                error={form.firstName ? firstErr : ""}
              />
              <Field
                label="Middle name"
                value={form.middleName}
                onChangeText={setField("middleName")}
                optional
                error={middleErr}
              />
              <Field
                label="Last name"
                value={form.lastName}
                onChangeText={setField("lastName")}
                error={form.lastName ? lastErr : ""}
              />
              {canEditUsername ? (
                <Field
                  label="Username"
                  value={form.username}
                  onChangeText={setField("username")}
                  placeholder="e.g. vince.opo"
                  maxLength={20}
                  autoCapitalize="none"
                  hint="Required. 3–20 characters; letters, numbers, underscore, or period. Blank is not allowed."
                  error={userErr}
                />
              ) : null}
              <Field
                label="Mobile number"
                value={form.contactNumber}
                onChangeText={(text) => {
                  setForm((p) => ({ ...p, contactNumber: digitsOnly(text, 11) }));
                  setSaveError("");
                  setSaveSuccess(false);
                }}
                optional
                keyboardType="number-pad"
                maxLength={11}
                placeholder="0912xxxxxxx"
                hint="Example: 0912xxxxxxx — 11 digits, starts with 09."
                error={mobileErr}
              />

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Email address</Text>
                <View style={styles.readOnlyWrap}>
                  <Text style={styles.readOnlyText} numberOfLines={1}>
                    {email}
                  </Text>
                  {emailVerified ? (
                    <View style={styles.verifiedBadge}>
                      <Text style={styles.verifiedText}>✓ Verified</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.fieldHint}>Email cannot be changed from this screen.</Text>
              </View>
            </View>

            {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}
            {saveSuccess ? <Text style={styles.successText}>✓ Saved!</Text> : null}

            <View style={styles.formActions}>
              <Pressable
                onPress={handleCancelEdit}
                style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveEdit}
                disabled={!isDirty || saving || editInvalid}
                style={({ pressed }) => [
                  styles.saveBtn,
                  pressed && styles.saveBtnPressed,
                  (!isDirty || saving || editInvalid) && styles.btnDisabled,
                ]}
              >
                <Text style={styles.saveText}>{saving ? "Saving…" : "Save changes"}</Text>
              </Pressable>
            </View>
          </View>
        </>
      );
    }

    if (view === "pwOtp") {
      const back = () => {
        setView("summary");
        setSendOtpError("");
      };
      return (
        <>
          <BackLink onPress={back} />
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Verify your identity</Text>
            <Text style={styles.formSubtitle}>
              Enter the 6-digit code we sent to your email before setting a new password.
            </Text>
            <OtpStep
              email={email}
              purpose="reset_password"
              expiresIn={otpMeta?.expires_in || 300}
              resendIn={otpMeta?.resend_in || 30}
              devCode={otpMeta?.dev_code || ""}
              onVerified={handleOtpVerified}
              onBack={back}
              backLabel="Cancel"
            />
          </View>
        </>
      );
    }

    if (view === "pwNew") {
      const hints = [
        { ok: pw.newPw.length >= 8, label: "8+ characters" },
        { ok: /[a-zA-Z]/.test(pw.newPw), label: "One letter" },
        { ok: /[0-9]/.test(pw.newPw), label: "One number" },
      ];
      return (
        <>
          <BackLink onPress={() => setView("summary")} />
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Set new password</Text>
            <Text style={styles.formSubtitle}>Your identity has been verified. Choose a strong new password.</Text>
            <View style={styles.formFields}>
              <PwField
                label="New password"
                value={pw.newPw}
                onChangeText={(text) => {
                  setPw((p) => ({ ...p, newPw: text }));
                  setPwError("");
                }}
                show={pwShow.newPw}
                onToggle={() => setPwShow((s) => ({ ...s, newPw: !s.newPw }))}
              />
              <PwField
                label="Confirm new password"
                value={pw.confirm}
                onChangeText={(text) => {
                  setPw((p) => ({ ...p, confirm: text }));
                  setPwError("");
                }}
                show={pwShow.confirm}
                onToggle={() => setPwShow((s) => ({ ...s, confirm: !s.confirm }))}
              />
              {pw.newPw.length > 0 ? (
                <View style={styles.hints}>
                  {hints.map(({ ok, label }) => (
                    <Text key={label} style={[styles.hintText, ok && styles.hintOk]}>
                      {ok ? "✓" : "○"} {label}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>

            {pwError ? <Text style={styles.errorText}>{pwError}</Text> : null}

            <Pressable
              onPress={handleSetPassword}
              disabled={pwBusy || !pw.newPw || !pw.confirm}
              style={({ pressed }) => [
                styles.setPwBtn,
                pressed && styles.saveBtnPressed,
                (pwBusy || !pw.newPw || !pw.confirm) && styles.btnDisabled,
              ]}
            >
              <Text style={styles.saveText}>{pwBusy ? "Updating…" : "Set new password"}</Text>
            </Pressable>
          </View>
        </>
      );
    }

    return (
      <View style={styles.panels}>
        <View style={styles.leftPanel}>
          <View style={styles.avatarWrap}>
            <Avatar photoURL={photoURL} first={form.firstName} last={form.lastName} />
            {emailVerified ? (
              <View style={styles.avatarCheck}>
                <Text style={styles.avatarCheckText}>✓</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.fullName}>{fullName}</Text>
          <View style={styles.planBadgeWrap}>
            <PlanBadge tier={tier} />
          </View>

          <Pressable
            onPress={handleChangePhoto}
            disabled={photoUploading}
            style={({ pressed }) => [
              styles.photoBtn,
              pressed && styles.photoBtnPressed,
              photoUploading && styles.photoBtnBusy,
            ]}
          >
            {photoUploading ? (
              <>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={styles.photoBtnText}>Uploading…</Text>
              </>
            ) : (
              <>
                <CameraIcon size={14} />
                <Text style={styles.photoBtnText}>Change photo</Text>
              </>
            )}
          </Pressable>
          {photoError ? <Text style={styles.photoError}>{photoError}</Text> : null}
        </View>

        <View style={styles.rightPanel}>
          <Text style={styles.detailsTitle}>Account details</Text>
          <Text style={styles.detailsSubtitle}>
            Your account information is shown below. Use the buttons to make changes.
          </Text>

          <View style={styles.infoCard}>
            <InfoRow label="Email address" value={email} badge={emailVerified} />
            {canEditUsername ? <InfoRow label="Username" value={form.username} /> : null}
            <InfoRow label="Mobile number" value={form.contactNumber} last />
          </View>

          <View style={styles.actions}>
      <Pressable
        onPress={() => {
                setSaveError("");
                setSaveSuccess(false);
                setView("edit");
              }}
              style={({ pressed }) => [styles.editBtn, pressed && styles.editBtnPressed]}
            >
              <PencilIcon size={16} />
              <Text style={styles.editText}>Edit profile</Text>
            </Pressable>

            <Pressable
              onPress={handleStartChangePassword}
              disabled={sendingOtp}
              style={({ pressed }) => [styles.pwBtn, pressed && styles.saveBtnPressed, sendingOtp && styles.pwBtnBusy]}
            >
              {sendingOtp ? (
                <>
                  <ActivityIndicator size="small" color={colors.white} />
                  <Text style={styles.pwBtnText}>Sending code…</Text>
                </>
              ) : (
                <>
                  <PadlockIcon size={16} />
                  <Text style={styles.pwBtnText}>
                    {isGoogleAccount && !hasPasswordProvider ? "Set login password" : "Change password"}
                  </Text>
                </>
              )}
      </Pressable>
    </View>

          {isGoogleAccount ? (
            <Text style={styles.googleNote}>
              You sign in with Google. Setting a password is optional and only needed if you also want email login — no
              username is required.
            </Text>
          ) : null}

          <Pressable
            onPress={() => navigation.navigate("Subscription")}
            style={({ pressed }) => [styles.manageBtn, pressed && styles.manageBtnPressed]}
          >
            <Text style={styles.manageText}>Manage subscription</Text>
          </Pressable>

          {sendOtpError ? <Text style={styles.errorText}>{sendOtpError}</Text> : null}
        </View>
      </View>
    );
  }

  return (
    <AppShell active="account" breadcrumb="Dashboard / Settings" title="Account Settings">
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {renderBody()}
      </ScrollView>
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
  loadingWrap: { minHeight: 256, alignItems: "center", justifyContent: "center" },
  loadingText: { fontSize: 14, color: colors.muted },
  panels: {
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...cardShadow,
  },
  leftPanel: {
    alignItems: "center",
    backgroundColor: "#101a30",
    paddingHorizontal: 32,
    paddingVertical: 36,
  },
  avatarWrap: { position: "relative" },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: "hidden",
    backgroundColor: "#1a3a5c",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarInitials: { fontSize: 30, fontWeight: "700", color: colors.accent },
  avatarCheck: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#101a30",
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarCheckText: { fontSize: 10, fontWeight: "700", color: colors.white },
  fullName: { marginTop: 16, fontSize: 16, fontWeight: "700", lineHeight: 21, color: colors.white, textAlign: "center" },
  planBadgeWrap: { marginTop: 8 },
  planBadge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  planBadgePremium: { backgroundColor: "rgba(22,191,168,0.2)" },
  planBadgeFree: { backgroundColor: "rgba(71,85,105,0.4)" },
  planBadgeText: { fontSize: 11, fontWeight: "600" },
  planBadgeTextPremium: { color: colors.accent },
  planBadgeTextFree: { color: "#cbd5e1" },
  photoBtn: {
    marginTop: 32,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#475569",
    backgroundColor: "#1a2943",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  photoBtnPressed: { backgroundColor: "#1f3252" },
  photoBtnBusy: { opacity: 0.6 },
  photoBtnText: { fontSize: 12, fontWeight: "600", color: "#e2e8f0" },
  photoError: { marginTop: 8, fontSize: 11, color: "#fb7185", textAlign: "center" },
  rightPanel: { backgroundColor: colors.white, paddingHorizontal: 20, paddingVertical: 28 },
  detailsTitle: { fontSize: 20, fontWeight: "700", color: "#1e293b" },
  detailsSubtitle: { marginTop: 2, fontSize: 12, lineHeight: 17, color: colors.muted },
  infoCard: {
    marginTop: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    backgroundColor: "#f8f9fb",
    paddingHorizontal: 16,
  },
  infoRow: { borderBottomWidth: 1, borderBottomColor: "#f1f5f9", paddingVertical: 14 },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.muted,
  },
  infoValueRow: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 10 },
  infoValue: { flex: 1, fontSize: 14, color: "#334155" },
  infoEmpty: { fontStyle: "italic", color: colors.muted },
  verifiedBadge: { borderRadius: 999, backgroundColor: "#d1fae5", paddingHorizontal: 10, paddingVertical: 2 },
  verifiedText: { fontSize: 10, fontWeight: "600", color: "#047857" },
  actions: { marginTop: 28, gap: 12 },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 24,
    paddingVertical: 12,
    ...cardShadow,
  },
  editBtnPressed: { backgroundColor: "#f8fafc" },
  editText: { fontSize: 14, fontWeight: "600", color: "#334155" },
  pwBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    ...cardShadow,
  },
  pwBtnBusy: { opacity: 0.5 },
  pwBtnText: { fontSize: 14, fontWeight: "700", color: colors.white },
  googleNote: { marginTop: 12, fontSize: 11, lineHeight: 17, color: colors.muted },
  manageBtn: {
    marginTop: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#f8f9fb",
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  manageBtnPressed: { backgroundColor: "#f1f5f9" },
  manageText: { fontSize: 14, fontWeight: "600", color: "#334155" },
  errorText: { marginTop: 12, fontSize: 12, color: "#f43f5e" },
  successText: { marginTop: 12, fontSize: 12, fontWeight: "600", color: "#059669" },
  backLink: { marginBottom: 20, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  backLinkText: { fontSize: 14, fontWeight: "500", color: colors.slate },
  formCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 24,
    ...cardShadow,
  },
  formTitle: { fontSize: 18, fontWeight: "700", color: "#1e293b" },
  formSubtitle: { marginTop: 2, fontSize: 12, lineHeight: 17, color: colors.muted },
  formFields: { marginTop: 24, gap: 16 },
  field: {},
  fieldLabel: { marginBottom: 6, fontSize: 12, fontWeight: "600", color: "#475569" },
  fieldOptional: { fontWeight: "400", color: colors.muted },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1e293b",
  },
  inputError: { borderColor: "#fb7185" },
  fieldHint: { marginTop: 4, fontSize: 11, lineHeight: 16, color: colors.muted },
  fieldError: { marginTop: 4, fontSize: 11, lineHeight: 16, color: "#f43f5e" },
  readOnlyWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#f8f9fb",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  readOnlyText: { flex: 1, fontSize: 14, color: colors.muted },
  formActions: {
    marginTop: 20,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 20,
  },
  cancelBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  cancelBtnPressed: { backgroundColor: "#f8fafc" },
  cancelText: { fontSize: 12, fontWeight: "600", color: "#475569" },
  saveBtn: { borderRadius: 12, backgroundColor: colors.accent, paddingHorizontal: 28, paddingVertical: 10, ...cardShadow },
  saveBtnPressed: { backgroundColor: colors.accentHover },
  saveText: { fontSize: 12, fontWeight: "700", color: colors.white, textAlign: "center" },
  btnDisabled: { opacity: 0.4 },
  pwWrap: { position: "relative", justifyContent: "center" },
  pwInput: { paddingRight: 40 },
  pwToggle: { position: "absolute", right: 12 },
  hints: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  hintText: { fontSize: 11, fontWeight: "600", color: colors.muted },
  hintOk: { color: "#059669" },
  setPwBtn: { marginTop: 16, borderRadius: 12, backgroundColor: colors.accent, paddingVertical: 12, ...cardShadow },
});
