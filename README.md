# XMTO — MEP Material Take-off

A product of [XOITT Transformation](https://xoitt.com). Brand assets and store listing text are in `brand/`.

One company, many field engineers, one shared library (rates + stock). Engineers estimate on
their phones (works offline). Everyone sees live stock, so an item another engineer has
used up shows as out of stock straight away.

```
apps/
  mobile/     Expo / React Native app (the existing app, now connected to the API)
  api/        Node API — Fastify + Prisma + PostgreSQL
packages/
  shared/     catalog, default rates, keys, pricing maths — used by both the app and the API
```

## Quick start (on your computer)

Requires Node 20+ and a PostgreSQL database. The free tier on [Neon](https://neon.tech) is
the easiest option. A local Postgres works too.

```bash
npm install                                  # installs everything (npm workspaces)

cp apps/api/.env.example apps/api/.env       # then set DATABASE_URL and JWT_SECRET
npm run db:migrate                           # creates the tables
npm run db:seed                              # optional demo company (owner@example.com)
npm run api                                  # API on http://localhost:4000

# in a second terminal — point the app at the API
EXPO_PUBLIC_API_URL=http://<your-PC-LAN-IP>:4000 npm run mobile
```

- A phone running Expo Go can't reach `localhost` on your PC. Use your PC's LAN IP
  (e.g. `http://192.168.1.20:4000`) or the hosted URL.
- With no API URL set, the app runs in the old single-device mode.
- On Windows PowerShell: `$env:EXPO_PUBLIC_API_URL="http://192.168.1.20:4000"; npm run mobile`.
  Or put `"apiUrl"` in `apps/mobile/app.json` → `expo.extra`.

**Sign-in codes:** until SMTP is set, the API runs in **demo mode**. The 6-digit code is shown
on the login screen. Before real use, set `SMTP_URL` (for example a Gmail/Zoho app password)
and `OTP_DEMO=false`.

## How it works

- **Company and roles:**
  - *Owner:* created the company and has full control.
  - *Admin:* manages the library (rates, stock), the team, and approves estimates.
  - *Estimator:* a field engineer. Sees and edits only their own estimates.
  - *Viewer:* read-only.
- **Joining:** an owner or admin adds an email in *Settings › Team*. The first time that
  person signs in with that email, they join the company automatically.
- **Library:** rates and stock belong to the company. Only owners and admins change them;
  engineers read them and keep an offline copy. The item catalog can be published in versions
  (`/library/catalog`). The app still uses the bundled catalog for now.
- **Live stock:**
  - Every estimate line that matches a stock line counts as *used*.
  - When an engineer saves, the API locks those stock rows in Postgres and checks what's
    left. If there isn't enough, it refuses the save: "Only 4 m left of Pipe · PVC · 40 mm".
    Two engineers going for the last units at the same moment can't both get them.
  - Every other phone is told over a WebSocket and updates within a second.
  - Rejected or deleted estimates give their stock back.
- **Offline:**
  - The app saves on the phone first and queues changes.
  - Queued changes are sent when the connection comes back, and a banner shows how many
    are waiting.
  - If the server refuses a change (for example, out of stock), the banner explains why and
    the server's copy is put back.
- **Sign-in security:**
  - Email code once per phone. Codes are hashed, expire in 5 min and lock after 5 wrong tries.
  - After that: a 1-hour access token plus a refresh token that renews itself (rotating) and is
    kept in the phone's secure keychain. A phone that isn't used for 60 days needs a new code.
  - Every request checks the device session, so *Sign out of all other devices* and signing
    out a lost phone take effect at once.
  - Optional app lock with the phone's fingerprint / Face ID / PIN.
- **Estimate numbers** (`EST-0001`, …) are given by the server, so they stay unique across
  the whole company.

## API at a glance

| | |
|---|---|
| `POST /auth/otp/request` · `POST /auth/otp/verify` | email code → access token (1 h) + refresh token |
| `POST /auth/refresh` · `POST /auth/logout` | renew tokens (rotating) · sign out this device |
| `GET /auth/sessions` · `DELETE /auth/sessions/:id` · `POST /auth/sessions/revoke-others` | devices signed in · sign one out · sign out all others |
| `GET /me` | user + company + role (accepts a pending invite) |
| `POST /companies` · `GET/PATCH /company` | create company · profile (letterhead, terms) |
| `GET/PATCH/DELETE /members/:id` · `GET/POST/DELETE /invites` | team |
| `GET /sync/:resource` · `POST /sync/:resource {upserts, deletes}` | `estimates`, `stock`, `rates` |
| `GET/POST /library/catalog` | published catalog versions |
| `GET /ws?token=…` | live "something changed" events |
| `GET /health` | health check (also checks the database) |

Tests (they wipe the database you point them at, so use a separate one):

```bash
TEST_DATABASE_URL=postgresql://…/mto_test npm run api:test
```

## Hosting (free / trial)

1. **Database:** create a free Postgres on Neon. Copy the connection string (it ends with
   `?sslmode=require`).
2. **API:** any host that runs Node or Docker.
   - **Render** (free web service): root directory = repo root.
     - Build: `npm ci && npm run api:build`
     - Start: `npm run start:prod -w @mto/api`
     - Set env vars: `DATABASE_URL`, `JWT_SECRET`, `OTP_DEMO`, `SMTP_URL`, `MAIL_FROM`.
     - The free tier sleeps after about 15 minutes, so the first request can take ~30–50 s.
   - **Docker** (Koyeb, Fly.io, Azure App Service, Red Hat OpenShift sandbox):
     `docker build -f apps/api/Dockerfile -t mto-api .`. The container runs database
     migrations on start.
3. **App:** set `expo.extra.apiUrl` to the API's `https://…` URL and build the app as usual.

## Later (the design leaves room for these)

- Email or push notification to admins when an estimate is submitted, with the PDF attached
  or linked. Nodemailer is already in the API, and the triggers would go in
  `services/estimates.ts`.
- PDFs stored on the server (S3-compatible storage such as Cloudflare R2).
- A planner: jobs and sites assigned to engineers.
- Loading the published catalog into the app. The API side already exists.
- Redis pub/sub for the live events, once more than one API instance runs.
