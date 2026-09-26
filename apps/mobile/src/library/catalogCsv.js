// CSV format for the item library — the download and the upload use exactly this shape.
//
//   Type,Trade,Family,Name,Unit,Needs Secondary Size,Needs Core
//
//   Item,Plumbing,Pipe Fitting,Reducing Tee,Nos,Yes,
//   Item,Electrical,Power Cable,Power Cable,m,,Yes
//   Material,Plumbing,,PVC,,,
//   Size,Electrical,,2.5 sq.mm,,,
//   Core,Electrical,,4C,,,
//
// · Type is Item, Material, Size or Core. Family and Unit are for Item rows only.
// · "Needs Secondary Size" (Plumbing items, e.g. reducers) and "Needs Core" (Electrical items,
//   e.g. cables) take Yes / No / blank.
// · Row order is the order the app shows things in.
// The whole file is checked first; nothing is imported from a file that has any error.
import { parseCsv } from "../inventory/stockCsv";
import { TRADES, normalizeCatalog } from "@mto/shared/catalogTools";

export const CATALOG_CSV_HEADER = ["Type", "Trade", "Family", "Name", "Unit", "Needs Secondary Size", "Needs Core"];
const TYPES = ["Item", "Material", "Size", "Core"];
const LIST = { Material: "materials", Size: "sizes", Core: "cores" };
const MAX_ERRORS = 12;

function csvEscape(value) {
  const str = String(value ?? "");
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}
const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const ci = (list, v) => list.find((x) => x.toLowerCase() === norm(v).toLowerCase()) || null;
const yes = (b) => (b ? "Yes" : "No");

export class CatalogCsvError extends Error {
  constructor(problems) {
    const shown = problems.slice(0, MAX_ERRORS);
    const more = problems.length > MAX_ERRORS ? `\n…and ${problems.length - MAX_ERRORS} more` : "";
    super(`The file doesn't match the library format.\n\n${shown.join("\n")}${more}`);
    this.name = "CatalogCsvError";
    this.problems = problems;
  }
}

export function buildCatalogCsv(catalog) {
  const rows = [CATALOG_CSV_HEADER];
  for (const trade of TRADES) {
    const t = catalog[trade.toLowerCase()];
    t.families.forEach((family) =>
      t.items[family].forEach((i) =>
        rows.push(["Item", trade, family, i.name, i.unit, trade === "Plumbing" ? yes(i.needsSecondarySize) : "", trade === "Electrical" ? yes(i.needsCore) : ""])
      )
    );
    (t.materials || []).forEach((v) => rows.push(["Material", trade, "", v, "", "", ""]));
    (t.sizes || []).forEach((v) => rows.push(["Size", trade, "", v, "", "", ""]));
    if (trade === "Electrical") (t.cores || []).forEach((v) => rows.push(["Core", trade, "", v, "", "", ""]));
  }
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

// Returns { catalog, counts, trades } — `catalog` holds only what the file lists (a trade with
// no rows is left empty) — or throws CatalogCsvError.
export function parseCatalogCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new CatalogCsvError(["The file is empty."]);
  const header = rows[0].map((h) => norm(h).toLowerCase());
  const expected = CATALOG_CSV_HEADER.map((h) => h.toLowerCase());
  if (header.length !== expected.length || header.some((h, i) => h !== expected[i])) {
    throw new CatalogCsvError([`Header must be exactly: ${CATALOG_CSV_HEADER.join(", ")}`, `Found: ${rows[0].map(norm).join(", ") || "(blank)"}`]);
  }

  const cat = {
    plumbing: { families: [], items: {}, materials: [], sizes: [] },
    electrical: { families: [], items: {}, materials: [], sizes: [], cores: [] },
  };
  const counts = { Item: 0, Material: 0, Size: 0, Core: 0 };
  const trades = new Set();
  const problems = [];
  const seen = new Map();

  rows.slice(1).forEach((cols, idx) => {
    const line = idx + 2;
    const bad = (msg) => problems.push(`Row ${line}: ${msg}`);
    if (cols.length !== expected.length) return bad(`expected ${expected.length} columns, found ${cols.length}`);
    const [typeRaw, tradeRaw, familyRaw, nameRaw, unitRaw, secRaw, coreRaw] = cols.map(norm);

    const type = ci(TYPES, typeRaw);
    if (!type) return bad(`Type "${typeRaw}" must be Item, Material, Size or Core`);
    const trade = ci(TRADES, tradeRaw);
    if (!trade) return bad(`Trade "${tradeRaw}" must be Plumbing or Electrical`);
    const t = cat[trade.toLowerCase()];
    if (!nameRaw) return bad(`Name is empty`);
    if (nameRaw.length > 120) return bad(`Name is longer than 120 letters`);

    const dupKey = `${type}|${trade}|${nameRaw.toLowerCase()}`;
    if (seen.has(dupKey)) return bad(`"${nameRaw}" is already on row ${seen.get(dupKey)}`);

    const flag = (raw, col) => {
      if (!raw) return false;
      if (/^(yes|y|true|1)$/i.test(raw)) return true;
      if (/^(no|n|false|0)$/i.test(raw)) return false;
      bad(`${col} "${raw}" must be Yes or No`);
      return false;
    };

    if (type === "Item") {
      if (!familyRaw) return bad(`Family is empty for item "${nameRaw}"`);
      if (!unitRaw) return bad(`Unit is empty for item "${nameRaw}"`);
      if (unitRaw.length > 20) return bad(`Unit "${unitRaw}" is too long`);
      if (trade === "Plumbing" && coreRaw) bad(`Needs Core is for Electrical items only`);
      if (trade === "Electrical" && secRaw) bad(`Needs Secondary Size is for Plumbing items only`);
      const family = t.families.find((f) => f.toLowerCase() === familyRaw.toLowerCase()) || familyRaw;
      if (!t.items[family]) {
        t.families.push(family);
        t.items[family] = [];
      }
      const item = { name: nameRaw, unit: unitRaw };
      if (trade === "Plumbing") item.needsSecondarySize = flag(secRaw, "Needs Secondary Size");
      else item.needsCore = flag(coreRaw, "Needs Core");
      t.items[family].push(item);
    } else {
      if (familyRaw || unitRaw || secRaw || coreRaw) bad(`${type} rows only use Type, Trade and Name`);
      if (type === "Core" && trade !== "Electrical") return bad(`Cores are for Electrical only`);
      t[LIST[type]].push(nameRaw);
    }
    seen.set(dupKey, line);
    counts[type]++;
    trades.add(trade);
  });

  if (problems.length) throw new CatalogCsvError(problems);
  if (!counts.Item && !counts.Material && !counts.Size && !counts.Core) throw new CatalogCsvError(["The file has a header but no rows."]);
  return { catalog: cat, counts, trades: Array.from(trades) };
}

// For "Replace all": the file becomes the whole library. A trade the file doesn't mention at all
// is kept as it is, so a Plumbing-only file can't wipe Electrical by accident.
export function replaceFromCsv(current, parsed) {
  const next = JSON.parse(JSON.stringify(current));
  for (const trade of parsed.trades) next[trade.toLowerCase()] = parsed.catalog[trade.toLowerCase()];
  return normalizeCatalog(next);
}
