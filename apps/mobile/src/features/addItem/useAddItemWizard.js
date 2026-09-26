import { useMemo, useState, useEffect, useCallback } from "react";

import { tradeCatalog, tradeItems, findItem, unitFor } from "../../data/catalog";
import { useCatalog } from "../../library/CatalogContext";
import { useEstimates } from "../../context/EstimatesContext";
import { useRates } from "../../pricing/RatesContext";
import { useInventory } from "../../inventory/InventoryContext";
import { stockKey } from "../../inventory/stockCsv";
import { useCompany } from "../../context/CompanyContext";
import { notify } from "../../utils/confirm";
import { calculateItemMaterialTotal, calculateItemLabourTotal, calculateItemTotal } from "../../pricing/calculations";

// ── The Add item flow, lifted straight from the MTO sheets ───────────────────
//
//   Plumbing MTO:   Item → Material → Primary Size → Secondary Size → Qty → (Unit) → Remarks
//   Electrical MTO: Item → Material → Size         → Core           → Qty → (Unit) → Remarks
//
// Every column is a tap: choosing a value moves straight to the next empty column, so there is
// no "Next" button. Unit is never picked — it is looked up from the item's default unit.
// Secondary size (plumbing) and core (electrical) are optional; the wizard only insists on
// them for reducers and cables.
//
// This hook holds all of that logic. The screen (screens/AddItemScreen.js) and the step views
// (./steps.js) only draw it, so the look can change without touching the rules.

export const TRADES = ["Plumbing", "Electrical"];
export const NONE = "__none__";

export const STEP_LABELS = { item: "Item", material: "Material", size: "Size", secondarySize: "Reduces to", core: "Core", qty: "Qty & rate" };

export function comboKey(it) {
  return [it.trade, it.item, it.material, it.size, it.secondarySize, it.core].join("|");
}

// Most-logged combinations for this trade across all estimates ("Log again").
function useQuickPicks(estimates, trade, catalog) {
  return useMemo(() => {
    const byCombo = new Map();
    estimates
      .flatMap((e) => e.items || [])
      .filter((it) => it.trade === trade && findItem(trade, it.item))
      .forEach((it) => {
        const k = comboKey(it);
        const existing = byCombo.get(k);
        if (!existing) byCombo.set(k, { ...it, _count: 1 });
        else {
          existing._count += 1;
          if ((it.createdAt || 0) > (existing.createdAt || 0)) existing.createdAt = it.createdAt;
        }
      });
    return Array.from(byCombo.values())
      .sort((a, b) => b._count - a._count || (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 6);
  }, [estimates, trade, catalog]);
}

export function useAddItemWizard({ estimateId, editItemId, onDone }) {
  const { estimates, getEstimate, addItem, updateItem } = useEstimates();
  const { getRate } = useRates();
  const { getAvailability, availabilityFor } = useInventory();
  const { company } = useCompany();
  // "block" (default): a line can't take more than is in stock, and an item with no stock line
  // at all can't be added. "warn": it can, but the shortage is shown in red. Same rule as the API.
  const stockPolicy = company?.stockPolicy === "warn" ? "warn" : "block";
  const estimate = getEstimate(estimateId);
  const editingItem = editItemId ? estimate?.items.find((it) => it.id === editItemId) : null;
  const isEditing = !!editingItem;

  const estimateTrades = useMemo(() => {
    const t = (estimate?.trades || []).filter((x) => TRADES.includes(x));
    return t.length ? t : TRADES;
  }, [estimate]);
  const tradeLocked = estimateTrades.length === 1 && !editingItem;

  // ── Picks (null = column still empty, like a blank sheet cell) ──────────
  const [trade, setTrade] = useState(editingItem?.trade || estimateTrades[0]);
  const [itemName, setItemName] = useState(editingItem?.item || null);
  const [material, setMaterial] = useState(editingItem?.material || null);
  const [size, setSize] = useState(editingItem?.size || null);
  const [secondarySize, setSecondarySize] = useState(editingItem?.secondarySize || null);
  const [core, setCore] = useState(editingItem?.core || null);
  const [qty, setQty] = useState(editingItem ? Number(editingItem.qty) || 1 : 1);
  const [remarks, setRemarks] = useState(editingItem?.remarks || "");
  const [materialRate, setMaterialRate] = useState(editingItem ? String(editingItem.materialRate ?? 0) : "");
  const [labourRate, setLabourRate] = useState(editingItem ? String(editingItem.labourRate ?? 0) : "");
  const [rateTouched, setRateTouched] = useState(isEditing);
  const [itemFilter, setItemFilter] = useState("");
  const [familyFilter, setFamilyFilter] = useState("All");
  const [stepKey, setStepKey] = useState(() => (isEditing ? "qty" : "item"));
  // When a pick is changed from the review step, come straight back to it afterwards.
  const [returnTo, setReturnTo] = useState(null);

  useCatalog(); // re-render when an admin changes the item library
  const catalog = tradeCatalog(trade);
  const isPlumbing = trade === "Plumbing";
  const selectedItem = useMemo(() => (itemName ? findItem(trade, itemName) : null), [trade, itemName, catalog]); // eslint-disable-line react-hooks/exhaustive-deps
  const unit = itemName ? unitFor(trade, itemName) : null;
  const quickPicks = useQuickPicks(estimates, trade, catalog);
  const secondaryRequired = !!selectedItem?.needsSecondarySize;
  const coreRequired = !!selectedItem?.needsCore;

  // ── Step list: the sheet's columns for this trade + item ─────────────────
  const steps = useMemo(() => {
    const list = ["item", "material", "size"];
    if (isPlumbing && (secondaryRequired || secondarySize || stepKey === "secondarySize")) list.push("secondarySize");
    if (!isPlumbing && (coreRequired || core || stepKey === "core")) list.push("core");
    list.push("qty");
    return list;
  }, [isPlumbing, secondaryRequired, coreRequired, secondarySize, core, stepKey]);
  const stepIndex = Math.max(0, steps.indexOf(stepKey));

  const values = { item: itemName, material, size, secondarySize, core };
  const firstEmpty = useCallback((list, v) => list.find((s) => s !== "qty" && !v[s]) || "qty", []);

  function advance(nextValues, nextSteps = steps) {
    const target = returnTo && !nextSteps.some((s) => s !== "qty" && !nextValues[s]) ? returnTo : firstEmpty(nextSteps, nextValues);
    setReturnTo(null);
    setStepKey(target);
  }

  function goTo(key) {
    setReturnTo(stepKey === "qty" ? "qty" : null);
    setStepKey(key);
  }

  function goToIndex(i) {
    if (i >= 0 && i < stepIndex) {
      setReturnTo(null);
      setStepKey(steps[i]);
    }
  }

  // ── Pick handlers — each one is a tap that also moves on ─────────────────
  function changeTrade(next) {
    if (next === trade) return;
    setTrade(next);
    setItemName(null);
    setMaterial(null);
    setSize(null);
    setSecondarySize(null);
    setCore(null);
    setRateTouched(false);
    setFamilyFilter("All");
    setItemFilter("");
    setReturnTo(null);
    setStepKey("item");
  }

  function pickItem(name) {
    const found = findItem(trade, name);
    setItemName(name);
    const nextSteps = ["item", "material", "size"];
    if (isPlumbing && found?.needsSecondarySize) nextSteps.push("secondarySize");
    if (!isPlumbing && found?.needsCore) nextSteps.push("core");
    nextSteps.push("qty");
    setRateTouched(false);
    advance({ ...values, item: name }, nextSteps);
  }

  function pickMaterial(m) {
    setMaterial(m);
    setRateTouched(false);
    advance({ ...values, material: m });
  }

  function pickSize(s) {
    setSize(s);
    advance({ ...values, size: s });
  }

  function pickSecondarySize(s) {
    const v = s === NONE ? null : s;
    setSecondarySize(v);
    advance({ ...values, secondarySize: v || NONE }); // "none" still counts as answered
  }

  function pickCore(c) {
    const v = c === NONE ? null : c;
    setCore(v);
    advance({ ...values, core: v || NONE });
  }

  function applyQuickPick(pick) {
    setItemName(pick.item);
    setMaterial(pick.material);
    setSize(pick.size);
    setSecondarySize(pick.secondarySize || null);
    setCore(pick.core || null);
    setMaterialRate(String(pick.materialRate ?? 0));
    setLabourRate(String(pick.labourRate ?? 0));
    setRateTouched(true);
    setReturnTo(null);
    setStepKey("qty");
  }

  // Rates are pre-filled from the company library once item + material are known,
  // unless the estimator already typed a rate for this line.
  useEffect(() => {
    if (rateTouched || !itemName || !material || !selectedItem) return;
    const rate = getRate(trade, selectedItem.family, itemName, material);
    setMaterialRate(String(rate.materialRate));
    setLabourRate(String(rate.labourRate));
  }, [rateTouched, trade, itemName, material, selectedItem, getRate]);

  const editRate = (setter) => (v) => {
    setter(v.replace(/[^0-9.]/g, ""));
    setRateTouched(true);
  };

  // ── Derived values ───────────────────────────────────────────────────────
  const qtyNum = Number(qty) || 0;
  const materialRateNum = Number(materialRate) || 0;
  const labourRateNum = Number(labourRate) || 0;
  const draft = { qty: qtyNum, materialRate: materialRateNum, labourRate: labourRateNum };
  const totals = { material: calculateItemMaterialTotal(draft), labour: calculateItemLabourTotal(draft), line: calculateItemTotal(draft) };

  const errors = {};
  if (qtyNum <= 0) errors.qty = "Quantity must be more than 0";
  const specComplete = !!(itemName && material && size);

  // Stock check — same key as the stock library line. Editing a line must not count its own
  // current quantity as "used", otherwise it would look over-drawn against itself.
  const availability = useMemo(() => {
    if (!specComplete) return null;
    const a = getAvailability({ trade, item: itemName, material, size, secondarySize: isPlumbing ? secondarySize : null, core: isPlumbing ? null : core });
    if (!a) return null;
    const ownQty = isEditing ? Number(editingItem.qty) || 0 : 0;
    const available = Math.round((a.available + ownQty) * 100) / 100;
    return { ...a, available, used: Math.max(0, Math.round((a.used - ownQty) * 100) / 100) };
  }, [specComplete, getAvailability, trade, itemName, material, size, secondarySize, core, isPlumbing, isEditing, editingItem]);

  // Stock check. Two ways a line can fail:
  //   · "none"  — nothing in the stock library for this item · material · size (· core)
  //   · "short" — there is a stock line, but not enough left for this quantity
  // An existing line that isn't changing its item and isn't asking for more stays saveable, so
  // old estimates made before a stock line was removed can still be edited.
  const stockProblem = useMemo(() => {
    if (!specComplete || qtyNum <= 0) return null;
    const pick = { trade, item: itemName, material, size, secondarySize: isPlumbing ? secondarySize : null, core: isPlumbing ? null : core };
    const what = [itemName, material, size, isPlumbing ? secondarySize : core].filter(Boolean).join(" · ");
    const fmt = (n) => String(Math.round(n * 100) / 100);
    if (!availability) {
      const keepsOld = isEditing && stockKey(editingItem) === stockKey(pick) && qtyNum <= (Number(editingItem.qty) || 0);
      if (keepsOld) return null;
      return { kind: "none", title: "Not in stock", message: `${what} is not in stock. There is no stock line for it in the library — ask your admin to add it under Library › Stock.` };
    }
    if (availability.available - qtyNum >= 0) return null;
    const left = Math.max(0, availability.available);
    const u = availability.unit || unit || "";
    return left > 0
      ? { kind: "short", title: "Not enough stock", message: `Only ${fmt(left)} ${u} of ${what} is left — this line needs ${fmt(qtyNum)} ${u}.` }
      : { kind: "short", title: "Out of stock", message: `${what} is out of stock. Nothing is left to use.` };
  }, [specComplete, qtyNum, trade, itemName, material, size, secondarySize, core, isPlumbing, availability, isEditing, editingItem, unit]);

  if (stockProblem && stockPolicy === "block") errors.stock = stockProblem.message;
  const isValid = specComplete && Object.keys(errors).length === 0;
  // The Add button stays tappable when the only problem is stock, so a tap explains why.
  const canTry = specComplete && !errors.qty;

  // "N left" under each size once item + material are known. A size with no stock line at all
  // is missing from the map, and the size step shows it as "Not in stock".
  const sizeAvailability = useMemo(() => {
    if (!itemName || !material) return {};
    const map = {};
    availabilityFor(trade, itemName, material).forEach((l) => {
      map[l.size] = (map[l.size] || 0) + l.available;
    });
    return map;
  }, [availabilityFor, trade, itemName, material]);

  // Materials that have at least one stock line for the chosen item — the rest show "Not in stock".
  const materialAvailability = useMemo(() => {
    if (!itemName) return {};
    const map = {};
    availabilityFor(trade, itemName).forEach((l) => {
      map[l.material] = (map[l.material] || 0) + l.available;
    });
    return map;
  }, [availabilityFor, trade, itemName]);

  // Item step: families → items, filtered by search + family chip.
  const itemSections = useMemo(() => {
    const q = itemFilter.trim().toLowerCase();
    return catalog.families
      .filter((f) => familyFilter === "All" || f === familyFilter)
      .map((family) => ({ family, items: catalog.items[family].filter((i) => !q || i.name.toLowerCase().includes(q) || family.toLowerCase().includes(q)) }))
      .filter((s) => s.items.length > 0);
  }, [catalog, itemFilter, familyFilter]);

  function payload() {
    return {
      trade,
      family: selectedItem?.family || "",
      item: itemName,
      material,
      size,
      secondarySize: isPlumbing ? secondarySize || null : null,
      core: !isPlumbing ? core || null : null,
      qty: qtyNum,
      unit,
      materialRate: materialRateNum,
      labourRate: labourRateNum,
      remarks: remarks.trim(),
    };
  }

  function resetForAnother() {
    setItemName(null);
    setMaterial(null);
    setSize(null);
    setSecondarySize(null);
    setCore(null);
    setQty(1);
    setRemarks("");
    setMaterialRate("");
    setLabourRate("");
    setRateTouched(false);
    setItemFilter("");
    setReturnTo(null);
    setStepKey("item");
  }

  function save(addAnother) {
    if (errors.stock) {
      notify(stockProblem?.title || "Not in stock", errors.stock);
      return false;
    }
    if (!isValid) return false;
    if (isEditing) {
      updateItem(estimateId, editItemId, payload());
      onDone?.();
      return true;
    }
    addItem(estimateId, payload());
    if (addAnother) resetForAnother();
    else onDone?.();
    return true;
  }

  return {
    estimate,
    isEditing,
    // trade
    trade,
    estimateTrades,
    tradeLocked,
    changeTrade,
    isPlumbing,
    catalog,
    itemCount: tradeItems(trade).length,
    // steps
    steps,
    stepKey,
    stepIndex,
    goTo,
    goToIndex,
    // picks
    itemName,
    material,
    size,
    secondarySize,
    core,
    unit,
    secondaryRequired,
    coreRequired,
    pickItem,
    pickMaterial,
    pickSize,
    pickSecondarySize,
    pickCore,
    quickPicks,
    applyQuickPick,
    itemFilter,
    setItemFilter,
    familyFilter,
    setFamilyFilter,
    itemSections,
    sizeAvailability,
    materialAvailability,
    // qty & rate
    qty: qtyNum,
    setQty,
    materialRate,
    labourRate,
    setMaterialRate: editRate(setMaterialRate),
    setLabourRate: editRate(setLabourRate),
    rateTouched,
    remarks,
    setRemarks,
    totals,
    errors,
    availability,
    specComplete,
    isValid,
    canTry,
    stockProblem,
    stockPolicy,
    save,
  };
}
