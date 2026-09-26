// Tiny client for the XMTO API (apps/api).
//
// Set `expo.extra.apiUrl` in app.json (e.g. "https://xmto-api.onrender.com") to turn the shared
// workspace on. Leave it empty and the app runs exactly as before: one device, AsyncStorage only.
//
// Sign-in tokens
//   · access token  — short-lived (≈1 h), sent with every request
//   · refresh token — long-lived, swapped for a new pair automatically when the access token
//                     runs out, so the user signs in with an email code once per phone.
//   Both live in the phone's secure keychain (expo-secure-store); the web build, which has no
//   keychain, falls back to AsyncStorage.
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const manifest = Constants.expoConfig || Constants.manifest || Constants.manifest2 || {};
export const API_URL = String(manifest?.extra?.apiUrl || "").trim().replace(/\/+$/, "");
export const apiEnabled = !!API_URL;

const ACCESS_KEY = "xmto.access";
const REFRESH_KEY = "xmto.refresh";
const LEGACY_TOKEN_KEY = "mto-estimator/api-token.v1"; // 30-day token from the first version
const REQUEST_TIMEOUT_MS = 20000;
const useKeychain = Platform.OS !== "web";

let access = null;
let refresh = null;
let refreshing = null; // one refresh at a time for the whole app
const unauthorizedListeners = new Set();

const store = {
  get: (k) => (useKeychain ? SecureStore.getItemAsync(k) : AsyncStorage.getItem(k)),
  set: (k, v) => (useKeychain ? SecureStore.setItemAsync(k, v) : AsyncStorage.setItem(k, v)),
  del: (k) => (useKeychain ? SecureStore.deleteItemAsync(k) : AsyncStorage.removeItem(k)),
};

// Loads saved tokens; returns true when this phone is still signed in.
export async function loadTokens() {
  try {
    [access, refresh] = await Promise.all([store.get(ACCESS_KEY), store.get(REFRESH_KEY)]);
    AsyncStorage.removeItem(LEGACY_TOKEN_KEY).catch(() => {});
  } catch (e) {
    access = refresh = null;
  }
  return !!refresh;
}

export async function setTokens(next) {
  const wasSignedIn = !!refresh;
  access = next?.accessToken || null;
  refresh = next?.refreshToken || null;
  try {
    if (access) await store.set(ACCESS_KEY, access);
    else await store.del(ACCESS_KEY);
    if (refresh) await store.set(REFRESH_KEY, refresh);
    else await store.del(REFRESH_KEY);
  } catch (e) {
    // keychain unavailable — tokens stay in memory for this run
  }
  // Only sign-in / sign-out changes the live connection; a routine token refresh doesn't (the
  // socket was authorised when it opened and stays valid).
  if (wasSignedIn !== !!refresh) events.restart();
}

export const clearTokens = () => setTokens(null);
export const hasSession = () => !!refresh;

// What the server shows in "Devices signed in".
export function deviceInfo() {
  const name = Constants.deviceName || (Platform.OS === "web" ? "Web browser" : Platform.OS === "ios" ? "iPhone" : "Android phone");
  return { name: String(name).slice(0, 80), platform: Platform.OS };
}

// Called when the server says this device is signed out (AuthContext then shows the login).
export function onUnauthorized(fn) {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

export class ApiError extends Error {
  constructor(status, message, code = "error", details) {
    super(message);
    this.status = status; // 0 = couldn't reach the server
    this.code = code;
    this.details = details;
  }
  get offline() {
    return this.status === 0;
  }
}

// True when the access token is missing or in the last quarter of its life (reads the JWT's
// iat/exp claims; the server does the real verification).
function accessNeedsRefresh() {
  if (!access) return true;
  try {
    const part = access.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { iat, exp } = JSON.parse(globalThis.atob(part + "===".slice((part.length + 3) % 4)));
    const left = exp - Date.now() / 1000;
    return left < Math.min(60, (exp - iat) / 4);
  } catch (e) {
    return false; // can't read it — just send it and let the server decide
  }
}

async function rawFetch(method, path, body, withAuth) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(withAuth && access ? { Authorization: `Bearer ${access}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    });
  } catch (e) {
    throw new ApiError(0, "Can't reach the server. Check your connection.", "offline");
  } finally {
    if (timer) clearTimeout(timer);
  }
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    json = null;
  }
  if (!res.ok) throw new ApiError(res.status, json?.error || `Server error (${res.status}).`, json?.code, json?.details);
  return json;
}

function signedOut() {
  access = refresh = null;
  Promise.all([store.del(ACCESS_KEY), store.del(REFRESH_KEY)]).catch(() => {});
  unauthorizedListeners.forEach((fn) => fn());
}

// Swap the refresh token for a new pair. Offline → keep the old tokens and try later.
export function refreshTokens() {
  if (!refresh) return Promise.resolve(false);
  if (!refreshing) {
    refreshing = rawFetch("POST", "/auth/refresh", { refreshToken: refresh }, false)
      .then(async (r) => {
        await setTokens(r);
        return true;
      })
      .catch((e) => {
        if (e.status === 401) signedOut();
        if (e.offline) return false;
        return false;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

export async function api(method, path, body) {
  if (!apiEnabled) throw new ApiError(0, "No server is configured.", "no_server");
  const isAuthCall = path.startsWith("/auth/otp") || path === "/auth/refresh";
  if (!isAuthCall && refresh && accessNeedsRefresh()) await refreshTokens();
  try {
    return await rawFetch(method, path, body, !isAuthCall);
  } catch (e) {
    if (e.status !== 401 || isAuthCall || !refresh) {
      if (e.status === 401 && !isAuthCall && !refresh && access) signedOut();
      throw e;
    }
    // Access token rejected: refresh once and retry. A revoked device can't refresh → signed out.
    if (e.code === "session_revoked") {
      signedOut();
      throw e;
    }
    const ok = await refreshTokens();
    if (!ok) throw e;
    return rawFetch(method, path, body, true);
  }
}

// ── Live updates ─────────────────────────────────────────────────────────────
// One WebSocket per app, shared by every screen. The server only says "<resource> changed";
// listeners refetch. Reconnects with back-off; "hello" is re-sent after every reconnect, which
// collections use to flush queued offline changes and catch up.
export const events = (() => {
  const listeners = new Set();
  let socket = null;
  let retry = 0;
  let timer = null;
  let connected = false;

  function emit(msg) {
    listeners.forEach((fn) => {
      try {
        fn(msg);
      } catch (e) {
        // ignore listener errors
      }
    });
  }

  async function open() {
    clearTimeout(timer);
    if (!apiEnabled || !refresh || !listeners.size || socket) return;
    if (accessNeedsRefresh()) await refreshTokens();
    if (!access || socket) return;
    const url = API_URL.replace(/^http/, "ws") + "/ws?token=" + encodeURIComponent(access);
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      schedule();
      return;
    }
    socket = ws;
    ws.onmessage = (e) => {
      let msg = null;
      try {
        msg = JSON.parse(e.data);
      } catch (err) {
        return;
      }
      if (msg?.type === "hello") {
        retry = 0;
        connected = true;
        emit({ type: "online" });
      } else if (msg?.type === "changed") {
        emit(msg);
      }
    };
    ws.onclose = () => {
      if (socket === ws) socket = null;
      if (connected) emit({ type: "offline" });
      connected = false;
      schedule();
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch (e) {
        // ignore
      }
    };
  }

  function schedule() {
    clearTimeout(timer);
    if (!listeners.size || !refresh) return;
    retry = Math.min(retry + 1, 6);
    timer = setTimeout(open, Math.min(30000, 1000 * 2 ** retry));
  }

  function close() {
    clearTimeout(timer);
    const ws = socket;
    socket = null;
    connected = false;
    if (ws) {
      ws.onclose = null;
      try {
        ws.close();
      } catch (e) {
        // ignore
      }
    }
  }

  return {
    subscribe(fn) {
      listeners.add(fn);
      open();
      return () => {
        listeners.delete(fn);
        if (!listeners.size) close();
      };
    },
    restart() {
      close();
      retry = 0;
      open();
    },
    get connected() {
      return connected;
    },
  };
})();
