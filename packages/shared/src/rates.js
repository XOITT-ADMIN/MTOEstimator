// Default item rate database.
//
// This is intentionally separate from src/data/catalog.js: the catalog describes *what an item
// is* (trade → family → item → material/size/core shape), this file describes *what it costs by
// default*. Keeping them apart means adding or changing a price never touches the catalog, and a
// future "sync catalog from workbook" can safely overwrite catalog.js without wiping rates.
//
// Rates here are keyed at (trade, family, item, material) granularity — not by size — because a
// single flat "default" rate is a starting point the estimator is always expected to confirm or
// override per line (see RatesContext + the pricing card in AddItemScreen), not a live price feed.
// Values are realistic-looking ₹ INR demo defaults, not verified market prices.

import { rateKey as key } from "./keys.js";

// { materialRate, labourRate } — both per the item's catalog unit (m, Nos, Roll, Set, ...).
const DEFAULT_RATES = {
  // ---- Plumbing : Pipe ----
  [key("Plumbing", "Pipe", "Pipe", "PVC")]: { materialRate: 65, labourRate: 12 },
  [key("Plumbing", "Pipe", "Pipe", "UPVC")]: { materialRate: 78, labourRate: 12 },
  [key("Plumbing", "Pipe", "Pipe", "CPVC")]: { materialRate: 85, labourRate: 15 },
  [key("Plumbing", "Pipe", "Pipe", "HDPE")]: { materialRate: 110, labourRate: 18 },
  [key("Plumbing", "Pipe", "Pipe", "GI")]: { materialRate: 175, labourRate: 22 },
  [key("Plumbing", "Pipe", "Pipe", "CI")]: { materialRate: 240, labourRate: 28 },
  [key("Plumbing", "Pipe", "DWC Pipe", "HDPE")]: { materialRate: 145, labourRate: 20 },
  [key("Plumbing", "Pipe", "Braided Hose", "SS304")]: { materialRate: 320, labourRate: 25 },

  // ---- Plumbing : Pipe Fitting ----
  [key("Plumbing", "Pipe Fitting", "90° Elbow", "PVC")]: { materialRate: 28, labourRate: 15 },
  [key("Plumbing", "Pipe Fitting", "90° Elbow", "UPVC")]: { materialRate: 34, labourRate: 15 },
  [key("Plumbing", "Pipe Fitting", "90° Elbow", "CPVC")]: { materialRate: 42, labourRate: 18 },
  [key("Plumbing", "Pipe Fitting", "45° Elbow", "PVC")]: { materialRate: 26, labourRate: 15 },
  [key("Plumbing", "Pipe Fitting", "45° Elbow", "UPVC")]: { materialRate: 32, labourRate: 15 },
  [key("Plumbing", "Pipe Fitting", "Equal Tee", "PVC")]: { materialRate: 32, labourRate: 18 },
  [key("Plumbing", "Pipe Fitting", "Equal Tee", "UPVC")]: { materialRate: 38, labourRate: 18 },
  [key("Plumbing", "Pipe Fitting", "Equal Tee", "CPVC")]: { materialRate: 48, labourRate: 20 },
  [key("Plumbing", "Pipe Fitting", "Reducing Tee", "UPVC")]: { materialRate: 45, labourRate: 20 },
  [key("Plumbing", "Pipe Fitting", "Coupling", "PVC")]: { materialRate: 18, labourRate: 10 },
  [key("Plumbing", "Pipe Fitting", "Coupling", "UPVC")]: { materialRate: 22, labourRate: 10 },
  [key("Plumbing", "Pipe Fitting", "Reducing Coupling", "UPVC")]: { materialRate: 28, labourRate: 12 },
  [key("Plumbing", "Pipe Fitting", "Union", "PVC")]: { materialRate: 35, labourRate: 15 },
  [key("Plumbing", "Pipe Fitting", "Union", "CPVC")]: { materialRate: 52, labourRate: 18 },
  [key("Plumbing", "Pipe Fitting", "Concentric Reducer", "CPVC")]: { materialRate: 55, labourRate: 20 },
  [key("Plumbing", "Pipe Fitting", "Reducer Bush", "UPVC")]: { materialRate: 20, labourRate: 12 },
  [key("Plumbing", "Pipe Fitting", "End Cap", "PVC")]: { materialRate: 12, labourRate: 8 },

  // ---- Plumbing : Flange ----
  [key("Plumbing", "Flange", "Slip-On Flange", "CS")]: { materialRate: 380, labourRate: 60 },
  [key("Plumbing", "Flange", "Blind Flange", "CS")]: { materialRate: 340, labourRate: 55 },
  [key("Plumbing", "Flange", "Weld Neck Flange", "SS304")]: { materialRate: 620, labourRate: 80 },

  // ---- Plumbing : Valve ----
  [key("Plumbing", "Valve", "Ball Valve", "Brass")]: { materialRate: 165, labourRate: 35 },
  [key("Plumbing", "Valve", "Ball Valve", "CPVC")]: { materialRate: 95, labourRate: 25 },
  [key("Plumbing", "Valve", "Gate Valve", "CI")]: { materialRate: 420, labourRate: 60 },
  [key("Plumbing", "Valve", "Gate Valve", "GI")]: { materialRate: 310, labourRate: 50 },
  [key("Plumbing", "Valve", "Butterfly Valve", "CI")]: { materialRate: 950, labourRate: 120 },
  [key("Plumbing", "Valve", "Check Valve", "Brass")]: { materialRate: 220, labourRate: 40 },
  [key("Plumbing", "Valve", "Foot Valve", "GI")]: { materialRate: 280, labourRate: 45 },
  [key("Plumbing", "Valve", "Y Strainer", "CI")]: { materialRate: 340, labourRate: 50 },

  // ---- Plumbing : Pipe Support / Fastener / Jointing Material ----
  [key("Plumbing", "Pipe Support", "U Clamp", "GI")]: { materialRate: 22, labourRate: 12 },
  [key("Plumbing", "Pipe Support", "Pipe Clamp", "GI")]: { materialRate: 28, labourRate: 12 },
  [key("Plumbing", "Pipe Support", "Pipe Hanger", "GI")]: { materialRate: 45, labourRate: 18 },
  [key("Plumbing", "Fastener", "Hex Bolt", "SS304")]: { materialRate: 12, labourRate: 3 },
  [key("Plumbing", "Fastener", "Anchor Bolt", "SS304")]: { materialRate: 25, labourRate: 8 },
  [key("Plumbing", "Jointing Material", "PTFE Tape", "Nylon")]: { materialRate: 18, labourRate: 0 },
  [key("Plumbing", "Jointing Material", "Solvent Cement", "PVC")]: { materialRate: 145, labourRate: 0 },
  [key("Plumbing", "Jointing Material", "Rubber Gasket", "Rubber")]: { materialRate: 20, labourRate: 5 },

  // ---- Electrical : Power / Control / Instrument Cable ----
  [key("Electrical", "Power Cable", "Power Cable", "Copper")]: { materialRate: 42, labourRate: 8 },
  [key("Electrical", "Power Cable", "Power Cable", "Aluminium")]: { materialRate: 28, labourRate: 8 },
  [key("Electrical", "Power Cable", "Flexible Power Cable", "Copper")]: { materialRate: 38, labourRate: 8 },
  [key("Electrical", "Control Cable", "Control Cable", "Copper")]: { materialRate: 32, labourRate: 7 },
  [key("Electrical", "Instrument Cable", "Instrumentation Cable", "Copper")]: { materialRate: 55, labourRate: 10 },

  // ---- Electrical : Cable Management / Conduit ----
  [key("Electrical", "Cable Management", "Cable Tray", "GI")]: { materialRate: 380, labourRate: 65 },
  [key("Electrical", "Cable Management", "Cable Ladder", "GI")]: { materialRate: 520, labourRate: 85 },
  [key("Electrical", "Cable Management", "Cable Trunking", "GI")]: { materialRate: 210, labourRate: 45 },
  [key("Electrical", "Conduit", "GI Conduit", "GI")]: { materialRate: 65, labourRate: 15 },

  // ---- Electrical : Cable Accessory / Termination / Earthing ----
  [key("Electrical", "Cable Accessory", "Cable Gland", "Brass")]: { materialRate: 45, labourRate: 15 },
  [key("Electrical", "Cable Accessory", "Cable Lug", "Copper")]: { materialRate: 8, labourRate: 4 },
  [key("Electrical", "Cable Accessory", "Cable Tie", "Nylon")]: { materialRate: 2, labourRate: 0 },
  [key("Electrical", "Cable Termination", "Terminal Block", "Copper")]: { materialRate: 28, labourRate: 8 },
  [key("Electrical", "Earthing", "Earth Electrode", "GI")]: { materialRate: 650, labourRate: 250 },
  [key("Electrical", "Earthing", "Copper Bonded Earth Rod", "Copper")]: { materialRate: 1450, labourRate: 350 },
  [key("Electrical", "Earthing", "Earth Strip", "Copper")]: { materialRate: 185, labourRate: 30 },
  [key("Electrical", "Earthing", "Earth Strip", "GI")]: { materialRate: 95, labourRate: 25 },

};

export { rateKey } from "./keys.js";

/**
 * Looks up a default rate, falling back from the exact (item, material) match down to a family-
 * level average, and finally to a flagged zero-rate placeholder so the caller can prompt the
 * estimator to key in a rate rather than silently pricing something at ₹0.
 */
export function getDefaultRate(trade, family, item, material) {
  const exact = DEFAULT_RATES[key(trade, family, item, material)];
  if (exact) return { ...exact, source: "catalog" };

  // Fall back to any material variant of the same item.
  const itemPrefix = `${trade}::${family}::${item}::`;
  const sameItem = Object.entries(DEFAULT_RATES).find(([k]) => k.startsWith(itemPrefix));
  if (sameItem) return { ...sameItem[1], source: "estimated" };

  return { materialRate: 0, labourRate: 0, source: "none" };
}

export function listAllRates() {
  return Object.entries(DEFAULT_RATES).map(([k, rate]) => {
    const [trade, family, item, material] = k.split("::");
    return { key: k, trade, family, item, material: material || null, ...rate };
  });
}

export default DEFAULT_RATES;
