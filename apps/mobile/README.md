# MTO Estimator (React Native / Expo)

A mobile-first material take-off (MTO) estimating app built around the product
families, materials, sizes, cores and units already defined in
`MTO_Template.xlsx` (Plumbing Library, Electrical Library, Material Master,
Plumbing/Electrical Size Master, Core Master, Unit Master).

## What's in the app

- **Home** — quick stats, a "continue estimate" card, recent estimates.
- **Estimates** — search + filter (status / trade) over every estimate.
- **Estimate detail** — three tabs:
  - *Details* — project, client, site, trade scope, notes, status.
  - *Items* — the running take-off, grouped by trade + product family, swipe-style remove.
  - *Summary* — grouped quantities, item counts, export (Excel/PDF stub) and share.
- **Add item** — a tap-driven bottom sheet that walks the columns of the
  workbook's MTO rows, one column per step, with no "Next" button: picking a
  value moves to the next empty column.
  - *Plumbing MTO*: Item → Material → Primary size → Secondary size → Qty (+ rates, remarks)
  - *Electrical MTO*: Item → Material → Size → Core → Qty (+ rates, remarks)
  - Item is picked from the flat library list (searchable, filterable by family),
    exactly like the sheet's Item dropdown. Unit is never picked — it is looked up
    from the item's Default Unit, like the sheet's Unit formula.
  - Secondary size / Core are optional on every row (as in the sheet); the wizard
    only insists on them for reducers and cable items. The final step is a
    review card where any column can be tapped to change it.
- **Sign in** — email only: name + email, then a 6-digit code emailed by the API (auto-verifies
  on the last digit, 30 s resend timer, "Change" email). Once per phone: after that the app
  stays signed in (short access token + rotating refresh token in the phone's secure keychain).
  Optional **app lock** (Settings › Security) asks for the phone's fingerprint / Face ID / PIN
  on open. *Settings › Security* also lists signed-in devices and can sign them out.
  Without a server (`apiUrl` empty) the code is generated on the device and shown in a DEMO note.
- **Library › Stock** — the stock library, keyed exactly like an estimate line
  (trade · item · material · size · secondary size / core). Each line holds
  stock on hand; *used* is summed live from every estimate, so
  *available = stock − used* moves the moment a line is added, edited or removed.
  - Add a line with the same tap flow as Add Item; tap a line to edit or remove it.
  - *Select → All / tick lines → Bulk update* sets, adds or subtracts stock on many lines.
  - *Download* exports `Trade,Family,Item,Material,Size,Secondary Size,Core,Unit,Stock`;
    *Upload* takes a CSV in that exact format, validates every row against the
    workbook catalog and rejects the whole file with row-by-row errors if
    anything doesn't match (header, trade, item, material, size, core, unit,
    stock). A valid file can replace the library or be merged into it.
  - Add Item shows "N available" under sizes and a stock card on the quantity
    step, flagged red when a line would over-draw stock.
- **Library** — read-only browse of the catalog (families/items, materials, sizes, cores) and the editable rate library.
- **Settings** — profile, data source, re-sync stub.

Data persists on-device via `AsyncStorage`; the app opens pre-loaded with one
sample estimate built from the rows already filled into the Plumbing/Electrical
MTO sheets, plus two empty sample estimates, so it's usable immediately.

## Project structure

```
App.js                        # entry point, providers
src/
  theme/tokens.js              # colors, spacing, radius, type scale
  data/catalog.js               # generated from MTO_Template.xlsx — libraries, materials, sizes, cores, units
  context/EstimatesContext.js   # in-memory state + AsyncStorage persistence
  navigation/RootNavigator.js   # bottom tabs + stack (detail/new/add-item as modal-ish screens)
  components/UI.js              # Card, Pill, Chip, StatTile, Stepper, PrimaryButton, SectionLabel
  screens/
    HomeScreen.js
    EstimatesScreen.js
    NewEstimateScreen.js
    EstimateDetailScreen.js
    AddItemScreen.js
    LibraryScreen.js
    SettingsScreen.js
```

## Running it

Requires Node 18+ and the Expo Go app on your phone (or an iOS/Android simulator).

```bash
npm install
npx expo install --check   # aligns native package versions with your Expo SDK
npm start
```

Then scan the QR code with Expo Go (Android) or the Camera app (iOS), or press
`i` / `a` in the terminal for a simulator.

## Extending the catalog

The catalog is **generated** from `assets/MTO_Template.xlsx` into
`packages/shared/src/catalog.js` (shared with the API; `src/data/catalog.js` just re-exports it) —
do not hand-edit it. After changing the workbook run:

```bash
npm run catalog
```

`scripts/generateCatalog.js` mirrors the sheet's own rules:

- Items come from the Plumbing / Electrical Library tabs (`Active = Yes`), grouped
  by Product Family in library order, each with its Default Unit.
- `plumbing.materials` is the whole Material Master; `electrical.materials` is
  rows 10–17 only (SS304 … Nylon), matching the Electrical MTO material validation.
- Sizes and cores come from the Size / Core Master tabs.
- `needsSecondarySize` is set for reducers (item names containing "Reduc…",
  excluding "Pressure Reducing Valve"); `needsCore` for the three cable families.

Default rates in `packages/shared/src/rates.js` are keyed by (trade, family, item,
material) and must reference combinations that exist in the catalog.

Note: the workbook's own Item dropdowns and Unit formulas still point at the
original library ranges (`'Plumbing Library'!B2:B48`, `'Electrical Library'!B2:B34`)
even though the library tabs now run to rows 82 and 60. The app includes every
active row; extend those ranges in the sheet if you want Excel to match.

## Connecting a team

The app now talks to the MTO API in `apps/api` when `expo.extra.apiUrl` is set (or
`EXPO_PUBLIC_API_URL` when starting Expo). Leave it empty and the app works on one device
exactly as before. See the README at the repo root for how to run and host the API.

## Notes on scope

Without a server this is a single-user prototype (local storage only). With the API it is a
shared company workspace. The "Re-sync library" action is stubbed —
wiring it to a real workbook import (e.g. via a small backend, or
`expo-file-system` + a headless XLSX reader) is the natural next step once the
flows are validated with real estimators.
