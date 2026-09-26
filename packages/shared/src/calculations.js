// Calculation engine — the single source of truth for every money computation in the app.
// Screens must never compute totals inline; they call these functions so the numbers shown
// in the item card, the Summary tab and the PDF can never drift apart.
//
// Money is kept in rupees as JS numbers but every intermediate result is rounded to 2 decimal
// places (paise) with `round2` before it is added again, which avoids the classic
// 0.1 + 0.2 = 0.30000000000000004 float-drift compounding across dozens of line items.

export function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// EstimateItem stores quantity as `qty` (the field name every existing screen already reads/writes) —
// the engine matches that rather than introducing a second name for the same value.
export function calculateItemMaterialTotal(item) {
  const qty = Number(item.qty) || 0;
  const rate = Number(item.materialRate) || 0;
  return round2(qty * rate);
}

export function calculateItemLabourTotal(item) {
  const qty = Number(item.qty) || 0;
  const rate = Number(item.labourRate) || 0;
  return round2(qty * rate);
}

export function calculateItemTotal(item) {
  return round2(calculateItemMaterialTotal(item) + calculateItemLabourTotal(item));
}

// One subtotal object shape is reused for a single trade and for the whole estimate:
// { material, labour, total, count }
export function calculateTradeTotals(items, trade) {
  return items
    .filter((it) => it.trade === trade)
    .reduce(
      (acc, it) => ({
        material: round2(acc.material + calculateItemMaterialTotal(it)),
        labour: round2(acc.labour + calculateItemLabourTotal(it)),
        total: round2(acc.total + calculateItemTotal(it)),
        count: acc.count + 1,
      }),
      { material: 0, labour: 0, total: 0, count: 0 }
    );
}

export function calculateAllTradeTotals(items, trades) {
  const list = trades && trades.length ? trades : Array.from(new Set(items.map((it) => it.trade)));
  return list.map((trade) => ({ trade, ...calculateTradeTotals(items, trade) }));
}

export function calculateOverallItemTotals(items) {
  return items.reduce(
    (acc, it) => ({
      material: round2(acc.material + calculateItemMaterialTotal(it)),
      labour: round2(acc.labour + calculateItemLabourTotal(it)),
      total: round2(acc.total + calculateItemTotal(it)),
      count: acc.count + 1,
    }),
    { material: 0, labour: 0, total: 0, count: 0 }
  );
}

// Additional costs: [{ id, label, mode: 'fixed' | 'percent', value }]
// Percentage-mode costs are computed against the material+labour subtotal (before additional costs).
export function calculateAdditionalCost(cost, baseAmount) {
  const value = Number(cost.value) || 0;
  if (cost.mode === "percent") return round2((baseAmount * value) / 100);
  return round2(value);
}

export function calculateAdditionalCostsTotal(adjustments, baseAmount) {
  return round2(
    (adjustments || []).reduce((sum, cost) => sum + calculateAdditionalCost(cost, baseAmount), 0)
  );
}

// Discount: { mode: 'fixed' | 'percent', value }, applied against material+labour+additional costs.
export function calculateDiscount(discount, baseAmount) {
  if (!discount) return 0;
  const value = Number(discount.value) || 0;
  if (value <= 0) return 0;
  if (discount.mode === "percent") return round2((baseAmount * value) / 100);
  return round2(Math.min(value, baseAmount));
}

// Tax: { percent, mode: 'added' | 'included' }
// 'added'    — tax is computed on top of the post-discount subtotal and added to it.
// 'included' — the post-discount subtotal already contains tax; back it out for display only,
//              the grand total stays equal to the subtotal.
export function calculateTax(tax, subtotalAfterDiscount) {
  const percent = Number(tax?.percent) || 0;
  if (percent <= 0) return 0;
  if (tax?.mode === "included") {
    return round2(subtotalAfterDiscount - subtotalAfterDiscount / (1 + percent / 100));
  }
  return round2((subtotalAfterDiscount * percent) / 100);
}

/**
 * Full estimate breakdown consumed by the Summary tab, the Home dashboard and the PDF exporter.
 * Returns every intermediate figure so the UI never has to re-derive anything.
 */
export function calculateEstimateBreakdown(estimate) {
  const items = estimate?.items || [];
  const trades = estimate?.trades || [];
  const byTrade = calculateAllTradeTotals(items, trades);
  const overall = calculateOverallItemTotals(items);

  const itemsBase = round2(overall.material + overall.labour);
  const additionalCosts = (estimate?.adjustments || []).map((cost) => ({
    ...cost,
    amount: calculateAdditionalCost(cost, itemsBase),
  }));
  const additionalCostsTotal = round2(additionalCosts.reduce((s, c) => s + c.amount, 0));

  const subtotal = round2(itemsBase + additionalCostsTotal);
  const discountAmount = calculateDiscount(estimate?.discount, subtotal);
  const subtotalAfterDiscount = round2(subtotal - discountAmount);
  const taxAmount = calculateTax(estimate?.tax, subtotalAfterDiscount);
  const grandTotal =
    estimate?.tax?.mode === "included"
      ? subtotalAfterDiscount
      : round2(subtotalAfterDiscount + taxAmount);

  return {
    byTrade,
    overall,
    additionalCosts,
    additionalCostsTotal,
    subtotal,
    discountAmount,
    subtotalAfterDiscount,
    taxAmount,
    grandTotal,
    lineItemCount: items.length,
  };
}
