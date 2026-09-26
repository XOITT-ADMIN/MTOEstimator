// The A4 quotation the client receives (PDF + in-app preview).
// Layout follows the "PDF quotation" board of the XMTO design. Colours come from the UI theme,
// so a brand change in src/ui/theme.js also changes the PDF.
import { palette } from "../ui/theme";
import { calculateItemTotal, calculateEstimateBreakdown } from "../pricing/calculations";
import { formatINR } from "./currency";
import { rupeesInWords } from "./amountInWords";

const C = { navy: palette.navy, ink: palette.ink, muted: palette.muted, border: palette.border, rule: "#E3E9F2" };

function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

const n2 = (v) => formatINR(v, { decimals: true }).replace("₹", "");

function sizeText(it) {
  const size = it.secondarySize ? `${it.size} × ${it.secondarySize}` : it.size || "";
  return [size, it.core].filter(Boolean).join(" ");
}

function tradeTable(items, trade) {
  const rows = items
    .map((it, i) => {
      const rate = (Number(it.materialRate) || 0) + (Number(it.labourRate) || 0);
      return `<tr><td>${i + 1}</td><td>${esc(it.item)}</td><td>${esc(it.material)}</td><td>${esc(sizeText(it)) || "—"}</td><td class="r">${esc(it.qty)}</td><td>${esc(it.unit)}</td><td class="r">${n2(rate)}</td><td class="r">${n2(calculateItemTotal(it))}</td></tr>`;
    })
    .join("");
  const subtotal = items.reduce((s, it) => s + calculateItemTotal(it), 0);
  return `
    <div class="trade">${esc(trade).toUpperCase()}</div>
    <table>
      <thead><tr><th>#</th><th>Item</th><th>Material</th><th>Size</th><th class="r">Qty</th><th>Unit</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
      <tbody>${rows}<tr class="sub"><td colspan="7" class="r">${esc(trade)} subtotal</td><td class="r">${n2(subtotal)}</td></tr></tbody>
    </table>`;
}

export function buildQuotationHtml(estimate, company = {}) {
  const b = calculateEstimateBreakdown(estimate);
  const items = estimate.items || [];
  const trades = Array.from(new Set([...(estimate.trades || []), ...items.map((it) => it.trade)])).filter((t) => items.some((it) => it.trade === t));
  const tax = estimate.tax || { percent: 0, mode: "added" };
  const half = (Number(tax.percent) || 0) / 2;
  const date = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const companyName = company.name || "Your company";
  const meta = [company.address, company.phone, company.email, company.gstin && `GSTIN ${company.gstin}`].filter(Boolean).map(esc).join("<br/>");

  const totals = [
    ["Subtotal", n2(b.overall.material + b.overall.labour)],
    ...b.additionalCosts.map((c) => [`${c.label}${c.mode === "percent" ? ` (${c.value}%)` : ""}`, n2(c.amount)]),
    ...(b.discountAmount > 0 ? [["Discount", `−${n2(b.discountAmount)}`]] : []),
    ["Taxable value", n2(tax.mode === "included" ? b.subtotalAfterDiscount - b.taxAmount : b.subtotalAfterDiscount)],
    ...(half ? [[`CGST ${half}%`, n2(b.taxAmount / 2)], [`SGST ${half}%`, n2(b.taxAmount / 2)]] : []),
  ]
    .map(([l, v]) => `<div class="tl"><span>${esc(l)}</span><span>${v}</span></div>`)
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: Poppins, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: ${C.ink}; background: #fff; }
  .page { width: 595px; min-height: 842px; margin: 0 auto; padding: 36px 40px; display: flex; flex-direction: column; font-size: 9px; line-height: 14px; }
  .r { text-align: right; font-variant-numeric: tabular-nums; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${C.navy}; padding-bottom: 10px; }
  .co { font-size: 17px; line-height: 22px; font-weight: 700; color: ${C.navy}; }
  .muted { color: ${C.muted}; }
  .q { font-size: 18px; line-height: 22px; font-weight: 700; letter-spacing: .18em; color: ${C.navy}; text-align: right; }
  .boxes { display: flex; gap: 10px; margin-top: 12px; }
  .box { flex: 1; border: 1px solid ${C.border}; border-radius: 6px; padding: 8px 10px; }
  .cap { font-size: 7px; font-weight: 700; letter-spacing: .1em; color: ${C.muted}; }
  .box b { display: block; font-size: 10px; font-weight: 600; margin-top: 2px; }
  .trade { font-size: 10px; font-weight: 700; color: ${C.navy}; margin: 12px 0 4px; letter-spacing: .06em; }
  table { width: 100%; border-collapse: collapse; }
  th { padding: 5px 6px; font-size: 8px; font-weight: 600; letter-spacing: .04em; color: #fff; background: ${C.navy}; text-align: left; }
  td { padding: 5px 6px; font-size: 9px; border-bottom: 1px solid ${C.rule}; }
  tr.sub td { font-weight: 600; }
  .totals { display: flex; justify-content: flex-end; margin-top: 12px; }
  .tw { width: 230px; }
  .tl { display: flex; justify-content: space-between; padding: 3px 0; font-variant-numeric: tabular-nums; }
  .grand { font-size: 11px; font-weight: 700; color: ${C.navy}; border-top: 1.5px solid ${C.navy}; margin-top: 4px; padding-top: 6px; }
  .words { font-size: 8px; color: ${C.muted}; text-align: right; margin-top: 3px; }
  .terms { margin-top: 14px; white-space: pre-line; }
  .sign { display: flex; justify-content: flex-end; margin-top: 28px; }
  .sign div { width: 180px; text-align: center; }
  .sign .line { border-top: 1px solid ${C.ink}; margin-top: 26px; padding-top: 3px; }
  .foot { margin-top: auto; padding-top: 8px; border-top: 1px solid ${C.border}; display: flex; justify-content: space-between; font-size: 7.5px; color: ${C.muted}; }
</style></head>
<body><div class="page">
  <div class="head">
    <div><div class="co">${esc(companyName)}</div><div class="muted" style="margin-top:2px">${meta}</div></div>
    <div><div class="q">QUOTATION</div><div class="muted r" style="margin-top:2px">No. ${esc(estimate.estimateNumber || "")}<br/>Date ${date}</div></div>
  </div>
  <div class="boxes">
    <div class="box"><div class="cap">TO</div><b>${esc(estimate.client) || "—"}</b><div class="muted">${esc(estimate.site)}</div></div>
    <div class="box"><div class="cap">PROJECT · SITE</div><b>${esc(estimate.name) || "—"}</b><div class="muted">${esc(estimate.site)}</div></div>
  </div>
  ${trades.map((t) => tradeTable(items.filter((it) => it.trade === t), t)).join("") || `<p style="margin-top:16px">No items logged yet.</p>`}
  <div class="totals"><div class="tw">
    ${totals}
    <div class="tl grand"><span>Grand total</span><span>${esc(formatINR(b.grandTotal, { decimals: true }))}</span></div>
    <div class="words">${esc(rupeesInWords(b.grandTotal))}</div>
  </div></div>
  ${company.termsAndConditions ? `<div class="cap" style="margin-top:14px">TERMS &amp; CONDITIONS</div><div class="terms" style="margin-top:3px">${esc(company.termsAndConditions)}</div>` : ""}
  ${estimate.notes ? `<div class="cap" style="margin-top:12px">NOTES</div><div class="terms" style="margin-top:3px">${esc(estimate.notes)}</div>` : ""}
  <div class="sign"><div><div class="muted">For ${esc(companyName)}</div><div class="line">Authorised signatory</div></div></div>
  <div class="foot" style="margin-top:14px"><span>Prepared with XMTO · a XOITT Transformation product</span><span>${esc(estimate.estimateNumber || "")}</span></div>
</div></body></html>`;
}
