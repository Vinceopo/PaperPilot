import { useEffect, useRef } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../../theme";

/**
 * Six digit boxes with auto-advance. Calls onComplete when all 6 digits are filled.
 */
export default function OtpInput({
  value = "",
  onChange,
  onComplete,
  error,
  disabled = false,
  autoFocus = false,
}) {
  const digits = (value || "").padEnd(6, " ").slice(0, 6).split("");
  const refs = useRef([]);
  const lastComplete = useRef("");

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const code = (value || "").replace(/\D/g, "").slice(0, 6);
    if (code.length === 6 && code !== lastComplete.current) {
      lastComplete.current = code;
      onComplete?.(code);
    }
    if (code.length < 6) lastComplete.current = "";
  }, [value, onComplete]);

  function setAt(index, char) {
    const next = digits.map((d) => (d === " " ? "" : d));
    next[index] = char;
    onChange(next.join("").replace(/\s/g, "").slice(0, 6));
  }

  function onChangeDigit(i, text) {
    const cleaned = (text || "").replace(/\D/g, "");
    if (cleaned.length > 1) {
      // Paste into this box — fill remaining slots.
      const merged = ((value || "").slice(0, i) + cleaned).replace(/\D/g, "").slice(0, 6);
      onChange(merged);
      refs.current[Math.min(merged.length, 5)]?.focus();
      return;
    }
    const char = cleaned.slice(-1);
    if (!char) {
      setAt(i, "");
      return;
    }
    setAt(i, char);
    if (i < 5) refs.current[i + 1]?.focus();
  }

  function onKeyPress(i, e) {
    if (e.nativeEvent.key !== "Backspace") return;
    if (digits[i].trim()) {
      setAt(i, "");
      return;
    }
    if (i > 0) {
      refs.current[i - 1]?.focus();
      setAt(i - 1, "");
    }
  }

  return (
    <View>
      <View style={styles.row} accessibilityLabel="Six-digit verification code">
        {digits.map((d, i) => (
          <TextInput
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            style={[styles.box, error ? styles.boxError : null]}
            value={d.trim()}
            onChangeText={(text) => onChangeDigit(i, text)}
            onKeyPress={(e) => onKeyPress(i, e)}
            keyboardType="number-pad"
            textContentType={i === 0 ? "oneTimeCode" : "none"}
            maxLength={6}
            editable={!disabled}
            selectTextOnFocus
            accessibilityLabel={`Digit ${i + 1}`}
          />
        ))}
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  box: {
    flex: 1,
    maxWidth: 48,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: colors.navy,
  },
  boxError: {
    borderColor: "#fb7185",
  },
  error: {
    marginTop: 8,
    fontSize: 13,
    color: colors.rose,
  },
});
