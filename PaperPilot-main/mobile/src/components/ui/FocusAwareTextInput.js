import { forwardRef, useRef } from "react";
import { TextInput } from "react-native";
import { useKeyboardScroll } from "./KeyboardScrollContext";

/**
 * TextInput that asks the nearest KeyboardAwareScrollView to stay above the keyboard.
 */
const FocusAwareTextInput = forwardRef(function FocusAwareTextInput({ onFocus, ...props }, ref) {
  const localRef = useRef(null);
  const keyboardScroll = useKeyboardScroll();

  function setRef(node) {
    localRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }

  return (
    <TextInput
      ref={setRef}
      onFocus={(event) => {
        keyboardScroll?.ensureVisible?.(localRef);
        onFocus?.(event);
      }}
      {...props}
    />
  );
});

export default FocusAwareTextInput;
