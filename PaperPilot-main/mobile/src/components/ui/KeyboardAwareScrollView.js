import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Dimensions, Keyboard, Platform, ScrollView, StyleSheet } from "react-native";
import { KeyboardScrollContext } from "./KeyboardScrollContext";

/**
 * App-wide scroll container that keeps ANY focused input above the keyboard.
 * Works for login, register, account, upload, OTP — not tied to one field.
 */
const KeyboardAwareScrollView = forwardRef(function KeyboardAwareScrollView(
  {
    children,
    contentContainerStyle,
    style,
    keyboardOpenContentStyle,
    ...rest
  },
  ref
) {
  const scrollRef = useRef(null);
  const scrollYRef = useRef(0);
  const keyboardHeightRef = useRef(0);
  const focusedInputRef = useRef(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useImperativeHandle(ref, () => scrollRef.current);

  const ensureVisible = useCallback((inputRef) => {
    if (inputRef) focusedInputRef.current = inputRef;

    const run = () => {
      const active = focusedInputRef.current;
      const input = active?.current || active;
      const scroller = scrollRef.current;
      if (!input || !scroller || typeof input.measureInWindow !== "function") return;

      input.measureInWindow((_x, y, _w, h) => {
        const screenH = Dimensions.get("window").height;
        const kb = keyboardHeightRef.current || 0;
        const safeBottom = screenH - kb - 28;
        const fieldBottom = y + h;
        if (fieldBottom <= safeBottom) return;

        const delta = fieldBottom - safeBottom + 40;
        scroller.scrollTo({
          y: Math.max(0, scrollYRef.current + delta),
          animated: true,
        });
      });
    };

    requestAnimationFrame(run);
    setTimeout(run, 50);
    setTimeout(run, 180);
    setTimeout(run, 360);
    setTimeout(run, 520);
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = (event) => {
      const next = Math.round(event?.endCoordinates?.height || 0);
      keyboardHeightRef.current = next;
      setKeyboardHeight(next);
      setTimeout(() => ensureVisible(focusedInputRef.current), 40);
      setTimeout(() => ensureVisible(focusedInputRef.current), 200);
    };
    const onHide = () => {
      keyboardHeightRef.current = 0;
      setKeyboardHeight(0);
      focusedInputRef.current = null;
    };
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [ensureVisible]);

  const api = useMemo(
    () => ({
      ensureVisible,
      keyboardHeight,
      keyboardOpen: keyboardHeight > 0,
    }),
    [ensureVisible, keyboardHeight]
  );

  const keyboardOpen = keyboardHeight > 0;
  const bottomPad = keyboardOpen ? keyboardHeight + (Platform.OS === "android" ? 48 : 24) : undefined;

  return (
    <KeyboardScrollContext.Provider value={api}>
      <ScrollView
        ref={scrollRef}
        style={style}
        contentContainerStyle={[
          contentContainerStyle,
          keyboardOpen ? keyboardOpenContentStyle : null,
          bottomPad != null ? { paddingBottom: bottomPad } : null,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={false}
        onScroll={(event) => {
          scrollYRef.current = event.nativeEvent.contentOffset.y;
          rest.onScroll?.(event);
        }}
        scrollEventThrottle={16}
        {...rest}
      >
        {children}
      </ScrollView>
    </KeyboardScrollContext.Provider>
  );
});

export default KeyboardAwareScrollView;

export const keyboardAwareStyles = StyleSheet.create({
  openTopAlign: {
    justifyContent: "flex-start",
  },
});
