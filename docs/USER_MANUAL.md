# XMTO User Manual

**XMTO – MEP Material Take-off** helps your team raise, approve, buy, deliver and track the material for a job — from
a phone, on site, even without signal.

This guide is for everyone who uses the app: site supervisors, project managers, finance, procurement, logistics,
admins and owners. Start with **Part 1**, then read the part for your role.

---

## Part 1 — The basics

### 1.1 What XMTO does

A job (a **project**) needs material. Someone on site writes down what is needed — a **material take-off**, or
**MTO**. The MTO then travels through your team:

```
Site Supervisor  →  Project Manager  →  Finance  →  Procurement  →  Logistics  →  Site
   raises & submits     approves           checks budget   allocates / buys   delivers     records daily use
```

When the job is finished, the project is **closed** and any material left over goes back to the project's stock.

### 1.2 Signing in

1. Open the app and enter your **name** and **email**, then tap **Send code**.
2. Type the 6-digit code that arrives by email. It fills in automatically when you type the last digit.
3. You only do this **once per phone**. After that the app keeps you signed in.

Notes:
- Use the **same email** your admin or project manager added. That is how the app knows which company and
  projects are yours.
- No code? Wait for the 30-second timer, then tap resend. Check spam. After 5 wrong tries the code locks — ask for a
  new one.
- A phone that hasn't been used for 60 days asks for a new code.

### 1.3 Joining a company

- **You were invited:** after signing in you land in your company automatically.
- **You are starting the company:** choose **Start a company**, give it a name — you become the **Owner**.
- If you see *"Join my company"* and nothing happens, your admin hasn't added your email yet. Ask them.

### 1.4 Finding your way around

The bar at the bottom has five places, plus a big **+** button in the middle:

| Tab | What it's for |
|---|---|
| **Inbox** | MTOs waiting for **you** to act, and the ones you started |
| **MTOs** | Every MTO you can see; search and filter |
| **+** | Start a new MTO |
| **Projects** | Your projects, their team, site balance and closing |
| **Library** | Stock, returns and budget rates |
| **Settings** | Your account, team, roles, security, company details |

### 1.5 What you can see and do depends on your role

Your company decides what each role can do, and **you are given roles per project**. You might be a *Site
Supervisor* on one project and *Finance* on another. If a button or tab is missing, your role on that project doesn't
allow it — ask your project manager or admin.

### 1.6 Working offline

- The app **saves on your phone first**. With no signal you can keep working.
- A banner shows how many changes are waiting. They send themselves when the connection returns.
- If the server refuses a waiting change, the banner tells you why and your screen goes back to the server's version.
- Actions that need an answer from the server (submitting, approving, closing a project…) need a connection.

### 1.7 Loading and saving

- On the MTO screen the header shows **Saved** or **Saving…** next to the status. A spinner appears in the middle if
  saving takes a moment.
- When you tap an action (Submit, Approve, …) a centred loader says **Please wait…**. Wait for it to finish before
  tapping anything else.

---

## Part 2 — Site Supervisor: raising an MTO

### 2.1 Start a new MTO

1. Tap the **+** button (or **New MTO** on the MTOs tab).
2. **MTO name** — shown as text, for example `TWRB-MTO-(next number)`. You don't have to type anything: the
   number is added automatically (`TWRB` is the project's code; `0001`, `0002`… count up). Tap **Edit** only if you
   want your own name; **Use automatic name** switches back.
3. **Project** — pick the project this material is for. (Only open projects appear.)
4. **Trades in this job** — tap *Plumbing*, *Electrical* or both.
5. Tap **Create MTO**.

### 2.2 Add items

On the **Items** tab tap **Add item**. A sheet walks you through one step at a time — **picking a value moves to
the next step**, there is no Next button:

- **Plumbing:** Item → Material → Size → *Reduces to* (only for reducers) → Qty
- **Electrical:** Item → Material → Size → Core → Qty

Tips:
- You can search the item list or filter it by family.
- The unit (m, Nos, Kg…) is filled in for you.
- The last step shows a **review card** — tap any value to change it. Add a **remark** if needed.
- **Budget rates** (material and labour) fill in from the project's library. They are budget figures and indicative
  labour only; you can change them for this line without changing the library.
- Add any item and any quantity. The app does not stop you if stock is low — procurement deals with that later.

On the Items tab you can edit, duplicate or remove a line. Edits are only possible while the MTO is a **Draft** or
**Rejected**.

### 2.3 Details, Summary and notes

- **Details** tab — job, client, site, project, trades and notes. Everything saves as you type.
- **Summary** tab — grouped quantities and budget totals. You can add extra costs and discounts here, and export a
  PDF of the take-off.

### 2.4 Submit

When the MTO is ready, tap **Submit**. It needs at least one item and an open project. After submitting you can no
longer edit it — your project manager takes it from here.

### 2.5 If it is rejected

A rejected MTO comes back to your **Inbox** with the project manager's comment. Fix the lines and tap **Resubmit**.

### 2.6 Confirm delivery

When material arrives, an MTO that is *Ready to dispatch* shows **Mark delivered**. Tap it once the material is on
site. From then on it counts in the project's **site balance**.

### 2.7 Record daily use

Open the project (**Projects** tab) → **Record daily use**. For the day, enter how much of each item was **used** and
how much was **wasted**, with an optional note, then **Save**.

- You can only record up to what is on site — the app shows the remaining balance.
- The first entry moves delivered MTOs to **In use**.
- Closed projects take no new entries.

---

## Part 3 — Project Manager: approvals and running the project

### 3.1 Approve or reject

Submitted MTOs appear in your **Inbox** under *Needs your action*. Open one, check the items, then:

- **Approve** — sends it to Finance.
- **Reject** — a **comment is required**, so the supervisor knows what to fix. It goes back to them.

If Finance **sends an MTO back**, it returns to you: **Re-approve** it, or **Reject** it to the supervisor.

### 3.2 Cancel or close an MTO

- **Cancel** (after approval, comment required) — stock not yet delivered goes back to the project's stock.
- **Close MTO** (once delivered or in use) — material that was delivered but not used or wasted goes back to the
  project's stock automatically.

### 3.3 Manage the project team

Open the project → **Team**.

- **Change a person's roles:** tap their name and tick the roles they hold on **this project**. They can hold more
  than one.
- **Add someone:** tap **Add person to this project**, enter their name and the email they sign in with, and choose
  roles from the dropdown (tap to select several, then **Done**). If they are already in the company they get the
  roles straight away; if not, they are invited and join with those roles when they first sign in.
- Invited-but-not-yet-signed-in people show as **Invited**.

### 3.4 Project settings

On the project screen:

- **Notify by email when Ready** — an address that is emailed whenever one of this project's MTOs reaches *Ready to
  dispatch*. Saves automatically once you type a full address.
- **Site balance** — what has been delivered, used, wasted and what's left, per item.
- **Recent consumption** and **Returned** (after closing) — each can be exported as a CSV.

### 3.5 Close the project

When installation is complete, tap **Close project**.

- Every MTO still moving (Submitted, Approved, Ready to dispatch…) must be finished or cancelled first — the app
  names the one that is blocking.
- Everything delivered or in use is marked **Closed**, and all leftover material is returned to the project's stock.
- A closed project takes no new MTOs or daily entries.

---

## Part 4 — Finance

Approved MTOs appear in your **Inbox**. You check the budget yourself, outside the app; XMTO only records your decision.

- **Mark budget OK** — sends it on to Procurement.
- **Send back** — a **comment is required**; it returns to the project manager.

---

## Part 5 — Procurement

### 5.1 Allocate and buy

Budget-OK MTOs appear in your **Inbox**. Open one and go to the **Procure** tab. For each line you see:

- **Needed**, **Allocated** and **In stock**.
- **Allocate from stock** — how much to give from the project's stock (pre-filled with what stock can cover).
- **To buy (ext.)** — how much has to be bought.

Tap **Purchase indent** to save. Lines marked to buy show **Waiting for purchase**.

- **Purchase indent** is greyed out when everything still outstanding is already marked to buy — there is nothing more
  to decide until the purchase arrives.

### 5.2 Stock in what you bought

When bought material arrives, open **Library → Stock → Purchases**, pick the line and choose **Stock in & allocate**.
It is added to the project's stock and allocated to the MTO that was waiting for it.

### 5.3 Mark ready to dispatch

When **every line is fully allocated**, the **Mark ready to dispatch** button on the MTO becomes active. Until then
it is disabled and a message tells you how many lines are still short. If the project has a notification email, it
is emailed now.

### 5.4 Stock library

**Library → Stock** (pick the project at the top):

- Each card shows on-hand stock. Tap a card to **Save** a corrected quantity or unit price, view its **Ledger** (every
  Stock in, Allocated, Return and Adjust movement) or **Remove** the line.
- **Select → Bulk update** sets, adds or subtracts stock on many lines at once.
- **Download** / **Upload** a stock CSV — an upload is checked row by row and rejected as a whole if anything
  doesn't match the catalog.
- Changes to stock made on this screen are corrections made by hand — keep a note of why you made them.

---

## Part 6 — Logistics

MTOs that are **Ready to dispatch** appear in your **Inbox**.

- Load and send the material.
- When it reaches site, open the MTO and tap **Mark delivered**. Site supervisors can do this too. The app doesn't keep
  separate loading or vehicle details.

---

## Part 7 — Admins and Owners

Owners and admins have every permission on every project.

### 7.1 Team

**Settings → Team** (or **Settings → your company name**):

- **Add to team** — name and sign-in email. They join the company when they first sign in. Give them a project role
  from each project's **Team** section afterwards.
- Tap a person to make them an **Admin** or **Remove from team**. The owner can't be changed or removed.
- **Pending invites** can be revoked.

### 7.2 Projects

**Projects → New project:** give it a **name**, a **project code** (2–12 letters or digits, e.g. `TWRB`) and an
optional site name. The code numbers every MTO in the project. It can't be changed once the project has MTOs.

### 7.3 Roles & permissions

**Settings → Roles & permissions.** Roles are defined once for the whole company and apply on every project.

- Tap a role to **rename** it, change its description and switch **permissions** on and off, then **Save**.
- **Add a role** to create your own (for example *Site Engineer*, *Store Keeper*).
- Built-in roles (Site Supervisor, Project Manager, Finance, Procurement, Logistics, Viewer) can be renamed and
  re-permissioned but **not deleted**. A custom role can't be deleted while someone holds it.
- Who holds which role is chosen **per project**, in the project's **Team** section.

Permissions you can switch on or off per role:

| Group | Permission |
|---|---|
| MTOs | Create and edit MTOs · See everyone's MTOs (off = only their own) · Submit MTOs · Approve or reject · Budget check · Procurement · Dispatch · Mark delivered · Cancel · Close |
| Stock | Stock in purchases · Adjust stock |
| Site | Record daily use |
| Project | Edit and close the project · Manage the project team |

### 7.4 Library

**Library** has these sections:

- **Stock** and **Budget rates** — kept **per project**; use the project picker at the top.
- **Returns** — material that came back to a project's stock when MTOs or projects were closed.

The list of items you can pick when adding to an MTO (plumbing and electrical) is built into the app and is the same for
every company.

**Budget rates:** tap a row to change the budget material rate and indicative labour figure. New lines use them; lines
already in MTOs keep theirs. *Reset to catalog default* undoes your change.

### 7.5 Company details

**Settings → On your quotations:** company name, address, phone, GSTIN, email and terms. Changes save as you type.

---

## Part 8 — Everyone: account and security

**Settings → Security**

- **App lock** — ask for your fingerprint, Face ID or PIN each time the app opens.
- **Signed-in devices** — see where you're signed in and sign a device out. **Sign out other devices** signs out
  everything except this phone — use it if a phone is lost.

**Settings → Sign out** signs you out of this phone. Your work is safe on the server.

---

## Part 9 — Quick reference

### MTO statuses

| Status | Meaning | Who acts next |
|---|---|---|
| **Draft** | Being written | Site Supervisor |
| **Submitted** | Waiting for approval | Project Manager |
| **Rejected** | Sent back with a comment | Site Supervisor |
| **Approved** | Waiting for the budget check | Finance |
| **Sent back** | Finance returned it | Project Manager |
| **Budget OK** | Ready for procurement | Procurement |
| **Ready to dispatch** | All lines allocated | Logistics |
| **Delivered** | On site | Site Supervisor (daily use) |
| **In use** | Being used on site | Project Manager (close) |
| **Closed** | Finished; leftover returned | — |
| **Cancelled** | Stopped; unissued stock returned | — |

### Words you'll see

| Word | Meaning |
|---|---|
| **MTO** | Material take-off — the list of material a job needs |
| **Allocate** | Give stock to an MTO |
| **Stock in** | Add bought material to the project's stock |
| **Purchase indent** | Procurement's save: what to allocate and what to buy |
| **Site balance** | Delivered − used − wasted − returned, per item |
| **Budget rate** | An indicative price, not a quotation |

### When something doesn't work

| What you see | What to do |
|---|---|
| A button is missing or greyed out | Your role on this project doesn't allow it, or the MTO isn't in the right status. The message under the button says which. |
| "Someone already moved this MTO" | A colleague acted first. Pull down or reopen the MTO and check its status. |
| "Procurement isn't complete" | Not every line is allocated yet. Finish it on the **Procure** tab. |
| A banner says changes are waiting | You're offline; they'll send when the connection returns. |
| You can't see a project | You haven't been added to it. Ask the project manager or an admin. |
| No sign-in code | Check spam, wait for the timer, request again. Make sure you used the email you were invited with. |
