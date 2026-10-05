// The item library the whole app reads from (families, items, materials, sizes, cores): the
// built-in list in packages/shared, generated from MTO_Template.xlsx (npm run catalog).
import { CATALOG as DEFAULT_CATALOG, TRADE_KEY } from "@mto/shared/catalog";

export { DEFAULT_CATALOG, TRADE_KEY };

const active = DEFAULT_CATALOG;

export function getCatalog() {
  return active;
}

export function tradeCatalog(trade) {
  return active[TRADE_KEY[trade] || trade] || active.plumbing;
}

// Flat list of every pickable item for a trade, in library order, each tagged with its family.
export function tradeItems(trade) {
  const cat = tradeCatalog(trade);
  return cat.families.flatMap((family) => (cat.items[family] || []).map((it) => ({ ...it, family })));
}

export function findItem(trade, name) {
  return tradeItems(trade).find((it) => it.name === name) || null;
}

// The unit comes from the item, never chosen per line.
export function unitFor(trade, name) {
  return findItem(trade, name)?.unit || "Nos";
}
