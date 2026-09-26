# XMTO app — how the code is laid out

The look of the app comes from the "XMTO – MEP Material Take-off" design (Claude Design).
The code is split in three layers so you can change the design without touching the logic.

```
src/
  ui/          ← how things LOOK (the only place with colours, fonts, sizes)
    theme.js       all design tokens: colours, status colours, fonts, type sizes, spacing, radius
    icons.js       the line icons from the design (add one here, use <Icon name="…" />)
    components/    buttons, cards, chips, fields, tabs, sheets, badges, stock bars, logo…
    index.js       import everything from "../ui"
  features/    ← pieces made for one area of the app (built from ui/)
    estimate/      estimate header, Items / Details / Summary tabs, line card
    addItem/       Add item wizard: rules (useAddItemWizard.js) + step views (steps.js)
    library/       Stock, Rates and Catalog tabs, stock sheets
    settings/      auto-saving profile field, Security section
    estimates.js   helpers: money(), plural(), summarize(), specChips()…
  screens/     ← one file per screen, only puts features + ui together
  context/, inventory/, pricing/, api/, storage/   ← data and sync (no styling)
  utils/quotationHtml.js   the A4 quotation (PDF + preview), uses theme colours
```

## Common changes

| I want to…                         | Change this                                    |
| ---------------------------------- | ---------------------------------------------- |
| Change a brand colour              | `ui/theme.js` → `palette`                      |
| Change a status colour (Draft…)    | `ui/theme.js` → `statusStyles`                 |
| Change the font or a text size     | `ui/theme.js` → `fonts` / `type` (and App.js for loading a new font) |
| Make every button taller           | `ui/theme.js` → `sizes.button`                 |
| Restyle all cards / chips / fields | `ui/components/Card.js`, `Chip.js`, `Field.js` |
| Add an icon                        | `ui/icons.js`                                  |
| Change the quotation PDF           | `utils/quotationHtml.js`                       |
| Change the Add item steps          | `features/addItem/useAddItemWizard.js`         |

## Rules of thumb

- Screens never hard-code a colour or size. Use a token (`colors.navy`) or a component (`<Card>`).
- Text always goes through `<T variant="…">` so fonts stay consistent. Money uses `num` (even-width digits).
- Touch targets are at least 48px, rows at least 64px, main buttons 56px (one hand, gloves on).
- One main (blue) button per screen, at the bottom.
