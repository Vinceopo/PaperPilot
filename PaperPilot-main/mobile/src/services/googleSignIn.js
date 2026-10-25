import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

// Required so Android Custom Tabs hand the redirect back to openAuthSessionAsync.
WebBrowser.maybeCompleteAuthSession();

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_BRIDGE_URL = "https://paperpilotph.vercel.app/mobile-auth.html";
const APP_RETURN_PATH = "auth/google";

function authError(message, code) {
  const err = new Error(message);
  if (code) err.code = code;
  return err;
}

function decodeJwtPayload(token) {
  const part = String(token).split(".")[1] || "";
  const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return JSON.parse(atob(padded));
}

function toQuery(params) {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

function toBase64Url(base64) {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function verifyIdToken(idToken, clientId, hashedNonce) {
  let claims;
  try {
    claims = decodeJwtPayload(idToken);
  } catch {
    claims = {};
  }
  if (claims.aud !== clientId || claims.nonce !== hashedNonce) {
    throw authError("Google sign-in response could not be verified. Please try again.");
  }
}

function parseAuthParams(url) {
  if (!url) return {};
  try {
    const parsed = Linking.parse(url);
    const query = parsed.queryParams || {};
    // Some bridges leave the token in the hash fragment.
    const hash = String(url).includes("#") ? String(url).split("#")[1] : "";
    const hashParams = hash ? Object.fromEntries(new URLSearchParams(hash)) : {};
    return { ...hashParams, ...query };
  } catch {
    return {};
  }
}

/** Stable app deep link for release builds; Expo Go still uses Linking.createURL. */
function appReturnUrl() {
  const created = Linking.createURL(APP_RETURN_PATH);
  // Standalone / APK: prefer the custom scheme so Custom Tabs can hand off reliably.
  if (created.startsWith("paperpilot://") || created.startsWith("exp://") || created.startsWith("exps://")) {
    return created;
  }
  return `paperpilot://${APP_RETURN_PATH}`;
}

/**
 * iOS: uses an iOS OAuth client whose reversed-client-ID redirect is captured directly by
 * the system auth session, so no website is involved (works in Expo Go).
 */
async function signInWithIosClient(clientId, hashedNonce) {
  const scheme = `com.googleusercontent.apps.${clientId.replace(/\.apps\.googleusercontent\.com$/, "")}`;
  const redirectUri = `${scheme}:/oauthredirect`;
  const codeVerifier = `${Crypto.randomUUID()}${Crypto.randomUUID()}`.replace(/-/g, "");
  const codeChallenge = toBase64Url(
    await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, codeVerifier, {
      encoding: Crypto.CryptoEncoding.BASE64,
    })
  );
  const state = Crypto.randomUUID();

  const authUrl = `${GOOGLE_AUTH_URL}?${toQuery({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    nonce: hashedNonce,
    state,
    prompt: "select_account",
  })}`;

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
  if (result.type !== "success" || !result.url) {
    throw authError("Google sign-in was cancelled.", "auth/popup-closed-by-user");
  }

  const queryParams = parseAuthParams(result.url);
  if (queryParams.error) {
    throw authError(`Google sign-in failed (${queryParams.error}).`);
  }
  if (queryParams.state !== state || !queryParams.code) {
    throw authError("Google sign-in response could not be verified. Please try again.");
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: toQuery({
      code: String(queryParams.code),
      client_id: clientId,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id_token) {
    throw authError(`Google sign-in failed (${data.error || response.status}).`);
  }
  verifyIdToken(data.id_token, clientId, hashedNonce);
  return data.id_token;
}

/**
 * Fallback: Google only redirects web clients to registered HTTPS pages, so this lands on
 * the website's mobile-auth.html bridge, which forwards the ID token back to the app.
 * The bridge URL must be deployed and listed under the web client's "Authorized redirect URIs".
 */
async function assertBridgeDeployed(bridgeUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let html = "";
  try {
    const response = await fetch(`${bridgeUrl}?check=${Date.now()}`, { signal: controller.signal });
    html = response.ok ? await response.text() : "";
  } catch {
    throw authError("Could not reach the Google sign-in page. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
  // Vercel serves the SPA index.html for unknown paths, which would strand the user on the website.
  if (!html.includes("Returning to PaperPilot")) {
    throw authError(
      "Google sign-in is unavailable: mobile-auth.html is not deployed on the website. Use email and password, or set googleIosClientId in mobile/app.json."
    );
  }
}

/**
 * Wait for either openAuthSessionAsync success OR a Linking deep-link.
 * Android Custom Tabs often dismiss the session before returning the URL; the deep link still arrives.
 */
function waitForAuthRedirect(returnUrl, openSession) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let sub = null;

    const finish = (url, err) => {
      if (settled) return;
      settled = true;
      if (sub) {
        try {
          sub.remove();
        } catch {
          // ignore
        }
      }
      if (err) reject(err);
      else resolve(url);
    };

    const acceptUrl = (url) => {
      if (!url) return;
      const params = parseAuthParams(url);
      if (params.id_token || params.error || params.code) finish(url);
    };

    sub = Linking.addEventListener("url", ({ url }) => acceptUrl(url));

    Linking.getInitialURL()
      .then(acceptUrl)
      .catch(() => {});

    openSession()
      .then((result) => {
        if (result?.type === "success" && result.url) {
          acceptUrl(result.url);
          return;
        }
        // Give the deep-link a moment after Custom Tabs dismisses.
        setTimeout(() => {
          if (!settled) {
            finish(
              null,
              authError("Google sign-in was cancelled.", "auth/popup-closed-by-user")
            );
          }
        }, 1500);
      })
      .catch((err) => finish(null, err));
  });
}

async function signInWithWebBridge(clientId, bridgeUrl, hashedNonce) {
  await assertBridgeDeployed(bridgeUrl);
  const returnUrl = appReturnUrl();
  const authUrl = `${GOOGLE_AUTH_URL}?${toQuery({
    client_id: clientId,
    redirect_uri: bridgeUrl,
    response_type: "id_token",
    scope: "openid email profile",
    nonce: hashedNonce,
    state: JSON.stringify({ returnUrl }),
    prompt: "select_account",
  })}`;

  try {
    await WebBrowser.warmUpAsync();
  } catch {
    // Optional.
  }

  let redirectUrl;
  try {
    redirectUrl = await waitForAuthRedirect(returnUrl, () =>
      WebBrowser.openAuthSessionAsync(authUrl, returnUrl)
    );
  } finally {
    try {
      await WebBrowser.coolDownAsync();
    } catch {
      // Optional.
    }
  }

  const queryParams = parseAuthParams(redirectUrl);
  if (queryParams.error) {
    throw authError(`Google sign-in failed (${queryParams.error}).`);
  }
  const idToken = queryParams.id_token ? String(queryParams.id_token) : "";
  if (!idToken) throw authError("Google sign-in did not return an identity token.");
  verifyIdToken(idToken, clientId, hashedNonce);
  return idToken;
}

/** Native Google Sign-In (Android / Play Services) — avoids the browser bridge. */
async function signInWithNativeGoogle(webClientId) {
  const {
    GoogleSignin,
    isSuccessResponse,
    isCancelledResponse,
    isErrorWithCode,
    statusCodes,
  } = await import("@react-native-google-signin/google-signin");

  GoogleSignin.configure({
    webClientId,
    offlineAccess: false,
    forceCodeForRefreshToken: false,
  });

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();

    if (typeof isCancelledResponse === "function" && isCancelledResponse(response)) {
      throw authError("Google sign-in was cancelled.", "auth/popup-closed-by-user");
    }
    if (typeof isSuccessResponse === "function" && !isSuccessResponse(response)) {
      throw authError("Google sign-in was cancelled.", "auth/popup-closed-by-user");
    }

    const idToken =
      response?.data?.idToken ||
      response?.idToken ||
      (await GoogleSignin.getTokens().then((t) => t.idToken).catch(() => ""));

    if (!idToken) {
      throw authError("Google sign-in did not return an identity token.");
    }
    return idToken;
  } catch (err) {
    if (err?.code === "auth/popup-closed-by-user") throw err;
    if (isErrorWithCode?.(err)) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) {
        throw authError("Google sign-in was cancelled.", "auth/popup-closed-by-user");
      }
      if (err.code === statusCodes.IN_PROGRESS) {
        throw authError("Google sign-in is already in progress. Please wait.");
      }
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw authError("Google Play Services is required for Google sign-in on this device.");
      }
    }
    throw err;
  }
}

export async function promptGoogleSignIn() {
  const extra = Constants.expoConfig?.extra || {};
  const iosClientId = extra.googleIosClientId;
  const webClientId = extra.googleWebClientId;

  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  if (Platform.OS === "ios" && iosClientId) {
    const idToken = await signInWithIosClient(iosClientId, hashedNonce);
    return { idToken, rawNonce };
  }

  if (!webClientId) throw authError("Google sign-in is not configured.");

  // Android: prefer native Play Services sign-in (same Firebase web client as the site).
  if (Platform.OS === "android") {
    try {
      const idToken = await signInWithNativeGoogle(webClientId);
      // Native tokens are not nonce-bound; Firebase GoogleAuthProvider.credential(idToken) is enough.
      return { idToken, rawNonce: undefined };
    } catch (err) {
      const code = String(err?.code || "");
      const msg = String(err?.message || "");
      // Missing SHA-1 / Android OAuth client → fall back to the HTTPS bridge.
      const needsBridge =
        code === "10" ||
        code === "DEVELOPER_ERROR" ||
        /DEVELOPER_ERROR|ApiException:\s*10|not configured|developer error/i.test(msg);
      if (!needsBridge) throw err;
    }
  }

  const bridgeUrl = extra.googleAuthBridgeUrl || DEFAULT_BRIDGE_URL;
  const idToken = await signInWithWebBridge(webClientId, bridgeUrl, hashedNonce);
  return { idToken, rawNonce };
}
