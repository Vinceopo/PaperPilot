import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";

/** In-app confirmation dialog matching PaperPilot modal styling (mirrors web ConfirmDialog). */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
  icon = null,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const danger = tone === "danger";
  return (
    <Modal visible={Boolean(open)} transparent animationType="fade" onRequestClose={busy ? undefined : onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            {cancelLabel ? (
              <Pressable
                style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelPressed, busy && styles.disabled]}
                disabled={busy}
                onPress={onCancel}
              >
                <Text style={styles.cancelText}>{cancelLabel}</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={({ pressed }) => [
                styles.confirmBtn,
                danger ? styles.confirmDanger : styles.confirmPrimary,
                pressed && (danger ? styles.confirmDangerPressed : styles.confirmPrimaryPressed),
                busy && (danger ? styles.confirmDangerBusy : styles.confirmPrimaryBusy),
              ]}
              disabled={busy}
              onPress={onConfirm}
            >
              {busy ? (
                <>
                  <ActivityIndicator size="small" color={danger ? colors.white : colors.muted} />
                  <Text style={[styles.confirmText, !danger && styles.confirmTextBusy]}>Processing…</Text>
                </>
              ) : (
                <Text style={styles.confirmText}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 448,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 24,
    shadowColor: "#0f172a",
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  icon: { marginBottom: 12 },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  message: { marginTop: 8, fontSize: 14, lineHeight: 21, color: colors.slate },
  actions: { marginTop: 24, flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 12 },
  cancelBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  cancelPressed: { backgroundColor: "#f8fafc" },
  cancelText: { fontSize: 12, fontWeight: "600", color: "#475569" },
  disabled: { opacity: 0.4 },
  confirmBtn: {
    minWidth: 112,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  confirmPrimary: { backgroundColor: colors.accent },
  confirmPrimaryPressed: { backgroundColor: colors.accentHover },
  confirmPrimaryBusy: { backgroundColor: colors.border },
  confirmDanger: { backgroundColor: "#e11d48" },
  confirmDangerPressed: { backgroundColor: "#be123c" },
  confirmDangerBusy: { backgroundColor: "#fda4af" },
  confirmText: { fontSize: 12, fontWeight: "700", color: colors.white },
  confirmTextBusy: { color: colors.muted },
});
