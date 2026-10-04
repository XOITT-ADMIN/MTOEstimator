import React, { createContext, useContext, useMemo, useCallback, useState } from "react";

import { useLocalCollection } from "../storage/useLocalCollection";
import { useCompany, useCompanyRemote } from "../context/CompanyContext";
import { useProjects } from "../context/ProjectsContext";
import { findItem } from "../data/catalog";
import { stockKey, buildStockCsv, parseStockCsv } from "./stockCsv";

const STORAGE_KEY = "mto-estimator/stock.v1";

const InventoryContext = createContext(null);

// Stock lines are keyed exactly like an estimate line — trade · item · material · size
// (· secondary size · core) — so a take-off line and a stock line always mean the same thing.
//
// Since the Sept 2026 rebuild, creating or editing an MTO never checks or reserves stock —
// that moved to Procurement, at issue time (see XMTO_BUILD_BRIEF.md section 6). So stock on
// hand is simply what's available; nothing here is drawn down until a later phase adds the
// issue/receive ledger.
function seedStock() {
  const mk = (e) => {
    const key = stockKey(e);
    return { ...e, unit: findItem(e.trade, e.item)?.unit || "Nos", key, id: key };
  };
  return [
    mk({ trade: "Plumbing", family: "Pipe", item: "Pipe", material: "PVC", size: "40 mm", secondarySize: null, core: null, stock: 500 }),
    mk({ trade: "Plumbing", family: "Pipe", item: "Pipe", material: "CPVC", size: "25 mm", secondarySize: null, core: null, stock: 300 }),
    mk({ trade: "Plumbing", family: "Pipe Fitting", item: "Reducer Bush", material: "UPVC", size: "50 mm", secondarySize: "40 mm", core: null, stock: 40 }),
    mk({ trade: "Plumbing", family: "Pipe Fitting", item: "Union", material: "CPVC", size: "25 mm", secondarySize: null, core: null, stock: 60 }),
    mk({ trade: "Plumbing", family: "Valve", item: "Ball Valve", material: "Brass", size: "25 mm", secondarySize: null, core: null, stock: 24 }),
    mk({ trade: "Electrical", family: "Power Cable", item: "Power Cable", material: "Copper", size: "2.5 sq.mm", secondarySize: null, core: "4C", stock: 1000 }),
    mk({ trade: "Electrical", family: "Cable Management", item: "Cable Tray", material: "GI", size: "100 mm", secondarySize: null, core: null, stock: 120 }),
  ];
}

export function InventoryProvider({ children }) {
  // Stock is kept per project: this is the stock of whichever project is in scope right now.
  const { scopeProjectId } = useProjects();
  const remote = useCompanyRemote("stock", { projectId: scopeProjectId });
  const { canManageLibrary } = useCompany();
  const { items: stock, loaded, apply: applyStock, syncError: collectionError, clearSyncError: clearCollectionError } = useLocalCollection({
    localKey: STORAGE_KEY,
    seed: seedStock,
    remote,
  });
  // In a shared workspace only owners/admins change stock (the server enforces it too).
  const [denied, setDenied] = useState(null);
  const readOnly = !!remote && !canManageLibrary;
  const setStock = useCallback(
    (fn) => {
      if (readOnly) {
        setDenied("Only an owner or admin can change stock.");
        return;
      }
      applyStock(fn);
    },
    [readOnly, applyStock]
  );
  const syncError = denied || collectionError;
  const clearSyncError = useCallback(() => {
    setDenied(null);
    clearCollectionError();
  }, [clearCollectionError]);

  // "Used" no longer means "drawn on by an estimate" — nothing reserves stock at MTO time
  // anymore. It stays 0 until a later phase adds the issue/receive ledger; available == on hand.
  const lines = useMemo(() => stock.map((s) => ({ ...s, used: 0, available: s.stock, usedIn: [] })), [stock]);

  const getAvailability = useCallback(
    (itemLike) => {
      const k = stockKey(itemLike);
      const s = stock.find((x) => x.key === k);
      if (!s) return null;
      return { key: k, stock: s.stock, used: 0, available: s.stock, unit: s.unit, price: Number(s.price) || 0 };
    },
    [stock]
  );

  // Availability for every stock line of an item (+ optional material) — used by the size step.
  const availabilityFor = useCallback(
    (trade, item, material) =>
      lines.filter((l) => l.trade === trade && l.item === item && (!material || l.material === material)),
    [lines]
  );

  const upsertLine = useCallback((entry) => {
    const key = stockKey(entry);
    const unit = findItem(entry.trade, entry.item)?.unit || entry.unit || "Nos";
    const family = findItem(entry.trade, entry.item)?.family || entry.family || "";
    setStock((prev) => {
      const next = { ...entry, key, id: key, unit, family, stock: Math.max(0, Number(entry.stock) || 0), price: Math.max(0, Number(entry.price) || 0) };
      const i = prev.findIndex((s) => s.key === key);
      if (i === -1) return [...prev, next];
      const copy = [...prev];
      copy[i] = { ...copy[i], ...next };
      return copy;
    });
    return key;
  }, [setStock]);

  const setLineStock = useCallback((key, qty) => {
    setStock((prev) => prev.map((s) => (s.key === key ? { ...s, stock: Math.max(0, Number(qty) || 0) } : s)));
  }, [setStock]);

  // Edit stock on hand and/or unit price of one line. Only the fields given are changed.
  const updateLine = useCallback((key, patch) => {
    const clean = (v) => Math.max(0, Math.round((Number(v) || 0) * 100) / 100);
    setStock((prev) =>
      prev.map((s) => {
        if (s.key !== key) return s;
        const next = { ...s };
        if (patch.stock != null) next.stock = clean(patch.stock);
        if (patch.price != null) next.price = clean(patch.price);
        return next;
      })
    );
  }, [setStock]);

  const removeLine = useCallback((key) => {
    setStock((prev) => prev.filter((s) => s.key !== key));
  }, [setStock]);

  // mode: "set" | "add" | "subtract" — applied to every key given (or every line when keys is null).
  const bulkUpdate = useCallback((keys, { mode, value }) => {
    const v = Number(value) || 0;
    const set = keys ? new Set(keys) : null;
    setStock((prev) =>
      prev.map((s) => {
        if (set && !set.has(s.key)) return s;
        const next = mode === "set" ? v : mode === "add" ? s.stock + v : s.stock - v;
        return { ...s, stock: Math.max(0, Math.round(next * 100) / 100) };
      })
    );
  }, [setStock]);

  const exportCsv = useCallback(() => buildStockCsv(stock), [stock]);

  // Validates the whole file first; only a fully valid file replaces the library.
  const importCsv = useCallback((text, { merge = false } = {}) => {
    const entries = parseStockCsv(text).map((e) => ({ ...e, id: e.key })); // throws StockCsvError
    setStock((prev) => {
      if (!merge) return entries;
      const map = new Map(prev.map((s) => [s.key, s]));
      entries.forEach((e) => map.set(e.key, { ...(map.get(e.key) || {}), ...e }));
      return Array.from(map.values());
    });
    return entries.length;
  }, [setStock]);

  const value = useMemo(
    () => ({
      loaded,
      syncError,
      clearSyncError,
      canEdit: !readOnly,
      lines,
      getAvailability,
      availabilityFor,
      upsertLine,
      setLineStock,
      updateLine,
      removeLine,
      bulkUpdate,
      exportCsv,
      importCsv,
    }),
    [loaded, syncError, clearSyncError, readOnly, lines, getAvailability, availabilityFor, upsertLine, setLineStock, updateLine, removeLine, bulkUpdate, exportCsv, importCsv]
  );

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error("useInventory must be used inside InventoryProvider");
  return ctx;
}
