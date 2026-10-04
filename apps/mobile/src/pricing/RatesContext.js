import React, { createContext, useContext, useMemo, useCallback, useState } from "react";

import { rateKey, getDefaultRate, listAllRates } from "./ratesCatalog";
import { useLocalCollection } from "../storage/useLocalCollection";
import { useCompany, useCompanyRemote } from "../context/CompanyContext";
import { useProjects } from "../context/ProjectsContext";

const STORAGE_KEY = "mto-estimator/rate-overrides.v1";

const RatesContext = createContext(null);

export function RatesProvider({ children }) {
  // Stored as rows { id: rateKey, materialRate, labourRate }.
  // Rates are kept per project: these are the rates of whichever project is in scope right now.
  const { scopeProjectId } = useProjects();
  const remote = useCompanyRemote("rates", { projectId: scopeProjectId });
  const { canManageLibrary } = useCompany();
  const { items: rows, loaded, apply: applyRows, syncError: collectionError, clearSyncError: clearCollectionError } = useLocalCollection({
    localKey: STORAGE_KEY + ".rows",
    remote,
  });
  // In a shared workspace the rate library is the company's: only owners/admins change it.
  const [denied, setDenied] = useState(null);
  const readOnly = !!remote && !canManageLibrary;
  const apply = useCallback(
    (fn) => {
      if (readOnly) {
        setDenied("Only an owner or admin can change the rate library.");
        return;
      }
      applyRows(fn);
    },
    [readOnly, applyRows]
  );
  const syncError = denied || collectionError;
  const clearSyncError = useCallback(() => {
    setDenied(null);
    clearCollectionError();
  }, [clearCollectionError]);
  const overrides = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.id, { materialRate: r.materialRate, labourRate: r.labourRate }])),
    [rows]
  );

  // Returns the rate an estimator would see *right now* for this catalog combo — an override if
  // one has been saved to the rate library, otherwise the seeded catalog default. This is only
  // ever used to pre-fill a new estimate line; once added, the line keeps its own snapshot.
  const getRate = useCallback(
    (trade, family, item, material) => {
      const k = rateKey(trade, family, item, material);
      if (overrides[k]) return { ...overrides[k], source: "custom" };
      return getDefaultRate(trade, family, item, material);
    },
    [overrides]
  );

  const setRate = useCallback((trade, family, item, material, rate) => {
    const k = rateKey(trade, family, item, material);
    apply((prev) => [
      ...prev.filter((r) => r.id !== k),
      { id: k, materialRate: Number(rate.materialRate) || 0, labourRate: Number(rate.labourRate) || 0 },
    ]);
  }, [apply]);

  const resetRate = useCallback((trade, family, item, material) => {
    const k = rateKey(trade, family, item, material);
    apply((prev) => prev.filter((r) => r.id !== k));
  }, [apply]);

  // Rate Library listing: every default catalog rate, plus any custom rate for a combo the
  // catalog didn't seed a price for, each flagged with whether it has been edited from default.
  const allRates = useMemo(() => {
    const base = listAllRates();
    const baseKeys = new Set(base.map((r) => r.key));
    const custom = Object.entries(overrides)
      .filter(([k]) => !baseKeys.has(k))
      .map(([k, rate]) => {
        const [trade, family, item, material] = k.split("::");
        return { key: k, trade, family, item, material: material || null, ...rate };
      });
    return [...base, ...custom]
      .map((r) => {
        const override = overrides[r.key];
        return override
          ? { ...r, materialRate: override.materialRate, labourRate: override.labourRate, isCustom: true }
          : { ...r, isCustom: false };
      })
      .sort((a, b) => a.trade.localeCompare(b.trade) || a.family.localeCompare(b.family) || a.item.localeCompare(b.item));
  }, [overrides]);

  const value = useMemo(
    () => ({ loaded, syncError, clearSyncError, canEdit: !readOnly, getRate, setRate, resetRate, allRates }),
    [loaded, syncError, clearSyncError, readOnly, getRate, setRate, resetRate, allRates]
  );

  return <RatesContext.Provider value={value}>{children}</RatesContext.Provider>;
}

export function useRates() {
  const ctx = useContext(RatesContext);
  if (!ctx) throw new Error("useRates must be used inside RatesProvider");
  return ctx;
}
