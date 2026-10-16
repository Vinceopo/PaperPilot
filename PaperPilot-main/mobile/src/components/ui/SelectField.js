import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme";

function Chevron({ color = "#64748b" }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M6 9l6 6 6-6" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * Native-feeling replacement for a web <select>: shows the current option and
 * opens a bottom sheet of choices. `options` is [{ value, label }].
 */
export default function SelectField({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Select…",
  title,
  style,
  textStyle,
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const current = options.find((item) => item.value === value);

  return (
    <>
      <Pressable
        style={[styles.field, disabled && styles.fieldDisabled, style]}
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={title ? `${title}: ${current?.label || placeholder}` : undefined}
      >
        <Text style={[styles.value, !current && styles.placeholder, textStyle]} numberOfLines={1}>
          {current?.label || placeholder}
        </Text>
        <Chevron />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>
            {title ? <Text style={styles.sheetTitle}>{title}</Text> : null}
            <ScrollView style={styles.list} bounces={false}>
              {options.map((item) => {
                const active = item.value === value;
                return (
                  <Pressable
                    key={String(item.value)}
                    style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && styles.optionPressed]}
                    onPress={() => {
                      setOpen(false);
                      if (item.value !== value) onChange?.(item.value);
                    }}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>{item.label}</Text>
                    {active ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    marginTop: 6,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
  },
  fieldDisabled: { backgroundColor: "#f8fafc" },
  value: { flex: 1, fontSize: 13, color: "#334155" },
  placeholder: { color: colors.muted },
  backdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.4)", justifyContent: "flex-end" },
  sheet: {
    maxHeight: "70%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.white,
    paddingTop: 16,
    paddingHorizontal: 12,
  },
  sheetTitle: {
    paddingHorizontal: 8,
    paddingBottom: 10,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.muted,
  },
  list: { flexGrow: 0 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  optionActive: { backgroundColor: "#e7f8f5" },
  optionPressed: { backgroundColor: "#f1f5f9" },
  optionText: { flex: 1, fontSize: 15, color: "#334155" },
  optionTextActive: { fontWeight: "700", color: "#0f766e" },
  check: { fontSize: 15, fontWeight: "700", color: colors.accent },
});
