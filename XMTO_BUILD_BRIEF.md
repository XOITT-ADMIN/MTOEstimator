# XMTO — Build Brief for Claude Code
### New workflow: internal MTO approval, procurement, site use and project close

> Put this file in the repo root (or `docs/`) and tell Claude Code: *"Read XMTO_BUILD_BRIEF.md and start Phase 1."*
> Repo: `XOITT-ADMIN/MTOEstimator` · Decisions agreed with Suraj on 28 Sept 2026.

---

## 0. Ground rules

- **Web first, mobile view is the main view.** Test with `npx expo start --web` in a phone-sized browser window (about 390 × 844). The desktop view can simply be stretched.
- **No APK / EAS build now.** Don't add native-only modules. Everything must work on Expo web.
- **The web app is already deployed on Render, and so is the API.** Don't break the build or start commands:
  - Build: `npm ci && npm run api:build`
  - Start: `npm run start:prod -w @mto/api`
- **Database is Neon Postgres.** Use Prisma migrations only, never hand-edit tables.
- **Work in phases (section 10).** Finish, test and commit one phase before starting the next.
- **Plain words in the UI.** Short labels, no jargon. The users are site people.
- **Keep the existing look.** Use `apps/mobile/src/ui/` (theme, components). Navy #1F2150, action blue #2F74BA, Poppins.
- **If something in this brief is unclear or conflicts with the code, stop and ask Suraj.** Don't guess. See section 12.

---

## 1. What changes, in one paragraph

XMTO used to make **client quotations** (Draft → Ready → Sent, PDF with tax split, Email/WhatsApp, stock checked at estimate time). It now carries an **internal material request (MTO)** between teams:

1. The Site Supervisor makes the MTO.
2. The Project Manager approves it.
3. Finance confirms the budget (checked by hand).
4. Procurement gives the items from stock or buys them.
5. Logistics delivers to site.
6. The Site Supervisor records daily use and wastage.
7. When the project is installed, the PM closes the project and leftover material goes back to stock.

---

## 2. Keep vs remove

**Keep (don't break):**
- Email-code sign-in, sessions, refresh tokens, app lock, *Settings › Security*
- Company, team invites
- Item library (`CatalogVersion`, CSV import/export, `CatalogProvider`)
- Rates library
- Stock lines + CSV (including `price` as a reference only)
- Offline queue + "NOT SAVED" toast
- WebSocket live events
- Server-issued numbers

**Remove or retire:**
- Stock check + row lock when saving an estimate (`saveEstimate` in `apps/api/src/services/estimates.ts`, `POST /sync/estimates`, error `out_of_stock`).
- "No stock line = not in stock" rule; `checkNewLines` in `InventoryContext`.
- Stock labels on tiles, red "Not in stock" / "Not enough stock" button, red Qty message (`useAddItemWizard.js`, `steps.js`). The Supervisor can add **any item, any quantity**.
- `Company.stockPolicy` (block/warn).
- Stock given back on reject/delete of an estimate (stock no longer moves at estimate time).
- Client quotation (retire in Phase 5; keep working until then):
  - `quotationHtml.js`, `exportEstimate.js`
  - CGST/SGST split, amount in words
  - Email/WhatsApp share of the client PDF
- The "Ready → email admin" hook in `saveEstimate`. It is replaced by per-step emails.

---

## 3. Roles

A member can hold **several roles** (for example PM + Procurement). Each action still needs the matching role.

| Role | Can do |
|---|---|
| **Owner** | Everything; company settings |
| **Admin** | Team, item library, rates, stock lines; cancel an MTO after approval; everything a PM can do |
| **Site Supervisor** (was Estimator) | Create/edit own MTOs in Draft or Rejected; submit; record daily use and wastage; see site balance |
| **Project Manager** | Create/edit projects; approve/reject MTOs; cancel after approval; **close a project** |
| **Finance** | Mark Budget OK or Send back (budget is checked by hand, the app only records the decision) |
| **Procurement** | Per line: issue from stock or buy; receive purchases into stock; mark Ready to dispatch; stock adjustments |
| **Logistics** | Loading check, loading cost, transport details; mark Dispatched and Delivered |
| **Viewer** | Read only |

- Store as `Member.roles` (a list), replacing `Member.role`.
- **Migration:** `ESTIMATOR` → `SITE_SUPERVISOR`, others unchanged.
- *Settings › Team* uses a multi-select of roles.
- Every endpoint checks roles on the **server**. The app hides buttons, but the server is the real check.

---

## 4. Projects (new)

Projects were free text before. Now a project is a **record**, because the PM must be able to close it.

- Fields: `id`, `companyId`, `name`, `siteName` (optional), `status` (`OPEN` | `CLOSED`), `createdById`, `closedById`, `closedAt`, timestamps.
- Only the PM, Admin or Owner can create, rename or close a project.
- Every MTO belongs to **one project**, picked from a list of OPEN projects when creating it.
- **Migration:** create one project per distinct existing project name in each company. Link the old estimates to it.
  - Projects linked only to finished (Ready/Sent) estimates → `CLOSED`.
  - Otherwise → `OPEN`.
- **A closed project takes no new MTOs and no new daily entries.**

---

## 5. MTO statuses and moves

The `Estimate` model stays (rename in UI to "MTO"). Numbering: **`MTO-0001`**, server-issued per company.

- **Migration:** existing `EST-0012` → `MTO-0012` (keep the digits).

| From | To | Who | Comment needed | Notes |
|---|---|---|---|---|
| Draft | Submitted | Site Supervisor (owner of MTO) | No | Needs ≥1 line and an OPEN project |
| Submitted | Approved | PM | No | |
| Submitted | Rejected | PM | **Yes** | Back to Supervisor, lines editable again |
| Rejected | Submitted | Site Supervisor | No | Resubmit after rework |
| Approved | Budget OK | Finance | No | |
| Approved | Sent back | Finance | **Yes** | Goes to PM |
| Sent back | Approved | PM | No | PM re-approves (may first reject to Supervisor) |
| Sent back | Rejected | PM | **Yes** | |
| Budget OK | Ready to dispatch | Procurement | No | Allowed only when every line is fully issued (see 6) |
| Ready to dispatch | Dispatched | Logistics | No | Needs a dispatch record |
| Dispatched | Delivered | Logistics or Site Supervisor | No | Material now counts in the project's site balance |
| Delivered | In use | automatic | – | On the first daily entry for this MTO's project |
| Delivered / In use | Closed | automatic | – | When the PM closes the project |
| Approved … Delivered / In use | Cancelled | PM or Admin | **Yes** | See cancel rule below |

**Rules:**
- **Lines editable only in Draft and Rejected.** The server refuses edits in any other status.
- **Only Drafts can be deleted.** After that, use Cancel.
- **Every move is written to `MtoEvent`** (who, when, from, to, comment). The History tab shows it.
- **Two people acting at once:** the second one gets a clear "Someone already moved this MTO" message.
  - Check the current status inside the transaction.
- **Cancel rule:** material still in the store (issued but not dispatched) goes back to stock (RETURN).
  - Material already delivered to site stays in the project's site balance and returns when the project closes.
  - ⚠️ Confirm this with Suraj before building Cancel (section 12).

---

## 6. Stock and site balance

**Stock changes at exactly these moments.** Nothing else touches stock. Every change is one row in `StockMovement`.

| Moment | Movement | Stock |
|---|---|---|
| Procurement receives purchased items into store | `RECEIPT` | up |
| Procurement issues items for an MTO | `ISSUE` | down |
| PM closes the project, leftover site material returns | `RETURN` | up |
| Cancel before dispatch (issued, not yet sent) | `RETURN` | up |
| Manual correction by Procurement/Admin (reason required) | `ADJUST` | ±, shows the change |

**Rules:**
- **Bought items always go through stock:** RECEIPT first, then ISSUE. Never straight to site.
- **Issuing more than is in stock is refused** ("Only 40 m left of Pipe · PVC · 40 mm").
  - This is the **only** stock check left, and it lives in Procurement, not in estimating.
  - Lock the stock row in the transaction, as the old code did.
- **Daily use and wastage do NOT change stock.** That material already left the store at ISSUE.

**Site balance (per project, per item key).** The item key is item · material · size (· reduces-to size) (· core), as today.

```
site balance = delivered − used − wasted
```

- **delivered** = issued quantities of this project's MTOs that are Delivered / In use.
- One pool per project across **all** its MTOs. Example: 100 m pipe delivered, 50 m used day 1, 10 m day 2 → balance 40 m.
- A daily entry that would push the balance below zero is refused: "Only 40 m of Pipe · PVC · 40 mm on site".
- **At project close:** every item with a balance > 0 creates a `RETURN` movement back to stock. All the project's delivered MTOs → Closed.
- **Wastage is recorded separately from use.** It is never returned to stock.

---

## 7. Data model (Prisma)

Adjust names to fit the existing schema; keep the meaning.

```prisma
enum Role { OWNER ADMIN SITE_SUPERVISOR PROJECT_MANAGER FINANCE PROCUREMENT LOGISTICS VIEWER }

enum MtoStatus { DRAFT SUBMITTED APPROVED REJECTED BUDGET_OK SENT_BACK READY_TO_DISPATCH DISPATCHED DELIVERED IN_USE CLOSED CANCELLED }

enum ProjectStatus { OPEN CLOSED }

enum MovementType { RECEIPT ISSUE RETURN ADJUST }

enum ConsumptionKind { USED WASTED }

model Member {
  // ...existing
  roles Role[]            // replaces `role`
}

model Project {
  id          String        @id @default(cuid())
  companyId   String
  name        String
  siteName    String?
  status      ProjectStatus @default(OPEN)
  createdById String
  closedById  String?
  closedAt    DateTime?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  mtos        Estimate[]
  entries     ConsumptionEntry[]
  @@unique([companyId, name])
}

model Estimate {            // shown as "MTO" in the UI
  // ...existing (lines, rates, total value stay)
  number      String        // MTO-0001
  status      MtoStatus     @default(DRAFT)
  projectId   String
  createdById String
  submittedAt DateTime?
  closedAt    DateTime?
  events      MtoEvent[]
  dispatches  Dispatch[]
}

model EstimateLine {
  // ...existing (item key, qty, rate)
  issuedQty    Decimal @default(0)   // issued from store for this line
  purchasedQty Decimal @default(0)   // bought for this line (received into stock first)
}

model MtoEvent {             // audit trail / History tab
  id         String   @id @default(cuid())
  estimateId String
  actorId    String
  fromStatus MtoStatus?
  toStatus   MtoStatus?
  action     String            // "transition" | "issue" | "receive" | "dispatch" | "cancel" | ...
  comment    String?
  createdAt  DateTime @default(now())
}

model Dispatch {
  id            String    @id @default(cuid())
  estimateId    String
  loadingCheck  Boolean   @default(false)
  loadingCost   Decimal   @default(0)     // ₹
  vehicle       String?
  driver        String?
  notes         String?
  dispatchedAt  DateTime?
  deliveredAt   DateTime?
  createdById   String
}

model ConsumptionEntry {     // daily use and wastage, per project
  id          String          @id @default(cuid())
  companyId   String
  projectId   String
  itemKey     String          // same key format as stock lines
  qty         Decimal
  kind        ConsumptionKind // USED | WASTED
  date        DateTime        // the working day, defaults to today
  note        String?
  createdById String
  createdAt   DateTime        @default(now())
}

model StockMovement {
  id          String       @id @default(cuid())
  companyId   String
  stockLineId String
  type        MovementType
  qty         Decimal      // always positive; type gives direction (ADJUST uses signed qty or a +/- field)
  estimateId  String?
  projectId   String?
  reason      String?      // required for ADJUST
  createdById String
  createdAt   DateTime     @default(now())
}
```

**Other changes:**
- Drop `Company.stockPolicy`.
- `StockLine.stock` stays as the running total. Update it in the **same transaction** as each `StockMovement`.
- Migrations should be safe to run on the live Neon database. Write a data migration for roles, numbers, statuses and projects:
  - `DRAFT` → `DRAFT`
  - `READY` / `SENT` → `CLOSED`

---

## 8. API

**New:**

| Endpoint | Purpose | Roles |
|---|---|---|
| `GET /projects` · `POST /projects` · `PATCH /projects/:id` | list / create / rename | read: all · write: PM, Admin, Owner |
| `POST /projects/:id/close` | close project; returns leftover to stock; closes its MTOs | PM, Admin, Owner |
| `GET /projects/:id/site-balance` | per item: delivered, used, wasted, balance | all |
| `POST /projects/:id/consumption {date, entries:[{itemKey, qty, kind, note}]}` | daily use / wastage | Site Supervisor |
| `GET /projects/:id/consumption?from&to` | daily log | all |
| `POST /mtos/:id/transition {to, comment}` | the state machine in section 5 | per table |
| `GET /mtos/inbox` | MTOs waiting on **my** roles (e.g. Submitted for PM, Approved for Finance) | all |
| `GET /mtos/:id/history` | `MtoEvent` list | all |
| `POST /mtos/:id/procurement {lines:[{lineId, issueQty, purchaseQty}]}` | issue from stock / record purchase need | Procurement |
| `POST /stock/receipts {lines:[{stockLineId, qty, estimateId?}]}` | receive bought items into stock | Procurement |
| `POST /stock/adjust {stockLineId, qty, reason}` | manual correction | Procurement, Admin |
| `POST /mtos/:id/dispatch` · `PATCH /dispatches/:id` | loading check, cost, transport; dispatched / delivered | Logistics |
| `GET /stock/movements?stockLineId&from&to` | stock ledger | all |

**Changed:**
- `PATCH /members/:id {roles:[...]}` takes a list of roles.
- `POST /sync/estimates`:
  - **Remove** the stock check and `out_of_stock`.
  - Accept line edits only in DRAFT / REJECTED.
  - Status can't be changed through sync, only through `/transition`.
  - Keep the offline queue working. A queued edit to an MTO that has since moved on gets refused with a clear reason, shown in the existing "NOT SAVED" toast.
- `GET /sync/estimates` includes `status`, `projectId`, `number`.

**Events (WebSocket):** send `mto`, `project`, `stock`, `consumption` change events. Phones refresh within a second, as today.

**Email (best effort, never blocks the save):** when an MTO reaches a step, email the members holding the next role:

| MTO reaches | Email goes to |
|---|---|
| Submitted | PM |
| Rejected | Supervisor |
| Approved | Finance |
| Sent back | PM |
| Budget OK | Procurement |
| Ready to dispatch | Logistics |
| Delivered | Supervisor + PM |
| Cancelled | everyone on the MTO |

- Plain text: number, project, who, comment, amount.
- Uses the existing `SMTP_URL` (Brevo).

---

## 9. Screens (mobile web first)

- **Home = Inbox.** A "Waiting for you" list based on my roles, plus "My MTOs". Each card shows a status chip.
- **Projects:** a list with OPEN/CLOSED. Tapping one shows its MTOs, site balance and daily log.
  - PM sees **Close project**. The confirm screen lists what goes back to stock.
- **MTO screen tabs:**
  - Items (editable only in Draft/Rejected)
  - Details (project, site, notes)
  - Summary (rates + total value, **no** tax split, no amount in words)
  - **History** (MtoEvent)
- **Action bar at the bottom**, showing only the moves allowed for my roles and this status. Reject / Send back / Cancel open a comment sheet (comment required).
- **Procurement sheet:** per line, shows qty needed, in stock and the issue qty (defaults to min(needed, in stock)). The rest goes to "to buy".
  - Receive button records a purchase into stock.
  - **Ready to dispatch** is enabled only when everything is issued.
- **Dispatch sheet:** loading check tick, loading cost (₹), vehicle, driver, notes → Dispatched → Delivered.
- **Daily use (Supervisor):** pick project → date (default today) → items on site with their balance. Enter Used and Wasted per item → Save.
  - Refuses more than the balance.
- **Library › Stock:** add a **Movements** view per stock line (the ledger).
- **Add-item wizard:** no stock labels, no red button, no blocks.
- **Settings › Team:** multi-role picker.
- All screens must work at phone width on Expo web: tap targets ≥ 44 px, no hover-only actions.

---

## 10. Build phases

Each phase ends with passing tests, working `npx expo start --web`, and a commit.

**Phase 1 — Roles, projects, statuses**
- `Member.roles`, `Project`, `MtoStatus`, `MtoEvent`, MTO-0001 numbering + migrations.
- Transition endpoint with the full table in section 5 (except Ready to dispatch / Dispatched / Delivered / Cancel, which can wait for later phases).
- Remove all stock checks from estimating (section 2).
- Inbox, project picker, History tab, action bar with Submit / Approve / Reject / Resubmit / Budget OK / Send back.
- *Done when:* a Supervisor creates an MTO for a project and submits it; the PM rejects it with a comment; the Supervisor edits and resubmits; the PM approves; Finance sends it back; the PM approves again; Finance marks Budget OK. The History tab shows every step.

**Phase 2 — Approvals polish + emails**
- Comment sheets, per-step emails, inbox counts, clear "someone already moved this" handling, offline refusal messages.

**Phase 3 — Procurement and stock ledger**
- `StockMovement`, issue / receive / adjust, procurement sheet, movements view, Ready to dispatch.
- *Done when:* issuing lowers stock, receiving raises it, over-issue is refused, and every change is in the ledger.

**Phase 4 — Logistics**
- `Dispatch`, loading check and cost, Dispatched, Delivered, Cancel (after Suraj confirms the rule).

**Phase 5 — Site use and project close**
- `ConsumptionEntry` (USED/WASTED), site balance, daily use screen, In use (automatic), Close project with RETURN movements, MTO → Closed.
- Internal MTO PDF (no client tax fields).
- Retire the client quotation code.
- *Done when:* 100 m delivered, 50 m used, 10 m used, 5 m wasted gives a 35 m balance. The PM closes the project, stock goes up by 35 m, and the wastage is not returned.

---

## 11. Tests

- Tests wipe their database. Use `TEST_DATABASE_URL`, never the Neon production URL.
- Cover:
  - every allowed and refused transition, by role
  - comment required on Reject / Send back / Cancel
  - edits refused outside Draft/Rejected
  - numbering MTO-0001 across a company
  - issue beyond stock refused
  - ledger totals equal `StockLine.stock`
  - daily entry beyond site balance refused
  - project close returns the exact balance
  - wastage never returned
  - a closed project refuses new MTOs and entries
  - the data migration on a copy of old data

---

## 12. Open questions — ask Suraj before building these parts

1. **Cancel after delivery:** does material already on site stay in the project's site balance until project close (brief's assumption), or return to stock at once?
2. **Partial delivery:** can one MTO be dispatched in more than one trip, or is it always one dispatch?
3. **Who marks Delivered:** Logistics, the Site Supervisor, or either (brief's assumption: either)?
4. **Reopen a closed project:** allowed (for example by Owner/Admin), or never?
5. **Daily entries by PM:** can a PM also enter daily use, or only the Site Supervisor?
