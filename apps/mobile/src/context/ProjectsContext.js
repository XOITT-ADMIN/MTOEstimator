import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";

import { api, apiEnabled, events } from "../api/client";
import { useCompany } from "./CompanyContext";

const ProjectsContext = createContext(null);

// No server configured → one implicit local project, exactly like the app's old single-device
// mode had one implicit "company". Nothing to pick, nothing to create.
const LOCAL_PROJECT = { id: "local", name: "My project", siteName: "", status: "open" };

// Projects: the sites/jobs MTOs are raised against (see XMTO_BUILD_BRIEF.md section 4).
export function ProjectsProvider({ children }) {
  const { status: companyStatus, refresh: refreshCompany } = useCompany();
  const [projects, setProjects] = useState(apiEnabled ? [] : [LOCAL_PROJECT]);
  const [loaded, setLoaded] = useState(!apiEnabled);
  const [error, setError] = useState(null);
  // Stock and rates are kept per project: this is the one they're showing right now. Set by the
  // Library's project picker and by any screen that works on one MTO (see useProjectScope).
  const [pickedId, setPickedId] = useState(null);

  const refresh = useCallback(async () => {
    if (!apiEnabled || companyStatus !== "member") return;
    try {
      const rows = await api("GET", "/projects");
      setProjects(rows);
      setLoaded(true);
      setError(null);
    } catch (e) {
      if (!e?.offline) setError(e?.message || "Could not load projects.");
    }
  }, [companyStatus]);

  useEffect(() => {
    if (!apiEnabled) return;
    if (companyStatus !== "member") {
      setProjects([]);
      setLoaded(false);
      return;
    }
    refresh();
  }, [companyStatus, refresh]);

  useEffect(() => {
    if (!apiEnabled || companyStatus !== "member") return undefined;
    return events.subscribe((msg) => {
      if (msg.type === "online") refresh();
      if (msg.type === "changed" && msg.resource === "projects") refresh();
    });
  }, [companyStatus, refresh]);

  const create = useCallback(
    async ({ name, code, siteName }) => {
      if (!apiEnabled) throw new Error("Projects need a shared workspace.");
      const p = await api("POST", "/projects", { name: String(name || "").trim(), code: String(code || "").trim(), siteName: String(siteName || "").trim() });
      await refresh();
      return p;
    },
    [refresh]
  );

  const rename = useCallback(
    async (id, patch) => {
      await api("PATCH", `/projects/${encodeURIComponent(id)}`, patch);
      await refresh();
    },
    [refresh]
  );

  const closeProject = useCallback(
    async (id) => {
      const result = await api("POST", `/projects/${encodeURIComponent(id)}/close`);
      await refresh();
      return result;
    },
    [refresh]
  );

  const getSiteBalance = useCallback(
    async (id) => {
      return api("GET", `/projects/${encodeURIComponent(id)}/site-balance`);
    },
    []
  );

  const addConsumption = useCallback(
    async (id, { date, entries }) => {
      const result = await api("POST", `/projects/${encodeURIComponent(id)}/consumption`, { date, entries });
      return result;
    },
    []
  );

  // What a project returned when its MTOs / the project closed.
  const getReturns = useCallback(async (id) => api("GET", `/projects/${encodeURIComponent(id)}/returns`), []);

  const getConsumption = useCallback(
    async (id, { from, to } = {}) => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      const suffix = qs ? "?" + qs : "";
      return api("GET", `/projects/${encodeURIComponent(id)}/consumption${suffix}`);
    },
    []
  );

  // Set a person's roles on one project (no roles = take them off it). Refreshes the team so the
  // member list and everyone's own project roles stay current.
  const setProjectMemberRoles = useCallback(
    async (projectId, userId, roles) => {
      await api("PUT", `/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`, { roles });
      await refreshCompany();
    },
    [refreshCompany]
  );

  const openProjects = useMemo(() => projects.filter((p) => p.status === "open"), [projects]);
  const getProject = useCallback((id) => projects.find((p) => p.id === id) || null, [projects]);

  // The picked project if it still exists, else the first open one. Local mode has just the one.
  const scopeProjectId = useMemo(() => {
    if (!apiEnabled) return LOCAL_PROJECT.id;
    if (pickedId && projects.some((p) => p.id === pickedId)) return pickedId;
    return openProjects[0]?.id || projects[0]?.id || null;
  }, [pickedId, projects, openProjects]);

  const value = useMemo(
    () => ({ projects, openProjects, loaded, error, refresh, create, rename, getProject, closeProject, setProjectMemberRoles, getSiteBalance, addConsumption, getConsumption, getReturns, scopeProjectId, setScopeProjectId: setPickedId }),
    [projects, openProjects, loaded, error, refresh, create, rename, getProject, closeProject, setProjectMemberRoles, getSiteBalance, addConsumption, getConsumption, getReturns, scopeProjectId]
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used inside ProjectsProvider");
  return ctx;
}

// Which project's stock and rates are in play. Pass a projectId to pin it for as long as the
// calling screen is mounted (e.g. an MTO screen pins its own project), or call with nothing to
// just read/change it (the Library's picker).
export function useProjectScope(pinTo) {
  const { scopeProjectId, setScopeProjectId } = useProjects();
  useEffect(() => {
    if (pinTo) setScopeProjectId(pinTo);
  }, [pinTo, setScopeProjectId]);
  return { projectId: pinTo || scopeProjectId, setProjectId: setScopeProjectId };
}
