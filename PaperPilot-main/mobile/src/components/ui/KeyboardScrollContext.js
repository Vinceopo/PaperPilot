import { createContext, useContext } from "react";

/**
 * Any focused TextInput can ask the nearest KeyboardAwareScrollView
 * to keep it above the soft keyboard.
 */
export const KeyboardScrollContext = createContext(null);

export function useKeyboardScroll() {
  return useContext(KeyboardScrollContext);
}
