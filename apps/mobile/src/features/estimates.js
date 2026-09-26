// Small, UI-free helpers shared by the estimate screens.
import { calculateEstimateBreakdown } from "../pricing/calculations";
import { formatINR } from "../utils/currency";

export function greetingFor(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function money(n, decimals = true) {
  return formatINR(n, { decimals });
}

// "₹3,19,894" + ".00" split for the big value on navy cards.
export function moneyParts(n) {
  const s = formatINR(n, { decimals: true });
  const i = s.lastIndexOf(".");
  return i === -1 ? [s, ""] : [s.slice(0, i), s.slice(i)];
}

export function shortDate(value) {
  const d = value ? new Date(value) : null;
  if (!d || isNaN(d)) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function timeAgo(ms) {
  if (!ms) return "";
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Everything a list row / card needs about one estimate.
export function summarize(e, { getAvailability } = {}) {
  const b = calculateEstimateBreakdown(e);
  const items = e.items || [];
  const short = getAvailability ? items.filter((it) => (getAvailability(it)?.available ?? 0) < 0).length : 0;
  const unpriced = items.filter((it) => !Number(it.materialRate) && !Number(it.labourRate)).length;
  return {
    estimate: e,
    value: b.grandTotal,
    breakdown: b,
    items: items.length,
    trades: e.trades?.length ? e.trades : Array.from(new Set(items.map((i) => i.trade))),
    short,
    unpriced,
    date: e.date || shortDate(e.updatedAt),
    by: e.createdBy?.name ? e.createdBy.name.split(" ")[0] : null,
  };
}

// Size / core chips for a line: "50 × 40 mm", "4C".
export function specChips(it) {
  const out = [];
  if (it.size && it.secondarySize) {
    // "50 mm" + "40 mm" → "50 × 40 mm" when both share a unit.
    const [a, ua] = splitUnit(it.size);
    const [b, ub] = splitUnit(it.secondarySize);
    out.push(ua && ua === ub ? `${a} × ${b} ${ub}` : `${it.size} × ${it.secondarySize}`);
  } else if (it.size) out.push(it.size);
  if (it.core) out.push(it.core);
  return out;
}

function splitUnit(s) {
  const m = String(s).match(/^([\d.\/\s]+?)\s*([a-z.]+)$/i);
  return m ? [m[1].trim(), m[2]] : [s, ""];
}

// "PVC · 50 × 40 mm · 4C" — material plus spec, for stock rows and pickers.
export function specLabel(it) {
  return [it.material, ...specChips(it)].filter(Boolean).join(" · ");
}
