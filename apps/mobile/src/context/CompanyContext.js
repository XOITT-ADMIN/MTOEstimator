import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAuth, normaliseEmail, isValidEmail } from "./AuthContext";
import { api, apiEnabled, events } from "../api/client";

const STORAGE_KEY = "mto-estimator/company-profile.v1";
const ME_CACHE_KEY = "mto-estimator/me.v1";

const DEFAULT_PROFILE = {
  name: "",
  address: "",
  phone: "",
  email: "",
  gstin: "",
  notificationEmail: "",
  termsAndConditions:
    "1. Rates are valid as stated above and subject to change thereafter.\n" +
    "2. Material to be verified on-site before installation.\n" +
    "3. Payment terms: 50% advance, balance on completion.\n" +
    "4. GST as applicable is extra unless shown as included above.",
};

// owner  — created the company, full control
// admin  — manages the library (rates, stock), the team, and approves estimates
// estimator — field engineer: makes their own estimates
// viewer — read-only
export const ROLES = ["owner", "admin", "estimator", "viewer"];

const CompanyContext = createContext(null);

// Company = the shared workspace.
//   · No server configured (expo.extra.apiUrl empty) → "local" mode: profile in AsyncStorage,
//     no team — exactly how the app worked before.
//   · Server configured → the signed-in person's company, team and invites come from the API.
//     status: "loading" → "none" (not in a company yet: CompanySetupScreen) → "member".
export function CompanyProvider({ children }) {
  const { user } = useAuth();
  const [localProfile, setLocalProfile] = useState(DEFAULT_PROFILE);
  const [localLoaded, setLocalLoaded] = useState(false);

  const [company, setCompany] = useState(null);
  const [role, setRole] = useState(null);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [status, setStatus] = useState(apiEnabled ? "loading" : "local");
  const [error, setError] = useState(null);
  const profileTimer = useRef(null);
  const pendingProfile = useRef({});

  // ── Local profile (no server) ────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setLocalProfile({ ...DEFAULT_PROFILE, ...JSON.parse(raw) });
      } catch (e) {
        // ignore
      } finally {
        setLocalLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!localLoaded || apiEnabled) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(localProfile)).catch(() => {});
  }, [localProfile, localLoaded]);

  // ── Server mode ──────────────────────────────────────────────────────────
  const applyMe = useCallback((me) => {
    if (me?.membership && me.company) {
      setCompany(me.company);
      setRole(me.membership.role);
      setStatus("member");
    } else {
      setCompany(null);
      setRole(null);
      setMembers([]);
      setInvites([]);
      setStatus("none");
    }
  }, []);

  const loadTeam = useCallback(async (asRole) => {
    try {
      const m = await api("GET", "/members");
      setMembers(m);
      if (asRole === "owner" || asRole === "admin") setInvites(await api("GET", "/invites"));
      else setInvites([]);
    } catch (e) {
      // offline — keep what we have
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!apiEnabled || !user) return;
    setError(null);
    try {
      const me = await api("GET", "/me");
      applyMe(me);
      AsyncStorage.setItem(ME_CACHE_KEY, JSON.stringify({ uid: user.uid, me })).catch(() => {});
      if (me.membership) loadTeam(me.membership.role);
    } catch (e) {
      if (e?.offline) {
        // Offline start: use the last known workspace so field work can carry on.
        try {
          const cached = JSON.parse((await AsyncStorage.getItem(ME_CACHE_KEY)) || "null");
          if (cached?.uid === user.uid) {
            applyMe(cached.me);
            return;
          }
        } catch (err) {
          // ignore
        }
      }
      setError(e?.message || "Could not load your workspace.");
      setStatus((s) => (s === "loading" ? "none" : s));
    }
  }, [user, applyMe, loadTeam]);

  useEffect(() => {
    if (!apiEnabled) return;
    if (!user) {
      setStatus("loading");
      setCompany(null);
      setRole(null);
      setMembers([]);
      setInvites([]);
      return;
    }
    setStatus("loading");
    refresh();
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live: someone changed the team or the company profile.
  useEffect(() => {
    if (!apiEnabled || status !== "member") return undefined;
    return events.subscribe((msg) => {
      if (msg.type === "online") refresh();
      if (msg.type === "changed" && (msg.resource === "members" || msg.resource === "company")) refresh();
    });
  }, [status, refresh]);

  const isManager = role === "owner" || role === "admin";

  const profile = useMemo(() => {
    if (apiEnabled) return { ...DEFAULT_PROFILE, ...(company?.profile || {}), name: company?.name || company?.profile?.name || "" };
    return localProfile;
  }, [company, localProfile]);

  const updateProfile = useCallback(
    (patch) => {
      if (!apiEnabled) {
        setLocalProfile((prev) => ({ ...prev, ...patch }));
        return;
      }
      if (!isManager) return;
      // Update the screen straight away, save to the server once typing pauses.
      setCompany((c) => (c ? { ...c, name: patch.name ?? c.name, profile: { ...c.profile, ...patch } } : c));
      pendingProfile.current = { ...pendingProfile.current, ...patch };
      clearTimeout(profileTimer.current);
      profileTimer.current = setTimeout(async () => {
        const body = pendingProfile.current;
        pendingProfile.current = {};
        try {
          const c = await api("PATCH", "/company", { profile: body });
          // Don't overwrite newer typing that is still waiting to be saved.
          if (!Object.keys(pendingProfile.current).length) setCompany(c);
        } catch (e) {
          setError(e?.message || "Could not save the company profile.");
        }
      }, 800);
    },
    [isManager]
  );

  const createCompany = useCallback(
    async (name) => {
      if (!apiEnabled) throw new Error("Team workspaces need a server. Set expo.extra.apiUrl in app.json.");
      await api("POST", "/companies", { name: String(name || "").trim() });
      await refresh();
    },
    [refresh]
  );

  const invite = useCallback(
    async ({ email, name, role: inviteRole }) => {
      const addr = normaliseEmail(email);
      if (!isValidEmail(addr)) throw new Error("Enter a valid email address.");
      if (!apiEnabled) throw new Error("Inviting staff needs a server. Set expo.extra.apiUrl in app.json.");
      const r = await api("POST", "/invites", { email: addr, name: String(name || "").trim(), role: inviteRole || "estimator" });
      await loadTeam(role);
      return r;
    },
    [loadTeam, role]
  );

  const revokeInvite = useCallback(
    async (email) => {
      await api("DELETE", `/invites/${encodeURIComponent(email)}`);
      await loadTeam(role);
    },
    [loadTeam, role]
  );

  const setMemberRole = useCallback(
    async (id, nextRole) => {
      await api("PATCH", `/members/${encodeURIComponent(id)}`, { role: nextRole });
      await loadTeam(role);
    },
    [loadTeam, role]
  );

  const removeMember = useCallback(
    async (id) => {
      await api("DELETE", `/members/${encodeURIComponent(id)}`);
      await loadTeam(role);
    },
    [loadTeam, role]
  );

  const recheckInvites = useCallback(() => {
    refresh();
  }, [refresh]);

  const effectiveRole = apiEnabled ? role : user ? "owner" : null;

  const value = useMemo(
    () => ({
      profile,
      loaded: apiEnabled ? status !== "loading" : localLoaded,
      updateProfile,
      status,
      error,
      serverMode: apiEnabled,
      companyId: company?.id || null,
      company,
      members,
      invites,
      role: effectiveRole,
      isOwner: effectiveRole === "owner",
      // What this person may do (the server enforces the same rules).
      canManageTeam: effectiveRole === "owner" || effectiveRole === "admin",
      canManageLibrary: effectiveRole === "owner" || effectiveRole === "admin",
      canEditEstimates: effectiveRole !== "viewer" && !!effectiveRole,
      createCompany,
      invite,
      revokeInvite,
      setMemberRole,
      removeMember,
      recheckInvites,
      refresh,
    }),
    [profile, localLoaded, updateProfile, status, error, company, members, invites, effectiveRole, createCompany, invite, revokeInvite, setMemberRole, removeMember, recheckInvites, refresh]
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used inside CompanyProvider");
  return ctx;
}

// For useLocalCollection: share this collection through the API while signed in to a company.
export function useCompanyRemote(resource) {
  const { serverMode, status, companyId } = useCompany();
  return useMemo(
    () => (serverMode && status === "member" && companyId ? { resource, companyId } : null),
    [serverMode, status, companyId, resource]
  );
}
