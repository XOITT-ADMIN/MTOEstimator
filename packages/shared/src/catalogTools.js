// Editing the item library (families, items, materials, sizes, cores).
//
// Pure functions shared by the app and the API: the app uses them to build the next version of
// the library, the API uses them to check it before saving. Every function returns a NEW catalog
// and never changes the one passed in.
//
// Shape (same as catalog.js):
//   { plumbing:   { families, items: { [family]: [{ name, unit, needsSecondarySize }] }, materials, sizes },
//     electrical: { families, items: { [family]: [{ name, unit, needsCore }] }, materials, sizes, cores },
//     materials: [...both trades, no repeats], units: [...] }

import { CATALOG as DEFAULT_CATALOG } from "./catalog.js";

export const TRADES = ["Plumbing", "Electrical"];
const KEY = { Plumbing: "plumbing", Electrical: "electrical" };
const FLAG = { Plumbing: "needsSecondarySize", Electrical: "needsCore" };
export const OPTION_LISTS = ["materials", "sizes", "cores"];
const MAX_NAME = 120;

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();
const uniq = (list) => {
  const out = [];
  list.forEach((v) => {
    const c = clean(v);
    if (c && !out.some((x) => same(x, c))) out.push(c);
  });
  return out;
};
const copy = (cat) => JSON.parse(JSON.stringify(cat));

export class CatalogError extends Error {
  constructor(message, problems = [message]) {
    super(message);
    this.name = "CatalogError";
    this.problems = problems;
  }
}

export function tradeKey(trade) {
  const k = KEY[trade] || trade;
  if (k !== "plumbing" && k !== "electrical") throw new CatalogError(`Unknown trade "${trade}".`);
  return k;
}

// Tidy a catalog: trims names, drops blanks and repeats, drops empty families, and rebuilds the
// combined materials and units lists.
export function normalizeCatalog(input) {
  const cat = copy(input || DEFAULT_CATALOG);
  for (const trade of TRADES) {
    const k = KEY[trade];
    const t = cat[k] || {};
    const items = {};
    const families = [];
    uniq(t.families || []).forEach((family) => {
      const src = (t.items || {})[family] || Object.entries(t.items || {}).find(([f]) => same(f, family))?.[1] || [];
      const list = [];
      src.forEach((it) => {
        const name = clean(it?.name);
        if (!name || list.some((x) => same(x.name, name))) return;
        const next = { ...it, name, unit: clean(it.unit) || "Nos", [FLAG[trade]]: !!it[FLAG[trade]] };
        delete next[FLAG[trade === "Plumbing" ? "Electrical" : "Plumbing"]]; // the other trade's flag means nothing here
        delete next.family;
        list.push(next);
      });
      if (list.length) {
        families.push(family);
        items[family] = list;
      }
    });
    cat[k] = {
      ...t,
      families,
      items,
      materials: uniq(t.materials || []),
      sizes: uniq(t.sizes || []),
      ...(trade === "Electrical" ? { cores: uniq(t.cores || []) } : {}),
    };
  }
  cat.materials = uniq([...cat.plumbing.materials, ...cat.electrical.materials]);
  const itemUnits = TRADES.flatMap((tr) => Object.values(cat[KEY[tr]].items).flat().map((i) => i.unit));
  cat.units = uniq([...(input?.units || DEFAULT_CATALOG.units || []), ...itemUnits]);
  return cat;
}

// Problems that make a catalog unusable. Empty list = fine.
export function validateCatalog(cat) {
  const problems = [];
  for (const trade of TRADES) {
    const t = cat?.[KEY[trade]];
    if (!t) {
      problems.push(`${trade}: missing.`);
      continue;
    }
    const all = (t.families || []).flatMap((f) => (t.items?.[f] || []).map((i) => ({ ...i, family: f })));
    if (!all.length) problems.push(`${trade}: add at least one item.`);
    if (!(t.materials || []).length) problems.push(`${trade}: add at least one material.`);
    if (!(t.sizes || []).length) problems.push(`${trade}: add at least one size.`);
    if (trade === "Electrical" && all.some((i) => i.needsCore) && !(t.cores || []).length) problems.push("Electrical: some items need a core, so add at least one core.");
    const seen = new Map();
    all.forEach((i) => {
      if (!clean(i.name)) problems.push(`${trade}: an item in ${i.family} has no name.`);
      if (clean(i.name).length > MAX_NAME) problems.push(`${trade}: "${i.name.slice(0, 30)}…" is longer than ${MAX_NAME} letters.`);
      if (!clean(i.unit)) problems.push(`${trade}: ${i.name} has no unit.`);
      const k = clean(i.name).toLowerCase();
      if (seen.has(k)) problems.push(`${trade}: "${i.name}" is in both ${seen.get(k)} and ${i.family}. Item names must be unique within a trade.`);
      else seen.set(k, i.family);
    });
    for (const list of OPTION_LISTS) {
      (t[list] || []).forEach((v) => {
        if (clean(v).length > MAX_NAME) problems.push(`${trade}: "${String(v).slice(0, 30)}…" is too long.`);
      });
    }
  }
  return problems;
}

// ── Items ──────────────────────────────────────────────────────────────────

// Add an item, or update it when `originalName` is given (rename / move family / change unit).
// item = { family, name, unit, needsSecondarySize?, needsCore? }
export function upsertItem(catalog, trade, item, originalName = null) {
  const k = tradeKey(trade);
  const cat = copy(catalog);
  const t = cat[k];
  const name = clean(item.name);
  const family = clean(item.family);
  const unit = clean(item.unit);
  if (!name) throw new CatalogError("Enter the item name.");
  if (!family) throw new CatalogError("Pick or type a family.");
  if (!unit) throw new CatalogError("Pick or type a unit.");
  if (name.length > MAX_NAME || family.length > MAX_NAME || unit.length > 20) throw new CatalogError("That name is too long.");

  const clash = t.families.flatMap((f) => t.items[f].map((i) => ({ ...i, family: f }))).find((i) => same(i.name, name) && !(originalName && same(i.name, originalName)));
  if (clash) throw new CatalogError(`"${clash.name}" is already in ${clash.family}.`);

  let at = null; // keep an edited item in its place when the family doesn't change
  if (originalName) {
    for (const f of t.families) {
      const idx = t.items[f].findIndex((i) => same(i.name, originalName));
      if (idx !== -1) {
        at = { family: f, idx, prev: t.items[f][idx] };
        t.items[f].splice(idx, 1);
        break;
      }
    }
    if (!at) throw new CatalogError(`"${originalName}" is no longer in the ${trade} library.`);
  }

  const existingFamily = t.families.find((f) => same(f, family));
  const fam = existingFamily || family;
  if (!existingFamily) {
    t.families.push(fam);
    t.items[fam] = [];
  }
  const next = { ...(at?.prev || {}), name, unit, [FLAG[trade]]: !!item[FLAG[trade]] };
  if (at && same(at.family, fam)) t.items[fam].splice(at.idx, 0, next);
  else t.items[fam].push(next);
  return normalizeCatalog(cat);
}

export function removeItem(catalog, trade, name) {
  const k = tradeKey(trade);
  const cat = copy(catalog);
  const t = cat[k];
  let found = false;
  t.families.forEach((f) => {
    const before = t.items[f].length;
    t.items[f] = t.items[f].filter((i) => !same(i.name, name));
    if (t.items[f].length !== before) found = true;
  });
  if (!found) throw new CatalogError(`"${name}" is not in the ${trade} library.`);
  return normalizeCatalog(cat);
}

// ── Materials / sizes / cores ─────────────────────────────────────────────

// Add a value to a list, or rename one when `original` is given (keeps its position).
export function upsertOption(catalog, trade, list, value, original = null) {
  const k = tradeKey(trade);
  if (!OPTION_LISTS.includes(list)) throw new CatalogError(`Unknown list "${list}".`);
  if (list === "cores" && k !== "electrical") throw new CatalogError("Cores are for Electrical only.");
  const cat = copy(catalog);
  const arr = cat[k][list] || (cat[k][list] = []);
  const v = clean(value);
  const label = list.slice(0, -1);
  if (!v) throw new CatalogError(`Enter the ${label}.`);
  if (v.length > MAX_NAME) throw new CatalogError(`That ${label} is too long.`);
  if (arr.some((x) => same(x, v) && !(original && same(x, original)))) throw new CatalogError(`"${v}" is already in the list.`);
  if (original) {
    const idx = arr.findIndex((x) => same(x, original));
    if (idx === -1) throw new CatalogError(`"${original}" is no longer in the list.`);
    arr[idx] = v;
  } else arr.push(v);
  return normalizeCatalog(cat);
}

export function removeOption(catalog, trade, list, value) {
  const k = tradeKey(trade);
  const cat = copy(catalog);
  const arr = cat[k][list] || [];
  if (!arr.some((x) => same(x, value))) throw new CatalogError(`"${value}" is not in the list.`);
  cat[k][list] = arr.filter((x) => !same(x, value));
  return normalizeCatalog(cat);
}

// ── Merge (CSV upload, "Merge" option) ────────────────────────────────────

// Adds everything in `incoming` that `base` doesn't have and updates unit / flag of items that
// exist in both. Nothing is removed.
export function mergeCatalogs(base, incoming) {
  let cat = normalizeCatalog(base);
  for (const trade of TRADES) {
    const k = KEY[trade];
    const inc = incoming?.[k];
    if (!inc) continue;
    for (const family of inc.families || []) {
      for (const it of inc.items?.[family] || []) {
        const existing = cat[k].families.flatMap((f) => cat[k].items[f]).find((i) => same(i.name, it.name));
        cat = upsertItem(cat, trade, { ...it, family: existing ? cat[k].families.find((f) => cat[k].items[f].includes(existing)) : family }, existing ? existing.name : null);
      }
    }
    for (const list of OPTION_LISTS) {
      if (list === "cores" && k !== "electrical") continue;
      cat[k][list] = uniq([...(cat[k][list] || []), ...(inc[list] || [])]);
    }
  }
  return normalizeCatalog(cat);
}

// ── Safety check against stock ────────────────────────────────────────────

// Stock lines must always point at something that exists in the library, otherwise they can no
// longer be picked or uploaded. Returns one message per broken stock line (empty = fine).
export function findBrokenStock(catalog, stockLines) {
  const problems = [];
  for (const s of stockLines || []) {
    const k = KEY[s.trade];
    const t = k && catalog?.[k];
    if (!t) continue;
    const label = [s.item, s.material, s.size, s.secondarySize, s.core].filter(Boolean).join(" · ");
    const missing = [];
    const hasItem = t.families.some((f) => (t.items[f] || []).some((i) => i.name === s.item));
    if (!hasItem) missing.push(`item "${s.item}"`);
    if (s.material && !(t.materials || []).includes(s.material)) missing.push(`material "${s.material}"`);
    if (s.size && !(t.sizes || []).includes(s.size)) missing.push(`size "${s.size}"`);
    if (s.secondarySize && !(t.sizes || []).includes(s.secondarySize)) missing.push(`size "${s.secondarySize}"`);
    if (s.core && !(t.cores || []).includes(s.core)) missing.push(`core "${s.core}"`);
    if (missing.length) problems.push(`${s.trade} stock line ${label} uses ${missing.join(", ")}`);
  }
  return problems;
}
