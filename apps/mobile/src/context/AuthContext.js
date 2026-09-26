import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { api, apiEnabled, loadTokens, setTokens, clearTokens, deviceInfo, onUnauthorized } from "../api/client";

const STORAGE_KEY = "mto-estimator/user.v1";
const LAST_EMAIL_KEY = "mto-estimator/last-email.v1";
const LAST_NAME_KEY = "mto-estimator/last-name.v1";

// ── Email / OTP ──────────────────────────────────────────────────────────────
export const OTP_LENGTH = 6;
export const OTP_RESEND_SECONDS = 30;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

export function normaliseEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normaliseEmail(value));
}

// ── Email OTP transport ──────────────────────────────────────────────────────
// With a server (expo.extra.apiUrl set) the API emails the code and checks it. The API only
// returns `demoCode` while it runs in demo mode (no SMTP configured yet).
// Without a server the code is generated on this device and shown in a DEMO note, as before.
async function sendEmailOtp(email, name) {
  if (apiEnabled) {
    const r = await api("POST", "/auth/otp/request", { email, name });
    return { code: null, demoCode: r.demoCode || null, expiresAt: r.expiresAt || Date.now() + OTP_TTL_MS };
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  return { code, demoCode: code, expiresAt: Date.now() + OTP_TTL_MS };
}

function checkEmailOtp(session, code) {
  return Date.now() < session.expiresAt && session.code === code ? {} : null;
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState(null);
  const [lastEmail, setLastEmail] = useState("");
  const [lastName, setLastName] = useState("");
  const [otp, setOtp] = useState(null);
  const otpSession = useRef(null);
  const attempts = useRef(0);

  // Session restore — everything lives on-device.
  useEffect(() => {
    (async () => {
      try {
        const [email, name, raw, savedToken] = await Promise.all([
          AsyncStorage.getItem(LAST_EMAIL_KEY),
          AsyncStorage.getItem(LAST_NAME_KEY),
          AsyncStorage.getItem(STORAGE_KEY),
          loadTokens(),
        ]);
        if (email) setLastEmail(email);
        if (name) setLastName(name);
        // With a server, a saved user is only signed in while this phone still holds its
        // refresh token (kept in the secure keychain).
        if (raw && (!apiEnabled || savedToken)) setUser(JSON.parse(raw));
      } catch (e) {
        // ignore
      } finally {
        setInitializing(false);
      }
    })();
  }, []);

  const remember = useCallback(async (nextUser) => {
    if (nextUser?.email) {
      setLastEmail(nextUser.email);
      setLastName(nextUser.name || "");
      await AsyncStorage.multiSet([
        [LAST_EMAIL_KEY, nextUser.email],
        [LAST_NAME_KEY, nextUser.name || ""],
      ]);
    }
  }, []);

  const persistLocalUser = useCallback(
    async (nextUser) => {
      setUser(nextUser);
      setError(null);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
      await remember(nextUser);
    },
    [remember]
  );

  // ── Email + OTP ──────────────────────────────────────────────────────────
  const requestOtp = useCallback(async (emailInput, nameInput) => {
    setError(null);
    const email = normaliseEmail(emailInput);
    const name = String(nameInput || "").trim();
    if (!name) {
      setError("Enter your name.");
      return false;
    }
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return false;
    }
    setSigningIn(true);
    try {
      const session = await sendEmailOtp(email, name);
      otpSession.current = { email, name, ...session };
      attempts.current = 0;
      setOtp({ email, name, demoCode: session.demoCode || null, expiresAt: session.expiresAt, sentAt: Date.now() });
      return true;
    } catch (e) {
      setError(e?.message || "Could not send the code. Try again.");
      return false;
    } finally {
      setSigningIn(false);
    }
  }, []);

  const verifyOtp = useCallback(
    async (codeInput) => {
      setError(null);
      const code = String(codeInput || "").replace(/\D/g, "");
      const session = otpSession.current;
      if (!session) {
        setError("Request a code first.");
        return false;
      }
      if (code.length !== OTP_LENGTH) {
        setError(`Enter the ${OTP_LENGTH}-digit code.`);
        return false;
      }
      if (Date.now() > session.expiresAt) {
        setError("That code has expired. Send a new one.");
        return false;
      }
      setSigningIn(true);
      if (apiEnabled) {
        try {
          const r = await api("POST", "/auth/otp/verify", { email: session.email, code, name: session.name, device: deviceInfo() });
          otpSession.current = null;
          setOtp(null);
          await setTokens(r);
          await persistLocalUser(r.user);
          return true;
        } catch (e) {
          if (/Too many|expired|Request a code/.test(e?.message || "")) {
            otpSession.current = null;
            setOtp(null);
          }
          setError(e?.message || "Could not verify the code.");
          return false;
        } finally {
          setSigningIn(false);
        }
      }
      try {
        const result = checkEmailOtp(session, code);
        if (!result) {
          attempts.current += 1;
          if (attempts.current >= OTP_MAX_ATTEMPTS) {
            otpSession.current = null;
            setOtp(null);
            setError("Too many wrong attempts. Send a new code.");
          } else {
            setError("That code doesn't match. Check the email and try again.");
          }
          return false;
        }
        otpSession.current = null;
        setOtp(null);
        await persistLocalUser({
          id: `email:${session.email}`,
          uid: `email:${session.email}`,
          name: session.name,
          email: session.email,
          photo: null,
          provider: "email",
        });
        return true;
      } catch (e) {
        setError(e?.message || "Could not verify the code.");
        return false;
      } finally {
        setSigningIn(false);
      }
    },
    [persistLocalUser]
  );

  const cancelOtp = useCallback(() => {
    otpSession.current = null;
    setOtp(null);
    setError(null);
  }, []);

  // Local sign-out: forget the user and the tokens on this phone.
  const forget = useCallback(async () => {
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
    if (apiEnabled) await clearTokens();
  }, []);

  // Sign out: tell the server to end this device's session too (best effort when offline).
  const signOut = useCallback(async () => {
    if (apiEnabled) {
      try {
        await api("POST", "/auth/logout");
      } catch (e) {
        // offline or already signed out — the tokens are removed from the phone anyway
      }
    }
    await forget();
  }, [forget]);

  // The server says this device is signed out (signed out elsewhere / idle too long).
  useEffect(() => onUnauthorized(() => forget()), [forget]);

  const value = useMemo(
    () => ({
      user,
      initializing,
      signingIn,
      error,
      serverMode: apiEnabled,
      lastEmail,
      lastName,
      otp,
      requestOtp,
      verifyOtp,
      cancelOtp,
      signOut,
    }),
    [user, initializing, signingIn, error, lastEmail, lastName, otp, requestOtp, verifyOtp, cancelOtp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
