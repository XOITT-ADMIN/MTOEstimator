import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";

import { useAuth } from "./AuthContext";

// App lock: after the one-time email code, the phone's own fingerprint / Face ID / screen PIN
// unlocks XMTO. It locks when the app starts and when it comes back after LOCK_AFTER_MS in the
// background. Nothing leaves the phone — the OS does the check.
const STORAGE_KEY = "xmto/app-lock.v1";
const LOCK_AFTER_MS = 2 * 60 * 1000;

const AppLockContext = createContext(null);

function describe(types) {
  const T = LocalAuthentication.AuthenticationType;
  if (types.includes(T.FACIAL_RECOGNITION)) return Platform.OS === "ios" ? "Face ID" : "face unlock";
  if (types.includes(T.FINGERPRINT)) return Platform.OS === "ios" ? "Touch ID" : "fingerprint";
  return "screen lock";
}

export function AppLockProvider({ children }) {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(false); // phone has biometrics or a screen PIN set
  const [method, setMethod] = useState("screen lock");
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState(null);
  const backgroundAt = useRef(null);
  const prompting = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS !== "web") {
          const level = await LocalAuthentication.getEnrolledLevelAsync();
          setAvailable(level > LocalAuthentication.SecurityLevel.NONE);
          setMethod(describe(await LocalAuthentication.supportedAuthenticationTypesAsync()));
        }
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const on = raw ? !!JSON.parse(raw).enabled : false;
        setEnabled(on);
        setLocked(on); // cold start → locked
      } catch (e) {
        // no lock support — app just opens
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Lock again after a while in the background.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        if (!prompting.current) backgroundAt.current = Date.now();
      } else if (state === "active") {
        if (enabled && backgroundAt.current && Date.now() - backgroundAt.current > LOCK_AFTER_MS) setLocked(true);
        backgroundAt.current = null;
      }
    });
    return () => sub.remove();
  }, [enabled]);

  const authenticate = useCallback(async (promptMessage) => {
    prompting.current = true;
    try {
      const r = await LocalAuthentication.authenticateAsync({
        promptMessage,
        fallbackLabel: "Use phone PIN",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });
      return r.success;
    } catch (e) {
      return false;
    } finally {
      prompting.current = false;
    }
  }, []);

  const unlock = useCallback(async () => {
    setError(null);
    const ok = await authenticate("Unlock XMTO");
    if (ok) setLocked(false);
    else setError("Not unlocked. Try again.");
    return ok;
  }, [authenticate]);

  // Turning it on asks for the fingerprint/PIN first, so nobody locks themselves out by mistake.
  const setAppLock = useCallback(
    async (on) => {
      setError(null);
      if (on) {
        if (!available) {
          setError("Set a fingerprint, face or screen PIN on this phone first.");
          return false;
        }
        if (!(await authenticate("Confirm to turn on app lock"))) return false;
      }
      setEnabled(on);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: on })).catch(() => {});
      return true;
    },
    [available, authenticate]
  );

  // Signing out clears the lock setting (the next person signs in fresh).
  useEffect(() => {
    if (loaded && !user && enabled) {
      setEnabled(false);
      setLocked(false);
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    }
  }, [user, loaded, enabled]);

  const value = useMemo(
    () => ({
      supported: Platform.OS !== "web",
      available,
      method,
      enabled,
      locked: loaded && enabled && locked && !!user,
      loaded,
      error,
      unlock,
      setAppLock,
    }),
    [available, method, enabled, locked, loaded, user, error, unlock, setAppLock]
  );

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock() {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error("useAppLock must be used inside AppLockProvider");
  return ctx;
}
