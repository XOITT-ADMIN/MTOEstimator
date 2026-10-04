import { palette } from "../ui/theme";
import { calculateItemTotal, calculateEstimateBreakdown } from "../pricing/calculations";
import { formatINR } from "./currency";
import { rupeesInWords } from "./amountInWords";

const C = {
  navy: palette.navy,
  ink: palette.ink,
  muted: palette.muted,
  border: palette.border,
  accent: palette.action,
  rule: "#E8ECF3",
  zebra: "#F7F9FC",
  surface: "#FFFFFF",
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

const n2 = (v) => formatINR(v, { decimals: true }).replace("₹", "");

function sizeText(it) {
  const size = it.secondarySize ? `${it.size} × ${it.secondarySize}` : it.size || "";
  return [size, it.core].filter(Boolean).join(" ");
}

function tradeTable(items, trade, startIndex) {
  const rows = items
    .map((it, i) => {
      const rate = (Number(it.materialRate) || 0) + (Number(it.labourRate) || 0);
      const idx = startIndex + i;
      const stripe = idx % 2 === 0 ? "" : ` class="stripe"`;
      return `<tr${stripe}><td class="num">${idx + 1}</td><td class="desc">${esc(it.item)}</td><td>${esc(it.material)}</td><td>${esc(sizeText(it)) || "—"}</td><td class="r">${esc(it.qty)}</td><td class="unit">${esc(it.unit)}</td><td class="r">${n2(rate)}</td><td class="r amt">${n2(calculateItemTotal(it))}</td></tr>`;
    })
    .join("");
  const subtotal = items.reduce((s, it) => s + calculateItemTotal(it), 0);
  return `
    <div class="trade-label">${esc(trade).toUpperCase()}</div>
    <table>
      <thead><tr><th class="num">#</th><th class="desc">Description</th><th>Material</th><th>Size / Spec</th><th class="r">Qty</th><th class="unit">Unit</th><th class="r">Budget rate (₹)</th><th class="r amt">Amount (₹)</th></tr></thead>
      <tbody>${rows}
        <tr class="subtotal-row"><td colspan="7">Subtotal — ${esc(trade)}</td><td class="r amt">${n2(subtotal)}</td></tr>
      </tbody>
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
  const metaParts = [company.address, company.phone, company.email].filter(Boolean);
  const gstin = company.gstin ? `GSTIN ${company.gstin}` : "";

  let runningIndex = 0;
  const tradeSections = trades.map((t) => {
    const tradeItems = items.filter((it) => it.trade === t);
    const html = tradeTable(tradeItems, t, runningIndex);
    runningIndex += tradeItems.length;
    return html;
  }).join("") || `<p style="margin-top:20px;color:${C.muted}">No items logged yet.</p>`;

  const totals = [
    ["Subtotal", n2(b.overall.material + b.overall.labour)],
    ...b.additionalCosts.map((c) => [`${c.label}${c.mode === "percent" ? ` (${c.value}%)` : ""}`, n2(c.amount)]),
    ...(b.discountAmount > 0 ? [["Discount", `− ${n2(b.discountAmount)}`]] : []),
    ["Taxable value", n2(tax.mode === "included" ? b.subtotalAfterDiscount - b.taxAmount : b.subtotalAfterDiscount)],
    ...(half ? [[`CGST ${half}%`, n2(b.taxAmount / 2)], [`SGST ${half}%`, n2(b.taxAmount / 2)]] : []),
  ]
    .map(([l, v]) => `<div class="total-line"><span>${esc(l)}</span><span>${v}</span></div>`)
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  @page { size: A4; margin: 40px 44px 36px; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Roboto, -apple-system, Helvetica, Arial, sans-serif;
    color: ${C.ink}; background: #fff;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  @media screen { body { width: 595px; margin: 0 auto; padding: 40px 44px 36px; } }
  .page { width: 100%; font-size: 9.5px; line-height: 15px; }
  thead { display: table-header-group; }
  tr, .info-card, .total-line, .sign-block { page-break-inside: avoid; break-inside: avoid; }
  .trade-label { page-break-after: avoid; break-after: avoid; }
  .r { text-align: right; }

  /* ── Header ── */
  .header {
    display: flex; justify-content: space-between; align-items: flex-start;
    padding-bottom: 14px;
    border-bottom: 3px solid ${C.navy};
  }
  .brand-name {
    font-size: 22px; line-height: 28px; font-weight: 700;
    color: ${C.navy}; letter-spacing: -0.3px;
  }
  .brand-meta { font-size: 8px; line-height: 13px; color: ${C.muted}; margin-top: 3px; }
  .doc-title {
    font-size: 22px; line-height: 28px; font-weight: 700;
    letter-spacing: 0.22em; color: ${C.navy}; text-align: right;
  }
  .doc-ref {
    font-size: 8.5px; line-height: 14px; color: ${C.muted}; text-align: right; margin-top: 4px;
  }
  .doc-ref strong { color: ${C.ink}; font-weight: 600; }

  /* ── Info cards ── */
  .info-row { display: flex; gap: 12px; margin-top: 16px; }
  .info-card {
    flex: 1; border: 1px solid ${C.rule}; border-radius: 6px;
    padding: 10px 14px; background: ${C.zebra};
  }
  .info-label {
    font-size: 7px; font-weight: 700; letter-spacing: 0.12em;
    color: ${C.muted}; text-transform: uppercase; margin-bottom: 4px;
  }
  .info-value { font-size: 11px; font-weight: 600; color: ${C.ink}; }
  .info-sub { font-size: 8.5px; color: ${C.muted}; margin-top: 2px; }

  /* ── Trade section ── */
  .trade-label {
    font-size: 10px; font-weight: 700; color: ${C.navy};
    letter-spacing: 0.08em; margin: 18px 0 6px;
    padding-bottom: 3px; border-bottom: 1.5px solid ${C.accent};
    display: inline-block;
  }

  /* ── Table ── */
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th {
    padding: 7px 8px; font-size: 7.5px; font-weight: 700;
    letter-spacing: 0.05em; text-transform: uppercase;
    color: #fff; background: ${C.navy}; text-align: left;
    border: none;
  }
  th:first-child { border-radius: 4px 0 0 0; }
  th:last-child  { border-radius: 0 4px 0 0; }
  td {
    padding: 6px 8px; font-size: 9px; line-height: 14px;
    border-bottom: 1px solid ${C.rule};
    font-variant-numeric: tabular-nums;
  }
  tr.stripe td { background: ${C.zebra}; }
  th.num, td.num { width: 28px; text-align: center; color: ${C.muted}; }
  th.desc, td.desc { min-width: 120px; }
  th.unit, td.unit { width: 36px; }
  th.amt, td.amt { min-width: 72px; }
  .subtotal-row td {
    font-weight: 700; font-size: 9px; color: ${C.navy};
    border-bottom: 2px solid ${C.rule}; border-top: 1px solid ${C.rule};
    padding-top: 8px; padding-bottom: 8px; background: ${C.zebra};
  }

  /* ── Totals ── */
  .totals-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
  .totals-box { width: 250px; }
  .total-line {
    display: flex; justify-content: space-between; align-items: baseline;
    padding: 4px 0; font-size: 9px; font-variant-numeric: tabular-nums;
    color: ${C.ink};
  }
  .grand-total {
    display: flex; justify-content: space-between; align-items: baseline;
    font-size: 13px; font-weight: 700; color: ${C.navy};
    border-top: 2px solid ${C.navy}; margin-top: 6px; padding-top: 8px;
  }
  .grand-total .currency { font-size: 10px; font-weight: 600; color: ${C.muted}; margin-right: 2px; }
  .amount-words {
    font-size: 7.5px; font-style: italic; color: ${C.muted};
    text-align: right; margin-top: 4px;
  }

  /* ── Terms / Notes ── */
  .section-label {
    font-size: 8px; font-weight: 700; letter-spacing: 0.1em;
    color: ${C.muted}; text-transform: uppercase; margin-top: 18px; margin-bottom: 4px;
  }
  .section-body {
    font-size: 8.5px; line-height: 14px; color: ${C.ink};
    white-space: pre-line; padding: 8px 10px;
    background: ${C.zebra}; border-radius: 4px; border: 1px solid ${C.rule};
  }

  /* ── Signature ── */
  .sign-block { display: flex; justify-content: flex-end; margin-top: 32px; }
  .sign-inner { width: 200px; text-align: center; }
  .sign-for { font-size: 8.5px; color: ${C.muted}; }
  .sign-line {
    border-top: 1px solid ${C.ink}; margin-top: 36px; padding-top: 4px;
    font-size: 8.5px; font-weight: 600; color: ${C.ink};
  }

  /* ── Footer ── */
  .footer {
    margin-top: 28px; padding-top: 8px;
    border-top: 1px solid ${C.rule};
    display: flex; justify-content: space-between; align-items: center;
    font-size: 7px; color: ${C.muted};
  }
  .footer-brand { font-weight: 600; }
</style></head>
<body><div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="brand-name">${esc(companyName)}</div>
      ${metaParts.length ? `<div class="brand-meta">${metaParts.map(esc).join(" · ")}</div>` : ""}
      ${gstin ? `<div class="brand-meta" style="margin-top:1px">${esc(gstin)}</div>` : ""}
    </div>
    <div>
      <div class="doc-title">QUOTATION</div>
      <div class="doc-ref"><strong>${esc(estimate.estimateNumber || "—")}</strong><br/>${date}</div>
    </div>
  </div>

  <!-- Client / Project -->
  <div class="info-row">
    <div class="info-card" style="flex:2">
      <div class="info-label">Bill to</div>
      <div class="info-value">${esc(estimate.client) || "—"}</div>
      ${estimate.site ? `<div class="info-sub">${esc(estimate.site)}</div>` : ""}
    </div>
    <div class="info-card">
      <div class="info-label">Project</div>
      <div class="info-value">${esc(estimate.name) || "—"}</div>
      ${estimate.site ? `<div class="info-sub">${esc(estimate.site)}</div>` : ""}
    </div>
  </div>

  <!-- Line items by trade -->
  ${tradeSections}

  <!-- Totals -->
  <div class="totals-wrap"><div class="totals-box">
    ${totals}
    <div class="grand-total">
      <span>Grand Total</span>
      <span><span class="currency">₹</span>${n2(b.grandTotal)}</span>
    </div>
    <div class="amount-words">${esc(rupeesInWords(b.grandTotal))}</div>
  </div></div>

  <!-- Terms & Notes -->
  ${company.termsAndConditions ? `<div class="section-label">Terms &amp; Conditions</div><div class="section-body">${esc(company.termsAndConditions)}</div>` : ""}
  ${estimate.notes ? `<div class="section-label">Notes</div><div class="section-body">${esc(estimate.notes)}</div>` : ""}

  <!-- Signature -->
  <div class="sign-block"><div class="sign-inner">
    <div class="sign-for">For ${esc(companyName)}</div>
    <div class="sign-line">Authorised Signatory</div>
  </div></div>

  <!-- Footer -->
  <div class="footer">
    <span>Prepared with <span class="footer-brand">XMTO</span> · a XOITT Transformation product</span>
    <span>${esc(estimate.estimateNumber || "")}</span>
  </div>

</div></body></html>`;
}
