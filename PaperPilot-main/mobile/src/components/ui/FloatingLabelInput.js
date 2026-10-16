import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { colors } from "../../theme";

const FIELD_HEIGHT = 52;
const LABEL_LINE = 18;
const LABEL_REST_TOP = (FIELD_HEIGHT - LABEL_LINE) / 2;
const LABEL_FLOAT_TOP = -LABEL_LINE / 2;

const line = { strokeWidth: 1.7, fill: "none" };

const ICONS = {
  mail: (c) => (
    <>
      <Rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke={c} {...line} />
      <Path d="M4 7.5 12 13l8-5.5" stroke={c} strokeLinecap="round" strokeLinejoin="round" {...line} />
    </>
  ),
  lock: (c) => (
    <>
      <Rect x="5" y="10.5" width="14" height="9" rx="2" stroke={c} {...line} />
      <Path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke={c} strokeLinecap="round" {...line} />
    </>
  ),
  user: (c) => (
    <>
      <Circle cx="12" cy="8" r="3.25" stroke={c} {...line} />
      <Path d="M5.5 18.5c1.2-2.6 3.5-4 6.5-4s5.3 1.4 6.5 4" stroke={c} strokeLinecap="round" {...line} />
    </>
  ),
  at: (c) => (
    <>
      <Circle cx="12" cy="12" r="7.25" stroke={c} {...line} />
      <Circle cx="12" cy="12" r="3.1" stroke={c} {...line} />
      <Path d="M15.1 12v1.4a2.2 2.2 0 0 0 4.2-.4V12" stroke={c} strokeLinecap="round" {...line} />
    </>
  ),
  eye: (c) => (
    <>
      <Path
        d="M2.3 12C3.2 10.8 6.8 6.2 12 6.2s8.8 4.6 9.7 5.8c-.9 1.2-4.5 5.8-9.7 5.8S3.2 13.2 2.3 12Z"
        stroke={c}
        {...line}
      />
      <Circle cx="12" cy="12" r="2.7" stroke={c} {...line} />
    </>
  ),
  eyeOff: (c) => (
    <>
      <Path d="M3 3l18 18" stroke={c} strokeLinecap="round" {...line} />
      <Path
        d="M10.5 6.3A9.7 9.7 0 0 1 12 6.2c5.2 0 8.8 4.6 9.7 5.8-.4.6-1.3 1.8-2.8 3M6.2 6.2C4.2 7.6 2.9 9.4 2.3 12c.9 1.2 4.5 5.8 9.7 5.8 1.3 0 2.5-.3 3.6-.7"
        stroke={c}
        strokeLinecap="round"
        {...line}
      />
      <Path d="M9.9 9.9A3 3 0 0 0 12 15a3 3 0 0 0 2.1-.9" stroke={c} strokeLinecap="round" {...line} />
    </>
  ),
};

function Icon({ name, color }) {
  const draw = ICONS[name];
  if (!draw) return null;
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      {draw(color)}
    </Svg>
  );
}

/**
 * Mobile counterpart of web FloatingLabelInput: leading icon, label that floats
 * onto the border when focused or filled, optional eye toggle for passwords.
 */
export default function FloatingLabelInput({
  label,
  value,
  onChangeText,
  onFocus,
  onBlur,
  icon = "mail",
  error,
  hint,
  secureTextEntry = false,
  showPasswordToggle = false,
  disabled = false,
  autoCapitalize = "none",
  style,
  ...rest
}) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const floated = focused || Boolean(value);
  const anim = useRef(new Animated.Value(floated ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: floated ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [anim, floated]);

  let labelColor = colors.muted;
  if (error && floated) labelColor = colors.rose;
  else if (focused) labelColor = colors.accent;

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.field}>
        <TextInput
          style={[
            styles.input,
            showPasswordToggle ? styles.inputWithToggle : null,
            focused ? styles.inputFocused : null,
            error ? styles.inputError : null,
            disabled ? styles.inputDisabled : null,
          ]}
          value={value}
          onChangeText={onChangeText}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          secureTextEntry={secureTextEntry && !visible}
          editable={!disabled}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          accessibilityLabel={label}
          {...rest}
        />

        <View style={styles.icon}>
          <Icon name={icon} color={colors.muted} />
        </View>

        <Animated.View
          style={[
            styles.labelWrap,
            showPasswordToggle ? styles.labelWrapWithToggle : null,
            { top: anim.interpolate({ inputRange: [0, 1], outputRange: [LABEL_REST_TOP, LABEL_FLOAT_TOP] }) },
          ]}
        >
          <Animated.Text
            numberOfLines={1}
            style={[
              styles.label,
              {
                color: labelColor,
                fontSize: anim.interpolate({ inputRange: [0, 1], outputRange: [15, 12] }),
              },
            ]}
          >
            {label}
          </Animated.Text>
        </Animated.View>

        {showPasswordToggle && secureTextEntry ? (
          <TouchableOpacity
            style={styles.toggle}
            onPress={() => setVisible((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={visible ? "Hide password" : "Show password"}
          >
            <Icon name={visible ? "eyeOff" : "eye"} color={colors.muted} />
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
  field: { position: "relative", height: FIELD_HEIGHT },
  input: {
    height: FIELD_HEIGHT,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.white,
    paddingLeft: 44,
    paddingRight: 16,
    fontSize: 15,
    color: colors.navy,
  },
  inputWithToggle: { paddingRight: 44 },
  inputFocused: { borderColor: colors.accent },
  inputError: { borderColor: "#fb7185" },
  inputDisabled: { opacity: 0.6 },
  icon: {
    position: "absolute",
    left: 14,
    top: (FIELD_HEIGHT - 18) / 2,
    pointerEvents: "none",
  },
  labelWrap: {
    position: "absolute",
    left: 40,
    right: 16,
    flexDirection: "row",
    pointerEvents: "none",
  },
  labelWrapWithToggle: { right: 44 },
  label: {
    lineHeight: LABEL_LINE,
    paddingHorizontal: 4,
    backgroundColor: colors.white,
  },
  toggle: {
    position: "absolute",
    right: 12,
    top: (FIELD_HEIGHT - 26) / 2,
    padding: 4,
  },
  error: { marginTop: 6, fontSize: 13, color: colors.rose },
  hint: { marginTop: 6, fontSize: 13, color: colors.muted },
});
