import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { normalizeCatalog, validateCatalog, findBrokenStock, CatalogError } from "@mto/shared/catalogTools";
import { DEFAULT_CATALOG, setActiveCatalog } from "../data/catalog";
import { useCompany } from "../context/CompanyContext";
import { api, apiEnabled, events } from "../api/client";

const CACHE_PREFIX = "mto-estimator/catalog.v1.";

const CatalogContext = createContext(null);

// The company's item library (families, items, materials, sizes, cores).
//   · With a server: loaded from /library/catalog, cached on the phone for offline use, and
//     reloaded live when another admin changes it. Saving needs a connection (the server checks
//     the change against everyone's stock before accepting it).
//   · Without a server: kept on this phone only.
// Every save is a whole new version; the server keeps the old ones as history.
export function CatalogProvider({ children }) {
  const { serverMode, status, companyId, canManageLibrary } = useCompany();
  const remote = !!(apiEnabled && serverMode && status === "member" && companyId);
  const cacheKey = CACHE_PREFIX + (remote ? companyId : "local");

  const [state, setState] = useState(() => ({ version: 0, publishedAt: null, data: normalizeCatalog(DEFAULT_CATALOG) }));
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const stateRef = useRef(state);

  const adopt = useCallback(
    (next, { cache = true } = {}) => {
      const s = { version: Number(next?.version) || 0, publishedAt: next?.publishedAt || null, data: normalizeCatalog(next?.data || DEFAULT_CATALOG) };
      setActiveCatalog(s.data); // before the re-render, so every helper already sees the new list
      stateRef.current = s;
      setState(s);
      if (cache) AsyncStorage.setItem(cacheKey, JSON.stringify(s)).catch(() => {});
    },
    [cacheKey]
  );

  const pull = useCallback(async () => {
    if (!remote) return;
    try {
      const r = await api("GET", "/library/catalog");
      if (r.version !== stateRef.current.version || !stateRef.current.publishedAt) adopt(r);
    } catch (e) {
      // offline — keep the cached copy
    }
  }, [remote, adopt]);

  // Start from this phone's copy straight away, then catch up with the server.
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (!cancelled) adopt(raw ? JSON.parse(raw) : { version: 0, data: DEFAULT_CATALOG }, { cache: false });
      } catch (e) {
        if (!cancelled) adopt({ version: 0, data: DEFAULT_CATALOG }, { cache: false });
      }
      if (!cancelled) setLoaded(true);
      if (!cancelled) pull();
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!remote) return undefined;
    return events.subscribe((msg) => {
      if (msg.type === "online") pull();
      if (msg.type === "changed" && msg.resource === "catalog") pull();
    });
  }, [remote, pull]);

  const canEdit = !!canManageLibrary;

  // Save a new version. `change` is the next catalog or a function (current) => next.
  // `stock` (the stock lines) lets us refuse, before going to the server, a change that would
  // remove something stock still uses.
  const save = useCallback(
    async (change, { note = "", stock = [] } = {}) => {
      if (!canEdit) throw new CatalogError("Only an owner or admin can change the library.");
      const current = stateRef.current;
      const data = normalizeCatalog(typeof change === "function" ? change(current.data) : change);
      const problems = validateCatalog(data);
      if (problems.length) throw new CatalogError(problems[0], problems);
      const broken = findBrokenStock(data, stock);
      if (broken.length) {
        throw new CatalogError(
          `This change removes something your stock still uses. Remove or change those stock lines first.\n\n${broken.slice(0, 5).join("\n")}${broken.length > 5 ? `\n…and ${broken.length - 5} more` : ""}`,
          broken
        );
      }
      if (!remote) {
        adopt({ version: current.version + 1, publishedAt: Date.now(), data });
        return data;
      }
      setSaving(true);
      try {
        const r = await api("POST", "/library/catalog", { data, note: String(note).slice(0, 500), baseVersion: current.version });
        adopt({ version: r.version, publishedAt: r.publishedAt, data });
        return data;
      } catch (e) {
        if (e?.code === "catalog_changed") await pull();
        if (e?.offline) throw new CatalogError("You're offline. Changes to the library need a connection — try again when you're back online.");
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [canEdit, remote, adopt, pull]
  );

  const value = useMemo(
    () => ({ catalog: state.data, version: state.version, publishedAt: state.publishedAt, loaded, saving, canEdit, save, reload: pull }),
    [state, loaded, saving, canEdit, save, pull]
  );
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used inside CatalogProvider");
  return ctx;
}
