// Indian-numbering (lakh/crore) currency formatting shared by every screen and the PDF.
// Intl.NumberFormat("en-IN") does this correctly on Hermes/JSC, so we lean on it rather
// than hand-rolling digit-grouping.

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const inrFormatterDecimal = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatINR(amount, { decimals = false } = {}) {
  const n = Number(amount) || 0;
  return decimals ? inrFormatterDecimal.format(n) : inrFormatter.format(n);
}

export function formatNumber(amount) {
  return new Intl.NumberFormat("en-IN").format(Number(amount) || 0);
}
