import React, { createContext, useContext, useMemo, useCallback } from "react";

import { useLocalCollection } from "../storage/useLocalCollection";
import { useCompanyRemote } from "./CompanyContext";
import { api } from "../api/client";
import { findTransition } from "../features/mto/mtoStatus";

const STORAGE_KEY = "mto-estimator/estimates.v1";

const EstimatesContext = createContext(null);

function defaultAdjustments() {
  return [];
}

function defaultDiscount() {
  return { mode: "percent", value: 0 };
}

function defaultTax() {
  return { percent: 18, mode: "added" };
}

// Sample data drawn from the actual rows already filled in on the "Plumbing MTO" and
// "Electrical MTO" sheets of MTO_Template.xlsx, plus a couple of illustrative extras,
// so the app opens with something to look at instead of an empty shell. Rates below are
// snapshotted the same way a real Add Item flow would snapshot them from the rate catalog —
// see src/pricing/ratesCatalog.js for the defaults these were copied from.
function seedEstimates() {
  const now = Date.now();
  return [
    {
      id: "est-1",
      estimateNumber: "MTO-0001",
      name: "Block A — Site Office Complex",
      projectId: "local",
      client: "Aegis Builders",
      site: "Whitefield, Bengaluru",
      date: "09 Sep 2026",
      trades: ["Plumbing", "Electrical"],
      status: "DRAFT",
      notes:
        "Ground + 2 floor site office. Cold water + power reticulation only — exclude HVAC this phase.",
      adjustments: [{ id: "adj-1", label: "Transportation", mode: "fixed", value: 2500 }],
      discount: { mode: "percent", value: 2 },
      tax: defaultTax(),
      updatedAt: now,
      items: [
        {
          id: "item-1",
          trade: "Plumbing",
          family: "Pipe",
          item: "Pipe",
          material: "PVC",
          size: "40 mm",
          secondarySize: null,
          core: null,
          qty: 10,
          unit: "m",
          materialRate: 65,
          labourRate: 12,
          remarks: "",
        },
        {
          id: "item-2",
          trade: "Plumbing",
          family: "Pipe Fitting",
          item: "Reducer Bush",
          material: "UPVC",
          size: "50 mm",
          secondarySize: "40 mm",
          core: null,
          qty: 2,
          unit: "Nos",
          materialRate: 20,
          labourRate: 12,
          remarks: "",
        },
        {
          id: "item-3",
          trade: "Plumbing",
          family: "Pipe Fitting",
          item: "Union",
          material: "CPVC",
          size: "25 mm",
          secondarySize: null,
          core: null,
          qty: 8,
          unit: "Nos",
          materialRate: 52,
          labourRate: 18,
          remarks: "",
        },
        {
          id: "item-4",
          trade: "Electrical",
          family: "Power Cable",
          item: "Power Cable",
          material: "Copper",
          size: "2.5 sq.mm",
          secondarySize: null,
          core: "4C",
          qty: 15,
          unit: "m",
          materialRate: 42,
          labourRate: 8,
          remarks: "",
        },
      ],
    },
    {
      id: "est-2",
      estimateNumber: "MTO-0002",
      name: "Tower 3 — Riser Retrofit",
      projectId: "local",
      client: "Aegis Builders",
      site: "Whitefield, Bengaluru",
      date: "05 Sep 2026",
      trades: ["Plumbing"],
      status: "SUBMITTED",
      notes: "",
      adjustments: defaultAdjustments(),
      discount: defaultDiscount(),
      tax: defaultTax(),
      updatedAt: now - 86400000,
      items: [],
    },
    {
      id: "est-3",
      estimateNumber: "MTO-0003",
      name: "DG Yard — Cabling Revamp",
      projectId: "local",
      client: "Sundar Infra",
      site: "Peenya, Bengaluru",
      date: "03 Sep 2026",
      trades: ["Electrical"],
      status: "APPROVED",
      notes: "",
      adjustments: defaultAdjustments(),
      discount: defaultDiscount(),
      tax: defaultTax(),
      updatedAt: now - 2 * 86400000,
      items: [],
    },
  ];
}

export function EstimatesProvider({ children }) {
  const remote = useCompanyRemote("estimates");
  const { items: estimates, loaded, apply: setEstimates, syncError, clearSyncError, pending, online, reload } = useLocalCollection({
    localKey: STORAGE_KEY,
    seed: seedEstimates,
    remote,
  });

  const addEstimate = useCallback(
    (data) => {
      if (!data?.projectId) throw new Error("Pick a project for this MTO.");
      // Unique across devices: several engineers create MTOs in the same company.
      const id = "est-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
      const nextNumber = estimates.length + 1;
      const newEstimate = {
        id,
        // With a server this is a placeholder — the API assigns the real <project code>-MTO-nnnn
        // number, and uses it as the name when no title was typed.
        estimateNumber: remote ? `${data.projectCode ? data.projectCode + "-" : ""}MTO-····` : `MTO-${String(nextNumber).padStart(4, "0")}`,
        name: data.name || (remote ? `${data.projectCode ? data.projectCode + "-" : ""}MTO-····` : `MTO-${String(nextNumber).padStart(4, "0")}`),
        projectId: data.projectId,
        date: data.date || "",
        trades: data.trades || [],
        status: "DRAFT",
        notes: data.notes || "",
        adjustments: defaultAdjustments(),
        discount: defaultDiscount(),
        tax: defaultTax(),
        updatedAt: Date.now(),
        items: [],
      };
      setEstimates((prev) => [newEstimate, ...prev]);
      return id;
    },
    [estimates.length, remote]
  );

  const updateEstimate = useCallback((id, patch) => {
    setEstimates((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e))
    );
  }, []);

  // `item` must already carry a materialRate/labourRate snapshot (see src/pricing/RatesContext) —
  // the context never looks prices up itself, so a catalog rate change later can't silently
  // reprice an estimate that was already saved.
  const addItem = useCallback((estimateId, item) => {
    setEstimates((prev) =>
      prev.map((e) => {
        if (e.id !== estimateId) return e;
        const newItem = {
          id: "item-" + Date.now() + "-" + Math.round(Math.random() * 1e4),
          createdAt: Date.now(),
          ...item,
        };
        return { ...e, items: [...e.items, newItem], updatedAt: Date.now() };
      })
    );
  }, []);

  const updateItem = useCallback((estimateId, itemId, patch) => {
    setEstimates((prev) =>
      prev.map((e) => {
        if (e.id !== estimateId) return e;
        return {
          ...e,
          items: e.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
          updatedAt: Date.now(),
        };
      })
    );
  }, []);

  const duplicateItem = useCallback((estimateId, itemId) => {
    setEstimates((prev) =>
      prev.map((e) => {
        if (e.id !== estimateId) return e;
        const source = e.items.find((it) => it.id === itemId);
        if (!source) return e;
        const clone = { ...source, id: "item-" + Date.now() + "-" + Math.round(Math.random() * 1e4) };
        const index = e.items.findIndex((it) => it.id === itemId);
        const items = [...e.items.slice(0, index + 1), clone, ...e.items.slice(index + 1)];
        return { ...e, items, updatedAt: Date.now() };
      })
    );
  }, []);

  const removeItem = useCallback((estimateId, itemId) => {
    setEstimates((prev) =>
      prev.map((e) =>
        e.id === estimateId
          ? { ...e, items: e.items.filter((it) => it.id !== itemId), updatedAt: Date.now() }
          : e
      )
    );
  }, []);

  const deleteEstimate = useCallback((id) => {
    setEstimates((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // Copy of an estimate: new id, back to Draft, fresh line ids.
  const duplicateEstimate = useCallback(
    (id) => {
      const src = estimates.find((e) => e.id === id);
      if (!src) return null;
      const newId = "est-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
      const copy = {
        ...src,
        id: newId,
        name: `${src.name} (copy)`,
        status: "DRAFT",
        estimateNumber: remote ? "MTO-····" : `MTO-${String(estimates.length + 1).padStart(4, "0")}`,
        createdBy: undefined,
        updatedAt: Date.now(),
        items: (src.items || []).map((it, i) => ({ ...it, id: `item-${Date.now()}-${i}-${Math.round(Math.random() * 1e4)}` })),
      };
      setEstimates((prev) => [copy, ...prev]);
      return newId;
    },
    [estimates, remote]
  );

  const getEstimate = useCallback(
    (id) => estimates.find((e) => e.id === id),
    [estimates]
  );

  // Move an MTO to another status (Submit, Approve, Reject, …). With a server this is the
  // authority — POST /mtos/:id/transition re-checks role, ownership and comment requirements —
  // and we reload the canonical copy afterward rather than guessing at what changed. Without a
  // server (solo device) there's no approval loop to enforce, so we apply the same rule table
  // ourselves; see src/features/mto/mtoStatus.js.
  const transitionMto = useCallback(
    async (id, to, comment = "") => {
      if (!remote) {
        const est = estimates.find((e) => e.id === id);
        if (!est) throw new Error("MTO not found.");
        const rule = findTransition(est.status, to);
        if (!rule) throw new Error(`This MTO is "${est.status}" now — refresh and try again.`);
        if (rule.commentRequired && !comment.trim()) throw new Error("Add a comment first.");
        if (to === "SUBMITTED" && !(est.items || []).length) throw new Error("Add at least one item before submitting.");
        setEstimates((prev) => prev.map((e) => (e.id === id ? { ...e, status: to, updatedAt: Date.now() } : e)));
        return;
      }
      const r = await api("POST", `/mtos/${encodeURIComponent(id)}/transition`, { to, comment });
      await reload();
      return r.item;
    },
    [remote, estimates, reload]
  );

  // "Waiting for you" (by role) + "My MTOs" (mine, whatever their status) — the Inbox screen.
  const fetchInbox = useCallback(async () => {
    if (!remote) return { waiting: [], mine: estimates };
    return api("GET", "/mtos/inbox");
  }, [remote, estimates]);

  // The audit trail for one MTO (History tab). No server → no shared trail to show.
  const fetchHistory = useCallback(
    async (id) => {
      if (!remote) return [];
      return api("GET", `/mtos/${encodeURIComponent(id)}/history`);
    },
    [remote]
  );

  const value = useMemo(
    () => ({
      estimates,
      loaded,
      syncError,
      clearSyncError,
      pending,
      online,
      reload,
      addEstimate,
      updateEstimate,
      deleteEstimate,
      duplicateEstimate,
      addItem,
      updateItem,
      duplicateItem,
      removeItem,
      getEstimate,
      transitionMto,
      fetchInbox,
      fetchHistory,
    }),
    [estimates, loaded, syncError, clearSyncError, pending, online, reload, addEstimate, updateEstimate, deleteEstimate, duplicateEstimate, addItem, updateItem, duplicateItem, removeItem, getEstimate, transitionMto, fetchInbox, fetchHistory]
  );

  return <EstimatesContext.Provider value={value}>{children}</EstimatesContext.Provider>;
}

export function useEstimates() {
  const ctx = useContext(EstimatesContext);
  if (!ctx) throw new Error("useEstimates must be used inside EstimatesProvider");
  return ctx;
}
