// Regenerates packages/shared/src/catalog.js from assets/MTO_Template.xlsx.
//
//   npm run catalog
//
// The workbook is the single source of truth for what an estimator can pick. This script
// mirrors the sheet's own rules rather than inventing new ones:
//
//   Plumbing MTO row:   Item | Material | Primary Size | Secondary Size | Qty | Unit | Remarks
//   Electrical MTO row: Item | Material | Size         | Core           | Qty | Unit | Remarks
//
//   · Item      — data validation on 'Plumbing Library'!B / 'Electrical Library'!B (Active = Yes)
//   · Material  — Plumbing uses the whole Material Master; Electrical only rows 10–17
//   · Size      — Plumbing Size Master / Electrical Size Master
//   · Core      — Core Master (Electrical only)
//   · Unit      — NOT chosen: INDEX/MATCH lookup of the item's Default Unit in the library
//
// needsSecondarySize / needsCore are app hints for which optional column the sheet expects to be
// filled for that item (reducers → secondary size, cables → core). Both columns stay optional for
// every other item, exactly as they are in the sheet.
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "assets", "MTO_Template.xlsx");
const OUT = path.join(ROOT, "..", "..", "packages", "shared", "src", "catalog.js");

const wb = XLSX.readFile(SRC);
const rows = (name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });
const column = (name) =>
  rows(name)
    .slice(1)
    .map((r) => String(r[0]).trim())
    .filter(Boolean);

const CORE_FAMILIES = new Set(["Power Cable", "Control Cable", "Instrument Cable"]);

function library(sheetName, trade) {
  const families = [];
  const items = {};
  rows(sheetName)
    .slice(1)
    .filter((r) => r[0] && r[1] && String(r[3]).trim().toLowerCase() === "yes")
    .forEach(([family, item, unit]) => {
      const f = String(family).trim();
      const name = String(item).trim();
      if (!items[f]) {
        families.push(f);
        items[f] = [];
      }
      if (items[f].some((i) => i.name === name)) return;
      const entry = {
        name,
        unit: String(unit).trim() || "Nos",
        // Reducers take a second size (50 mm → 40 mm); "Pressure Reducing Valve" is a valve, not a reducer.
        needsSecondarySize: trade === "plumbing" && /reduc/i.test(name) && !/pressure/i.test(name),
      };
      if (trade === "electrical") entry.needsCore = CORE_FAMILIES.has(f);
      items[f].push(entry);
    });
  return { families, items };
}

const materials = column("Material Master");
// 'Electrical MTO'!D3:D202 validates against 'Material Master'!$A$10:$A$17 → SS304 … Nylon.
const electricalMaterials = materials.slice(8, 16);

const catalog = {
  plumbing: {
    ...library("Plumbing Library", "plumbing"),
    materials,
    sizes: column("Plumbing Size Master"),
  },
  electrical: {
    ...library("Electrical Library", "electrical"),
    materials: electricalMaterials,
    sizes: column("Electrical Size Master"),
    cores: column("Core Master"),
  },
  materials,
  units: column("Unit Master"),
};

const header = `// GENERATED FILE — do not hand-edit. Run \`npm run catalog\` after changing assets/MTO_Template.xlsx.
//
// Mirrors the workbook's master tabs and the dropdown/lookup rules on its two MTO sheets:
//   · plumbing.materials   = whole Material Master (Plumbing MTO col D validation)
//   · electrical.materials = Material Master rows 10–17 only (Electrical MTO col D validation)
//   · <trade>.items[family][].unit is the Default Unit the sheet looks up per item (Unit column formula)
//   · needsSecondarySize (reducers) / needsCore (cables) mark which optional column the sheet
//     expects for that item; the column itself is available for every row, as in the sheet.
`;

const body = `export const CATALOG = ${JSON.stringify(catalog, null, 2)};

export const TRADE_KEY = { Plumbing: "plumbing", Electrical: "electrical" };

export function tradeCatalog(trade) {
  return CATALOG[TRADE_KEY[trade] || trade] || CATALOG.plumbing;
}

// Flat list of every pickable item for a trade, in library order, each tagged with its family —
// the same flat list the sheet's Item dropdown shows.
export function tradeItems(trade) {
  const cat = tradeCatalog(trade);
  return cat.families.flatMap((family) => cat.items[family].map((it) => ({ ...it, family })));
}

export function findItem(trade, name) {
  return tradeItems(trade).find((it) => it.name === name) || null;
}

// Unit column equivalent of the sheet's INDEX/MATCH: derived from the item, never chosen.
export function unitFor(trade, name) {
  return findItem(trade, name)?.unit || "Nos";
}
`;

fs.writeFileSync(OUT, header + "\n" + body);
const count = (t) => catalog[t].families.reduce((s, f) => s + catalog[t].items[f].length, 0);
console.log(
  `Wrote ${path.relative(ROOT, OUT)}: plumbing ${count("plumbing")} items / ${catalog.plumbing.families.length} families, ` +
    `electrical ${count("electrical")} items / ${catalog.electrical.families.length} families, ` +
    `${materials.length} materials (${electricalMaterials.length} electrical), ` +
    `${catalog.plumbing.sizes.length}+${catalog.electrical.sizes.length} sizes, ${catalog.electrical.cores.length} cores, ${catalog.units.length} units`
);
