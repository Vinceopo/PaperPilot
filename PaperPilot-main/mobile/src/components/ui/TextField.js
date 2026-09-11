import { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { colors } from "../../theme";

/**
 * Labeled TextInput approximating the web FloatingLabelInput look on light theme.
 */
export default function TextField({
  label,
  value,
  onChangeText,
  onBlur,
  error,
  hint,
  secureTextEntry = false,
  showPasswordToggle = false,
  disabled = false,
  autoCapitalize = "sentences",
  autoComplete,
  keyboardType = "default",
  maxLength,
  style,
  ...rest
}) {
  const [visible, setVisible] = useState(false);
  const isPassword = secureTextEntry || showPasswordToggle;
  const hide = isPassword && !visible;

  return (
    <View style={[styles.wrap, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.field, error ? styles.fieldError : null, disabled ? styles.fieldDisabled : null]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          secureTextEntry={hide}
          editable={!disabled}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          keyboardType={keyboardType}
          maxLength={maxLength}
          placeholderTextColor={colors.muted}
          {...rest}
        />
        {showPasswordToggle ? (
          <TouchableOpacity
            onPress={() => setVisible((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={visible ? "Hide password" : "Show password"}
          >
            <Text style={styles.toggle}>{visible ? "Hide" : "Show"}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.slate,
    marginBottom: 6,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 14,
  },
  fieldError: {
    borderColor: colors.rose,
  },
  fieldDisabled: {
    opacity: 0.6,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 12,
  },
  toggle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.accentText,
    marginLeft: 8,
  },
  error: {
    marginTop: 6,
    fontSize: 13,
    color: colors.rose,
  },
  hint: {
    marginTop: 6,
    fontSize: 12.5,
    color: colors.muted,
  },
});
