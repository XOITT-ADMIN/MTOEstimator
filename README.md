# XMTO — MEP Material Take-off

A product of [XOITT Transformation](https://xoitt.com). Brand assets and store listing text are in `brand/`.

XMTO is a phone-first app for the **material request ("MTO") process on MEP projects** (plumbing and
electrical). A site supervisor raises a material take-off, the project manager approves it, finance
checks the budget, procurement allocates stock or buys, logistics delivers, and site records daily use.
When the job is done the project is closed and leftover material goes back to the project's stock.

One company, many projects, many people. Everything is shared live between phones and works offline.

> The original design brief is in [`XMTO_BUILD_BRIEF.md`](XMTO_BUILD_BRIEF.md). This README describes the
> app **as it is now**; where the two differ (custom roles, project codes, budget rates), this file wins.

---

## Contents

1. [Repository layout](#repository-layout)
2. [Quick start](#quick-start)
3. [Concepts](#concepts) — company, projects, roles & permissions, MTO workflow, stock
4. [The app](#the-app) — screens and how they behave
5. [The API](#the-api)
6. [Data model and migrations](#data-model-and-migrations)
7. [Configuration](#configuration)
8. [Testing](#testing)
9. [Hosting](#hosting)
10. [Conventions](#conventions)

---

## Repository layout

```
apps/
  mobile/     Expo / React Native app (iOS, Android and web)
  api/        Node API — Fastify + Prisma + PostgreSQL
packages/
  shared/     item catalog, default budget rates, stock keys, pricing maths — used by app and API
brand/        logos, store listing text, social image generator
builds/       test APK
XMTO_BUILD_BRIEF.md   the original build brief
```

npm workspaces tie it together (`@mto/mobile`, `@mto/api`, `@mto/shared`). Node 20+ is required.

### Inside `apps/api`

```
prisma/schema.prisma        data model
prisma/migrations/          SQL migrations (see below)
src/app.ts                  Fastify app, error handling, wiring
src/routes/                 auth, company (me/team/roles), projects, mtos, stock, sync, realtime
src/lib/access.ts           who is the caller, what may they do on a project
src/lib/permissions.ts      permission catalogue + built-in roles
src/lib/mtoStatus.ts        the MTO workflow table (status moves → permission needed)
src/services/               estimates (save/list), stock, site stock (balance, returns)
src/seed.ts                 demo company
test/api.test.ts            integration tests
```

### Inside `apps/mobile/src`

```
screens/        Home, Estimates, EstimateDetail, NewEstimate, AddItem, Projects, ProjectDetail,
                Library, Team, Roles, Settings, Login, CompanySetup, PdfPreview
features/       estimate (tabs, action bar), addItem (the tap-driven wizard), library (stock/returns/rates),
                mto (client copy of the workflow table), project, settings
context/        Auth, Company (roles + permissions), Projects, Estimates
inventory/      stock (per project)         pricing/   budget rates + maths
api/client.js   API client: tokens, refresh, live events, central loading state
ui/             design kit (theme, components, icons) — import everything visual from here
```

---

## Quick start

Requires Node 20+ and a PostgreSQL database ([Neon](https://neon.tech)'s free tier works, so does local Postgres).

```bash
npm install                                  # installs everything (npm workspaces)

cp apps/api/.env.example apps/api/.env       # set DATABASE_URL and JWT_SECRET
npm run db:deploy -w @mto/api                # apply the migrations to your database
npm run db:seed                              # optional: demo company, owner is owner@example.com
npm run api                                  # API on http://localhost:4000

# in a second terminal — point the app at the API
EXPO_PUBLIC_API_URL=http://<your-PC-LAN-IP>:4000 npm run mobile
```

- A phone running Expo Go can't reach `localhost` on your PC; use your PC's LAN IP or the hosted URL.
- Web: `npm run mobile:web` (test in a phone-sized window, about 390 × 844).
- Windows PowerShell: `$env:EXPO_PUBLIC_API_URL="http://192.168.1.20:4000"; npm run mobile`, or set
  `expo.extra.apiUrl` in `apps/mobile/app.json`.
- With no API URL the app runs in single-device mode (local storage only, no team, no projects).
- **Sign-in codes:** until `SMTP_URL` is set the API runs in demo mode and shows the 6-digit code on the
  login screen. Set `SMTP_URL` and `OTP_DEMO=false` before real use.

Useful root scripts: `npm run api`, `api:build`, `api:test`, `db:migrate` (dev), `db:seed`, `mobile`,
`mobile:web`, `catalog` (regenerate the bundled item catalog from the workbook).

---

## Concepts

### Company, people and sign-in

- A person belongs to one **company**. The first person to create it is the **Owner**.
- Joining: an owner/admin (or a project's team manager) adds an email. The first time that person signs in
  with that email they join automatically, with any project roles that were set on the invite.
- Sign-in is **email code** (or Google): once per phone. Codes are hashed, expire in 5 minutes and lock after 5
  wrong tries. After that the phone holds a 1-hour access token plus a rotating refresh token in the secure
  keychain; a phone unused for 60 days must sign in again. Every request checks the device session, so
  *Sign out of other devices* takes effect at once. Optional app lock (fingerprint / Face ID / PIN).

### Projects

A project is a site or job. Every MTO belongs to one project.

- Each project has a **name**, an optional **site name**, a **status** (open / closed) and a short
  **project code** (2–12 letters or digits, unique in the company, e.g. `TWRB`).
- The code numbers its MTOs: **`TWRB-MTO-0001`, `-0002`, …** — a counter per project, issued by the server.
  If a title isn't typed, that number *is* the MTO's name. The code can't change once the project has MTOs.
- A project can have a **notification email**: it is emailed when one of its MTOs reaches *Ready to dispatch*.
- **Stock and rates are kept per project.** Closed projects take no new MTOs or daily entries.
- Only an owner/admin creates projects. Renaming/closing is a permission (below).

### Roles and permissions (RBAC)

- **Owner and admin** are organisation-wide and hold **every permission** on every project. Only they manage the
  library (rates, stock lines), the team and the company's roles.
- **Everything else is a company-defined role.** Settings → *Roles & permissions* (owner/admin) lets a company
  add roles, rename them and switch permissions on and off. Roles are defined once and apply the same on every
  project.
- **Who holds a role is set per project** (project screen → *Team*): a person can be Finance on one project and
  Site Supervisor on another, and can hold several roles at once; permissions add up.
- Six built-in roles are seeded for every company — **Site Supervisor, Project Manager, Finance, Procurement,
  Logistics, Viewer**. They can be renamed and re-permissioned but **not deleted**. A custom role can't be
  deleted while someone holds it.

| Group | Permission | Lets the holder |
|---|---|---|
| MTOs | `mto.edit` | create and edit MTOs (drafts / rejected) |
| | `mto.view_all` | see everyone's MTOs (off = only their own) |
| | `mto.submit` | submit and resubmit their own MTOs |
| | `mto.approve` | approve or reject; re-approve after Finance sends back |
| | `mto.budget` | mark Budget OK, or send back |
| | `mto.procure` | allocate stock, buy, mark ready to dispatch |
| | `mto.dispatch` | create and mark dispatches |
| | `mto.deliver` | mark delivered |
| | `mto.cancel` / `mto.close` | cancel / close MTOs (stock is returned) |
| Stock | `stock.in` / `stock.adjust` | stock in purchases / manual corrections |
| Site | `site.use` | record daily use and wastage |
| Project | `project.edit` | rename, set notification email, close the project |
| | `project.team` | add people and set their roles on the project |

The server checks every action (`src/lib/access.ts` → `hasPerm` / `permsIn`); the app only hides buttons.
The built-in roles' default permissions are in `src/lib/permissions.ts`.

### The MTO workflow

```
Draft ──submit──▶ Submitted ──approve──▶ Approved ──budget OK──▶ Budget OK ──ready──▶ Ready to dispatch ──deliver──▶ Delivered
                      │                      │                                                                          │
                   reject                 send back (to PM)                                                         first daily use
                      ▼                      ▼                                                                          ▼
                  Rejected ◀──────────── Sent back                                                                  In use
   (supervisor edits, resubmits)                                                              project/MTO closed ──▶ Closed
   Cancel is available after approval (comment required) and returns unissued stock.
```

- The full move table (who, comment required, notes) is `src/lib/mtoStatus.ts`; the app keeps a copy in
  `features/mto/mtoStatus.js` so the action bar can show the right buttons without a round trip.
- Lines are editable **only in Draft and Rejected**. Only a Draft can be deleted; after that, cancel.
- Every move is recorded (who, when, from, to, comment) and shown on the **History** tab. Two people acting at
  once: the second gets a clear "someone already moved this MTO" message.
- **Mark ready to dispatch** is enabled only when Procurement is complete (every line fully allocated); the
  app shows how many lines are outstanding and the server enforces it too.
- The only workflow email is to the **project's notification email**, when an MTO is marked *Ready to dispatch*.
  Nobody is emailed individually about MTO moves. (Sign-in codes and team invites still email the person concerned.)
  SMTP must be configured.

### Stock

Stock belongs to a **project** (Library → Stock). Each line is keyed
`trade | item | material | size | secondary size | core`, holds *on hand*, an optional reference price, and a ledger.

| Moment | Movement | Effect |
|---|---|---|
| Purchases stocked in | `RECEIPT` ("Stock in") | on hand + |
| Procurement allocates to an MTO | `ISSUE` ("Allocated") | on hand − |
| MTO cancelled | `RETURN` | on hand + |
| MTO or project closed | `RETURN` | leftover (delivered − used − wasted) goes **back to the project's stock** |
| Manual correction (reason required) | `ADJUST` | ± |

Each MTO line has *needed*, *allocated* and *marked to buy*. A purchase marked "to buy" waits in
**Library → Stock → Purchases** until it's stocked in, then it's allocated. The per-project **site balance**
(delivered − used − wasted − returned) is what the daily-use entries draw from. Every movement is visible in each
line's **Ledger**.

### Rates are budgetary

Rates in the library and on MTO lines are **budget rates** (material) and **indicative labour** figures, not
quotations. They pre-fill lines from the project's rate library and can be overridden per line; saved lines keep
their own numbers when the library changes.

---

## The app

- **Home** — what's waiting for you (by your permissions per project), recent MTOs.
- **MTOs** — search/filter; **New MTO** sheet: pick a project, trades, and optionally a name (shown as text with an
  *Edit* button — blank means the automatic `CODE-MTO-nnnn`).
- **MTO detail** tabs: *Details · Items · Procure · Summary · History*, with the action bar (Submit, Approve,
  Reject, Budget OK, …) and an auto-saving indicator.
- **Add item** — a tap-driven bottom sheet that walks the columns of the workbook's MTO rows (Plumbing: item →
  material → size → secondary size → qty; Electrical: item → material → size → core → qty). The bundled catalog is
  generated from `MTO_Template.xlsx` (`npm run catalog`).
- **Projects** — list, create (name + code), and per project: notifications, **Team** (add people, roles via a
  multi-select), MTOs, site balance, recent consumption, returns, record daily use, close project.
- **Library** — Stock, Returns and **Budget rates**; stock and rates
  follow a project picker.
- **Settings** — account, team, **Roles & permissions**, company letterhead, security (devices, app lock), sign out.
- **Loading feedback** — one centred loader (animated bars) shows while any action that changes data is in flight
  (`busy` in `api/client.js`); the MTO screen has its own "Saving…" overlay for autosave. Reads and background
  sync never trigger it.
- **Offline** — the phone saves first and queues changes; a banner shows what's waiting. If the server refuses a
  queued change, the banner says why and the server's copy is restored.
- **Live updates** — a WebSocket tells every phone "X changed" and screens refetch within a second.

---

## The API

All routes except `/auth/*` and `/health` need `Authorization: Bearer <access token>`.

| Area | Routes |
|---|---|
| Auth | `POST /auth/otp/request` · `POST /auth/otp/verify` · `POST /auth/refresh` · `POST /auth/logout` · `GET/DELETE /auth/sessions…` · `POST /auth/sessions/revoke-others` |
| Me / company | `GET/PATCH /me` (roles, project roles, role definitions) · `POST /companies` · `GET/PATCH /company` |
| Roles | `GET /roles` (with permission catalogue) · `POST /roles` · `PATCH/DELETE /roles/:id` |
| Team | `GET /members` · `PATCH/DELETE /members/:id` · `GET/POST /invites` · `DELETE /invites/:email` |
| Projects | `GET/POST /projects` · `PATCH /projects/:id` · `GET /projects/:id/members` · `PUT /projects/:id/members/:userId` · `GET /projects/:id/site-balance` · `GET/POST /projects/:id/consumption` · `GET /projects/:id/returns` · `POST /projects/:id/close` |
| MTOs | `GET /mtos/inbox` · `GET /mtos/:id/history` · `GET /mtos/:id/lines` · `POST /mtos/:id/transition` · `POST /mtos/:id/procurement` · `POST /mtos/:id/dispatch` · `GET /mtos/:id/dispatches` · `PATCH /dispatches/:id` |
| Stock | `POST /stock/receipts` · `GET /stock/pending-purchases` · `POST /stock/adjust` · `GET /stock/returns` · `GET /stock/movements` |
| Sync | `GET /sync/:resource` · `POST /sync/:resource {upserts, deletes}` — `estimates`, `stock?projectId=`, `rates?projectId=` |
| Live | `GET /ws?token=…` · `GET /health` |

Errors come back as `{ code, error }`; the app shows `error` verbatim, so server messages are written for people.

---

## Data model and migrations

Main tables (see `apps/api/prisma/schema.prisma`): `Company`, `User`, `Membership` (owner/admin only),
`OrgRole` (company-defined roles + permissions), `Project`, `ProjectMember` (roles a person holds on a project),
`Invite`, `Estimate` (the MTO; JSON document + status + number), `EstimateLine` (needed/issued/purchased per line),
`MtoEvent` (history), `StockLine` (per project), `StockMovement` (ledger), `ConsumptionEntry` (daily use),
`Dispatch`, `RateOverride`, `Session`, `OtpCode`.

Migrations (`apps/api/prisma/migrations`):

1. `20261004000000_init` — the whole schema up to projects with codes, per-project stock and rates.
2. `20261005000000_custom_roles` — company-defined roles; backfills the six built-in roles for existing companies.
3. `20261006000000_drop_company_library` — removes the company-published item library (`CatalogVersion`). The item catalog
   is now only the built-in one.

```bash
npm run db:deploy -w @mto/api     # apply migrations (production / any database)
npm run db:migrate -w @mto/api    # create a new migration during development
```

Use Prisma migrations only — never hand-edit tables. `prisma migrate reset` wipes a database; only run it against a
throwaway one.

---

## Configuration

`apps/api/.env` (see `.env.example`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (Neon needs `?sslmode=require`) |
| `JWT_SECRET` | signs access tokens, 24+ random characters |
| `SMTP_URL` / `MAIL_FROM` | sign-in codes, invites and workflow emails. Empty = demo mode |
| `OTP_DEMO` | `true` returns the code in the API response — never in production |
| `PORT`, `CORS_ORIGINS` | server port, allowed browser origins |
| `ACCESS_TOKEN_TTL`, `REFRESH_IDLE_DAYS`, `AUTH_RATE_LIMIT` | sign-in lifetime and rate limiting |

App: `EXPO_PUBLIC_API_URL` or `expo.extra.apiUrl` in `apps/mobile/app.json`.

---

## Testing

```bash
TEST_DATABASE_URL=postgresql://…/mto_test npm run api:test
```

The tests **wipe the database you point them at** — use a separate one. Note: `test/api.test.ts` still reflects
the earlier fixed-roles design and needs updating for company-defined roles and project codes.

Type-check the API with `npx tsc --noEmit` in `apps/api`.

---

## Hosting

1. **Database:** a free Postgres on Neon; copy the connection string.
2. **API:** any host that runs Node or Docker.
   - Render: root directory = repo root; build `npm ci && npm run api:build`; start
     `npm run start:prod -w @mto/api` (runs `prisma migrate deploy`, then the server); set the env vars above.
     The free tier sleeps after ~15 minutes.
   - Docker: `docker build -f apps/api/Dockerfile -t mto-api .` then
     `docker run -p 4000:4000 --env-file apps/api/.env mto-api`.
3. **App:** set `expo.extra.apiUrl` to the API's `https://…` URL. Web build: `npm run export:web -w @mto/mobile`.

---

## Conventions

- **Plain words in the UI** — short labels, no jargon; the users are on site. Wording currently in use: *Stock in*
  (receive), *Allocate* (issue to an MTO), *Purchase indent* (procurement save), *Budget rates*.
- **Keep the look** — use `apps/mobile/src/ui` (navy `#1F2150`, action blue `#2F74BA`, Poppins).
- **Server is the authority** — the app hides what you can't do; every rule is re-checked on the server.
- **Excel is the source of truth** for the item catalog: change `MTO_Template.xlsx`, then `npm run catalog`. There is no
  in-app catalog editing or company-published library.
- **Work in small steps** and keep one migration per schema change.

## Roadmap ideas

- Update the API tests for company-defined roles and project codes.
- Make the stock editor's *Save* write an `ADJUST` movement (with a reason) so edits appear in the ledger.
- PDFs stored on the server; push notifications; Redis pub/sub for live events once more than one API instance runs.
