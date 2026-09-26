import React, { createContext, useContext, useMemo, useCallback, useState } from "react";

import { useEstimates } from "../context/EstimatesContext";
import { useLocalCollection } from "../storage/useLocalCollection";
import { useCompany, useCompanyRemote } from "../context/CompanyContext";
import { findItem } from "../data/catalog";
import { stockKey, buildStockCsv, parseStockCsv } from "./stockCsv";

const STORAGE_KEY = "mto-estimator/stock.v1";

// Estimates in these states no longer draw on stock.
const RELEASED_STATUSES = new Set(["Rejected"]);

const InventoryContext = createContext(null);

// Stock lines are keyed exactly like an estimate line — trade · item · material · size
// (· secondary size · core) — so a take-off line and a stock line always mean the same thing.
// "Used" is never stored: it is summed from the estimates every render, so adding, editing or
// removing a line anywhere in the app moves the available figure straight away.
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
  const { estimates } = useEstimates();
  const remote = useCompanyRemote("stock");
  const { canManageLibrary, company } = useCompany();
  // Company rule for estimates: "block" (default) refuses lines with no / not enough stock,
  // "warn" allows them and shows the shortage in red. The API applies the same rule.
  const stockPolicy = company?.stockPolicy === "warn" ? "warn" : "block";
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

  // key → { used, lines: [{ estimateId, estimateName, estimateNumber, qty }] }
  const usage = useMemo(() => {
    const map = new Map();
    estimates.forEach((e) => {
      if (RELEASED_STATUSES.has(e.status)) return;
      (e.items || []).forEach((it) => {
        const k = stockKey(it);
        const cur = map.get(k) || { used: 0, lines: [] };
        cur.used = Math.round((cur.used + (Number(it.qty) || 0)) * 100) / 100;
        cur.lines.push({ estimateId: e.id, estimateName: e.name, estimateNumber: e.estimateNumber, qty: it.qty });
        map.set(k, cur);
      });
    });
    return map;
  }, [estimates]);

  // With a server, `used` must include every engineer's estimates, not just the ones on this
  // phone. The server sends each line's usage (s.usedIn, per estimate); we take everyone else's
  // from there and our own from the local estimates, so our edits show up instantly and other
  // people's arrive live over the WebSocket.
  const usedFor = useCallback(
    (s) => {
      const mine = usage.get(s.key) || { used: 0, lines: [] };
      if (!remote || !Array.isArray(s.usedIn)) return mine;
      const localIds = new Set(estimates.map((e) => e.id));
      const others = s.usedIn.filter((u) => !localIds.has(u.estimateId));
      const otherQty = others.reduce((sum, u) => sum + (Number(u.qty) || 0), 0);
      return { used: Math.round((mine.used + otherQty) * 100) / 100, lines: [...mine.lines, ...others] };
    },
    [usage, remote, estimates]
  );

  const lines = useMemo(
    () =>
      stock.map((s) => {
        const u = usedFor(s);
        return { ...s, used: u.used, available: Math.round((s.stock - u.used) * 100) / 100, usedIn: u.lines };
      }),
    [stock, usedFor]
  );

  const getAvailability = useCallback(
    (itemLike) => {
      const k = stockKey(itemLike);
      const s = stock.find((x) => x.key === k);
      if (!s) return null;
      const used = usedFor(s).used;
      return { key: k, stock: s.stock, used, available: Math.round((s.stock - used) * 100) / 100, unit: s.unit, price: Number(s.price) || 0 };
    },
    [stock, usedFor]
  );

  // Availability for every stock line of an item (+ optional material) — used by the size step.
  const availabilityFor = useCallback(
    (trade, item, material) =>
      lines.filter((l) => l.trade === trade && l.item === item && (!material || l.material === material)),
    [lines]
  );

  // Check lines about to be added to an estimate without the Add item wizard (duplicate line,
  // duplicate estimate). Returns one plain message per problem; empty = all in stock.
  const checkNewLines = useCallback(
    (items) => {
      const fmt = (n) => String(Math.round(n * 100) / 100);
      const need = new Map();
      (items || []).forEach((it) => {
        const k = stockKey(it);
        const cur = need.get(k);
        need.set(k, { it, qty: (cur?.qty || 0) + (Number(it.qty) || 0) });
      });
      const problems = [];
      need.forEach(({ it, qty }) => {
        if (qty <= 0) return;
        const what = [it.item, it.material, it.size, it.secondarySize || it.core].filter(Boolean).join(" · ");
        const a = getAvailability(it);
        if (!a) problems.push(`${what} is not in stock.`);
        else if (a.available < qty) problems.push(a.available > 0 ? `Only ${fmt(a.available)} ${a.unit} of ${what} left — needs ${fmt(qty)}.` : `${what} is out of stock.`);
      });
      return problems;
    },
    [getAvailability]
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
      stockPolicy,
      checkNewLines,
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
    [loaded, syncError, clearSyncError, readOnly, stockPolicy, checkNewLines, lines, getAvailability, availabilityFor, upsertLine, setLineStock, updateLine, removeLine, bulkUpdate, exportCsv, importCsv]
  );

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error("useInventory must be used inside InventoryProvider");
  return ctx;
}
