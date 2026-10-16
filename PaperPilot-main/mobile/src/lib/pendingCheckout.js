import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "paperpilot.pendingCheckout";
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

/** Remember a started PayMongo checkout so it can be confirmed even if the app restarts. */
export async function savePendingCheckout(uid, checkoutSessionId) {
  if (!uid || !checkoutSessionId) return;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ uid, checkoutSessionId, at: Date.now() }));
  } catch {
    // Confirmation still runs in the current session.
  }
}

export async function clearPendingCheckout() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Nothing to clean up.
  }
}

export async function readPendingCheckout(uid) {
  if (!uid) return null;
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(KEY)) || "null");
    if (!saved?.checkoutSessionId) return null;
    if (saved.uid !== uid || Date.now() - Number(saved.at || 0) > MAX_AGE_MS) {
      await clearPendingCheckout();
      return null;
    }
    return String(saved.checkoutSessionId);
  } catch {
    return null;
  }
}
