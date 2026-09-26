// CSV format for the stock library — the download and the upload use exactly this shape.
//
//   Trade,Family,Item,Material,Size,Secondary Size,Core,Unit,Stock,Price
//
// Price is the unit price in ₹ (per m / Nos / Set …). Older files without the Price column are
// still accepted: their lines come in without a price, so a Merge keeps the price already saved.
//
// Every value is validated against the catalog generated from MTO_Template.xlsx, so a file
// that was edited by hand and no longer matches the workbook is rejected as a whole, with a
// line-by-line list of what is wrong. Nothing is imported from a file that has any error.
import { tradeCatalog, findItem } from "../data/catalog";

export const STOCK_CSV_HEADER = [
  "Trade",
  "Family",
  "Item",
  "Material",
  "Size",
  "Secondary Size",
  "Core",
  "Unit",
  "Stock",
  "Price",
];

// The header before Price was added — still accepted on upload.
const LEGACY_HEADER = STOCK_CSV_HEADER.slice(0, -1);

const TRADES = ["Plumbing", "Electrical"];
const MAX_ERRORS = 12;

// The key format is shared with the API (packages/shared/src/keys.js).
import { stockKey } from "@mto/shared/keys";

export { stockKey };

function csvEscape(value) {
  const str = String(value ?? "");
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function buildStockCsv(entries) {
  const lines = [STOCK_CSV_HEADER.join(",")];
  entries.forEach((e) => {
    lines.push(
      [e.trade, e.family, e.item, e.material, e.size, e.secondarySize || "", e.core || "", e.unit, e.stock, e.price ?? 0]
        .map(csvEscape)
        .join(",")
    );
  });
  return lines.join("\r\n") + "\r\n";
}

// RFC-4180-ish parser: quoted fields, doubled quotes, CRLF or LF line ends.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const src = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  // drop fully blank lines
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

function norm(v) {
  return String(v ?? "").trim();
}

function ci(list, value) {
  const v = norm(value).toLowerCase();
  return list.find((x) => x.toLowerCase() === v) || null;
}

export class StockCsvError extends Error {
  constructor(problems) {
    const shown = problems.slice(0, MAX_ERRORS);
    const more = problems.length > MAX_ERRORS ? `\n…and ${problems.length - MAX_ERRORS} more` : "";
    super(`The file doesn't match the stock format.\n\n${shown.join("\n")}${more}`);
    this.name = "StockCsvError";
    this.problems = problems;
  }
}

/**
 * Parse + validate an uploaded stock CSV. Returns clean entries or throws StockCsvError.
 * Header must match STOCK_CSV_HEADER exactly (order and names, case-insensitive, trimmed).
 */
export function parseStockCsv(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new StockCsvError(["The file is empty."]);

  const header = rows[0].map((h) => norm(h).toLowerCase());
  const matches = (list) => header.length === list.length && list.every((h, i) => header[i] === h.toLowerCase());
  const hasPrice = matches(STOCK_CSV_HEADER);
  const expected = hasPrice ? STOCK_CSV_HEADER : LEGACY_HEADER;
  if (!hasPrice && !matches(LEGACY_HEADER)) {
    throw new StockCsvError([
      `Header must be exactly: ${STOCK_CSV_HEADER.join(", ")}`,
      `Found: ${rows[0].map(norm).join(", ") || "(blank)"}`,
    ]);
  }

  const problems = [];
  const entries = [];
  const seen = new Map();

  rows.slice(1).forEach((cols, idx) => {
    const line = idx + 2; // 1-based, after header
    const bad = (msg) => problems.push(`Row ${line}: ${msg}`);
    if (cols.length !== expected.length) {
      bad(`expected ${expected.length} columns, found ${cols.length}`);
      return;
    }
    const [tradeRaw, familyRaw, itemRaw, materialRaw, sizeRaw, secRaw, coreRaw, unitRaw, stockRaw, priceRaw = ""] = cols.map(norm);

    const trade = ci(TRADES, tradeRaw);
    if (!trade) return bad(`Trade "${tradeRaw}" must be Plumbing or Electrical`);
    const cat = tradeCatalog(trade);
    const isPlumbing = trade === "Plumbing";

    const found = itemRaw ? findItem(trade, itemRaw) || findItemCi(trade, itemRaw) : null;
    if (!found) return bad(`Item "${itemRaw}" is not in the ${trade} library`);

    if (familyRaw && familyRaw.toLowerCase() !== found.family.toLowerCase()) {
      bad(`Family "${familyRaw}" should be "${found.family}" for ${found.name}`);
    }

    const material = ci(cat.materials, materialRaw);
    if (!material) bad(`Material "${materialRaw}" is not allowed for ${trade} (allowed: ${cat.materials.join(", ")})`);

    const size = ci(cat.sizes, sizeRaw);
    if (!size) bad(`Size "${sizeRaw}" is not a ${trade} size`);

    let secondarySize = null;
    if (isPlumbing) {
      if (secRaw) {
        secondarySize = ci(cat.sizes, secRaw);
        if (!secondarySize) bad(`Secondary Size "${secRaw}" is not a Plumbing size`);
      } else if (found.needsSecondarySize) bad(`${found.name} needs a Secondary Size`);
    } else if (secRaw) bad(`Secondary Size applies to Plumbing only`);

    let core = null;
    if (!isPlumbing) {
      if (coreRaw) {
        core = ci(tradeCatalog("Electrical").cores || [], coreRaw);
        if (!core) bad(`Core "${coreRaw}" is not in the Core list`);
      } else if (found.needsCore) bad(`${found.name} needs a Core`);
    } else if (coreRaw) bad(`Core applies to Electrical only`);

    if (unitRaw && unitRaw.toLowerCase() !== found.unit.toLowerCase()) {
      bad(`Unit "${unitRaw}" should be "${found.unit}" for ${found.name}`);
    }

    const stock = Number(stockRaw);
    if (stockRaw === "" || !Number.isFinite(stock) || stock < 0) bad(`Stock "${stockRaw}" must be a number ≥ 0`);

    // Price: blank = 0 (not set). "₹", spaces and thousands commas are tolerated ("₹1,250.50").
    const priceClean = priceRaw.replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
    const price = priceClean === "" ? 0 : Number(priceClean);
    if (hasPrice && (!Number.isFinite(price) || price < 0)) bad(`Price "${priceRaw}" must be a number ≥ 0`);

    if (!material || !size) return;
    const entry = {
      trade,
      family: found.family,
      item: found.name,
      material,
      size,
      secondarySize,
      core,
      unit: found.unit,
      stock: Math.round(stock * 100) / 100,
    };
    if (hasPrice) entry.price = Math.round(price * 100) / 100;
    entry.key = stockKey(entry);
    if (seen.has(entry.key)) bad(`duplicate of row ${seen.get(entry.key)} (${entry.item} · ${material} · ${size})`);
    else {
      seen.set(entry.key, line);
      entries.push(entry);
    }
  });

  if (problems.length) throw new StockCsvError(problems);
  return entries;
}

function findItemCi(trade, name) {
  const cat = tradeCatalog(trade);
  const n = norm(name).toLowerCase();
  for (const family of cat.families) {
    const hit = cat.items[family].find((i) => i.name.toLowerCase() === n);
    if (hit) return { ...hit, family };
  }
  return null;
}
