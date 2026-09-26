Design a polished, production-quality **mobile app UI** for **XMTO – MEP Material Take-off**, a product of **XOITT Transformation** (https://xoitt.com). This is a redesign of an existing working app: keep every screen and flow listed below, but improve layout, hierarchy, spacing and ease of use. Build it as a clickable React + Tailwind prototype in a **390 × 844 phone frame** (iPhone 14 size), using mock data only. No backend.

## Who uses it

- **Field engineers** (MEP: plumbing + electrical) standing on a construction site. They use one hand, sometimes wear gloves, and work in bright sunlight with patchy internet.
- **Owner / Admin** of a small MEP contracting company. They manage the shared library (rates + stock) and the team, and approve estimates.
- The job: walk a site, log materials (item → material → size → quantity), get a priced estimate, and send a PDF quotation to the client.

## Brand (must follow)

- **Logo:** "XMTO". A geometric "X" (a thick diagonal band from top-right to bottom-left, plus two small triangles at top-left and bottom-right, like the XOIT logo), followed by "MTO" in bold geometric sans. Below it sits a letter-spaced caption: "MEP MATERIAL TAKE-OFF". I will upload the logo PNGs, so use them where the logo appears.
- **Colours** (taken from the XOIT logo's navy-to-blue ramp):
  - Navy `#1F2150`: headings, dark hero panels, app bar on splash/login
  - Blue 700 `#2B4A7A`: primary / structural
  - Blue 600 `#3A6BA3`: secondary
  - Blue 500 `#4589CC`: highlights, active states, logo "O"
  - Action blue `#2F74BA`: all primary buttons (white text)
  - Canvas `#F2F5FA`, surface `#FFFFFF`, borders `#D5DEEB`, text `#151833`, muted text `#4A5270`
  - Status only, never decoration: success `#23845F`, warning amber `#C77A12` (low stock, offline), danger `#C0392B` (out of stock, errors)
- **Typography:** Poppins or Inter. Money and quantities use tabular numbers. Use sentence case; avoid all-caps except small labels.
- **Feel:** clean, confident, engineering-grade. Think "Linear meets a site notebook", not a generic AI-purple look. Use a subtle blueprint-grid texture only on navy hero areas.
- **Footer credit** on login and settings: "A product of [XOIT logo]".

## Design rules (important)

- Touch targets are at least 48px, primary buttons 56px high, list rows at least 64px.
- **No "Edit" / "Open" buttons.** Tapping a row or card opens it, and fields are edited in place and save automatically (show a small "Saved" tick).
- One clear primary action per screen, placed in the thumb zone at the bottom.
- The bottom tab bar has Home · Estimates · (centre + FAB: New estimate) · Library · Settings.
- Show states: empty, loading skeletons, offline, error.
- Money is Indian rupees with Indian digit grouping (₹1,25,450.00). GST is 18%.
- Text contrast meets WCAG AA. The app must be readable in sunlight.

## Screens to design (current layout → what to improve)

### 1. Splash
- **Now:** navy screen, logo, tagline "Plumbing & electrical take-offs, on site", 3-step progress bar, footer "A XOITT Transformation product".
- **Improve:** a centred logo with a gentle entrance, and a thin progress line. Keep it minimal.

### 2. Sign in (email + one-time code)
- **Now:** a navy hero on top (logo, headline "Material take-offs, priced on site.", 3 feature bullets, a blueprint illustration of an estimate card). Below it, a white sheet with Name and Email fields, a "Send code →" button, OR, "Continue with Google", and fine print.
- **Code step:** 6 separate digit boxes that auto-verify on the last digit, "Resend code in 30s", "Change email", and an optional DEMO note showing the code.
- **Improve:**
  - On short phones the hero must never overlap the form. The hero shrinks and the bullets hide.
  - Make the code step feel quick and obvious.

### 3. Company setup (first sign-in, not in a company yet)
- **Now:** two cards, "Start a company" (name field + Create) and "Joining an existing company?" (ask the owner to invite your email + "Check for an invite now"), plus Sign out.
- **Improve:** make it a clear choice between two big options, with a short explanation of how invites work.

### 4. Home
- **Now:**
  - Header: X mark, "Good evening, Suraj", company name, avatar (opens a menu).
  - A navy value card: total estimated value ₹2,905, This month / Estimates / Line items.
  - 3 quick tiles (New estimate, Estimates, Library) and 3 counters (Drafts, Ready, Sent).
  - A "Pick up where you left off" card (EST-0001, name, client · site, trade pills, value, Resume), then a Recent list.
  - An alert strip for unpriced lines.
- **Improve:**
  - Tighter hierarchy, less repetition: the tiles and the FAB duplicate "New estimate".
  - Add a small "Stock alerts" row (2 items low, 1 out) that links to Library › Stock.
  - Add a sync status chip ("All changes saved" / "Offline · 3 waiting").

### 5. Estimates list
- **Now:** title + count, "+ New", a search field, filter chips (All, Draft, Ready, Plumbing, Electrical), and cards (name, client · site, status badge, trade pills, item count, date, value).
- **Improve:**
  - Denser, scannable rows with the value right-aligned.
  - Status badge colours: Draft amber, Ready blue, Sent navy-tint, Approved green, Rejected red.
  - For admins, show "by Ravi" (who created it).
  - Swipe actions: duplicate, delete.

### 6. New estimate
- **Now:** fields for project name, client, site; trade chips (Plumbing, Electrical); "Create estimate".
- **Improve:** a bottom sheet or short form. Remember the last client and site.

### 7. Estimate detail (3 tabs: Details · Items · Summary)
- **Details:**
  - Project, client, site, trade scope, notes, and status chips (Draft, Ready, Sent, Approved, Rejected, Completed).
  - Field engineers only see Draft/Ready/Sent, with the note "Your admin approves it".
- **Items:**
  - Trade counters, search, family filter chips, and a Trade/Family grouping toggle.
  - Grouped cards. Each line shows item · material, size and core chips, "6 m × ₹65.00 + ₹12 labour", line total, and M/L split.
  - A sticky bottom bar with "2 items · 2 trades" and a big "+ Add item".
- **Summary:**
  - A navy card with the grand total.
  - Per-trade material/labour totals, then overall subtotal, additional costs (e.g. Transportation ₹2,500), discount, GST 18% and GRAND TOTAL.
  - Buttons: Export PDF, Share.
- **Improve:**
  - A sticky header showing the estimate number + status.
  - Make adding an item and exporting the PDF the two obvious actions.
  - Show a small "Out of stock" warning on any line that can't be supplied.

### 8. Add item (bottom-sheet wizard, 4 steps, tap-driven, no Next button)
- **Step 1, Item:** Plumbing/Electrical toggle, "Log again" recent chips, search ("Search 81 plumbing items…"), family chips, and a grouped list (Pipe, Braided Hose, 90° Elbow… each with its unit).
- **Step 2, Material:** chips (PVC, UPVC, CPVC, GI, HDPE, Copper…).
- **Step 3, Size:** a size grid (15 mm … 150 mm; electrical 1.5–240 sq.mm), each showing "N available" from stock. Optional secondary size (reducers) or core (2C/3C/4C for cables).
- **Step 4, Quantity & rate:**
  - A summary card of the choices (each row tappable to change it).
  - A big −/+ quantity stepper.
  - A **stock card**: "4 m available · 6 used of 10 · 3 LEFT AFTER". It turns amber when low and red when the quantity is more than what's available.
  - Material rate + labour rate (pre-filled from the library).
  - A sticky footer: line total, "Add to estimate", "Save + add another".
- **Improve:**
  - A clear step progress bar.
  - Big tap targets.
  - Keep the running line total visible.

### 9. Library (tabs: Stock · Plumbing · Electrical · Materials · Sizes · Rates)
- **Stock:**
  - Toolbar: + Add line, Upload CSV, Download CSV, Select (bulk update: set / add / subtract).
  - Filters: All, Plumbing, Electrical, Low stock.
  - Grouped rows: "PVC · 40 mm", a progress bar, "stock 10 · used 6", and on the right "4 m left" (amber under 25%, red "OUT OF STOCK" at 0).
- **Catalog tabs:** read-only browse of families → items with units, materials and sizes.
- **Rates:** trade/family filters. Each row shows item, trade · family · material, "Material ₹65.00 · Labour ₹12.00" and an EDITED badge. Tapping a row opens a rate editor sheet.
- Field engineers see everything read-only: no add/upload/edit controls, and a line "Set by your admin".
- **Improve:** a clearer stock health overview at the top (e.g. 12 lines · 2 low · 1 out).

### 10. Settings
- **Now:**
  - Account card (avatar, name, email, role badge: Owner / Admin / Field engineer / Viewer).
  - A Team row (company initials tile, company name, "3 members · add or manage people", chevron).
  - Company details printed on quotations, edited inline: Name, Address, Phone, GSTIN, Email, and a multi-line Terms & conditions field. Empty fields show "Add address" in blue.
  - Data: Sync status dot, Library source.
  - An outlined Sign out button, and the footer (logo, version, "A product of XOIT").
- **Improve:** grouped iOS-style settings sections, with the sign-out warning shown when changes are unsynced.

### 11. Team
- Company name, member count, "you are the owner".
- A members list (avatar, name, email, role pill). Tapping a person expands it to show role choices (Field engineer – "Makes their own estimates", Admin – "Library, team and approvals", Viewer – "Can look, can't change") and "Remove from team".
- An **Add to team** form: name, email, role chips, and a button.
- A **Pending invites** list with revoke.
- Explain in one line that the invited person signs in with that email and joins automatically.

### 12. Global states
- **Top toast/banner, red:** "NOT SAVED · Only 4 m left of Pipe · PVC · 40 mm — you asked for 6." Tap to dismiss.
- **Amber pill:** "Offline · 3 changes will sync when you're back online".
- Empty states for each list, with a friendly line and one action.
- Skeleton loaders.

### 13. PDF quotation preview (A4, shown in a modal)
- Company letterhead (name, address, phone, GSTIN).
- "QUOTATION" with the estimate number and date, and a client/site box.
- Per-trade tables (Item, Material, Size, Qty, Unit, Rate, Amount).
- Totals block with GST, then terms, signature line, and a small footer: "Prepared with XMTO · a XOITT Transformation product".

## Sample data to use

- **Company:** Aqua MEP Contractors, Whitefield, Bengaluru, GSTIN 29ABCDE1234F1Z5.
- **Users:** Suraj (Owner), Ravi Kumar (Field engineer), Anil (Field engineer), Meera (Admin, pending invite).
- **Estimates:**
  - EST-0001 "Villa 12 — Plumbing & power", Aegis Builders, Whitefield, Draft, ₹2,905
  - EST-0002 "Tower B riser", Sundar Infra, Peenya, Ready
  - EST-0003 "DG yard cabling", Sent
- **Lines:**
  - Pipe · PVC · 40 mm · 6 m · ₹65 + ₹12
  - Power Cable · Copper · 2.5 sq.mm · 4C · 40 m · ₹42 + ₹8
  - Reducer Bush · UPVC · 50 × 40 mm · 2 Nos
  - Ball Valve · Brass · 25 mm · 4 Nos
- **Stock:**
  - PVC 40 mm: 10 on hand, 6 used
  - Copper 2.5 sq.mm 4C: 500 on hand, 40 used
  - Ball Valve 25 mm: 24 on hand, 24 used (out)

## Deliverable

- All screens above, linked so I can click through: Login → Home → Estimates → Estimate detail → Add item → Summary → PDF; plus Library and Settings → Team.
- Include a small **design-system page**: colours, type scale, buttons, chips, status badges, list row, stock bar, input, bottom sheet, toast.
- Keep components consistent so they can be rebuilt in React Native (no web-only effects such as hover-dependent UI).
