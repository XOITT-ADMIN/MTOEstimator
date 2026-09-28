import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";

import { api, apiEnabled, events } from "../api/client";
import { useCompany } from "./CompanyContext";

const ProjectsContext = createContext(null);

// No server configured → one implicit local project, exactly like the app's old single-device
// mode had one implicit "company". Nothing to pick, nothing to create.
const LOCAL_PROJECT = { id: "local", name: "My project", siteName: "", status: "open" };

// Projects: the sites/jobs MTOs are raised against (see XMTO_BUILD_BRIEF.md section 4).
export function ProjectsProvider({ children }) {
  const { status: companyStatus } = useCompany();
  const [projects, setProjects] = useState(apiEnabled ? [] : [LOCAL_PROJECT]);
  const [loaded, setLoaded] = useState(!apiEnabled);
  const [error, setError] = useState(null);

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
    async ({ name, siteName }) => {
      if (!apiEnabled) throw new Error("Projects need a shared workspace.");
      const p = await api("POST", "/projects", { name: String(name || "").trim(), siteName: String(siteName || "").trim() });
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

  const openProjects = useMemo(() => projects.filter((p) => p.status === "open"), [projects]);
  const getProject = useCallback((id) => projects.find((p) => p.id === id) || null, [projects]);

  const value = useMemo(
    () => ({ projects, openProjects, loaded, error, refresh, create, rename, getProject }),
    [projects, openProjects, loaded, error, refresh, create, rename, getProject]
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used inside ProjectsProvider");
  return ctx;
}
