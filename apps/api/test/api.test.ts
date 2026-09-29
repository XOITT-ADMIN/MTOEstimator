// End-to-end API tests against a real Postgres.
//   TEST_DATABASE_URL=postgresql://… npm test      (the database is wiped, never point at real data)
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { after, before, describe, test } from "node:test";

import WebSocket from "ws";

import { buildApp } from "../src/app.js";
import { createDb, type Db } from "../src/db.js";
import { loadEnv } from "../src/env.js";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("Set TEST_DATABASE_URL to a throwaway database to run the tests.");

const env = loadEnv({ DATABASE_URL: url, JWT_SECRET: "test-secret-test-secret-test-secret", OTP_DEMO: "true", PORT: "0", AUTH_RATE_LIMIT: "1000" });
let db: Db;
let app: Awaited<ReturnType<typeof buildApp>>["app"];

type J = Record<string, any>;
async function call(method: string, path: string, token?: string, body?: unknown): Promise<{ status: number; json: J }> {
  const res = await app.inject({ method: method as "GET", url: path, headers: token ? { authorization: `Bearer ${token}` } : {}, payload: body as object });
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : {} };
}

async function signInFull(email: string, name: string, device = { name: "Test phone", platform: "android" }) {
  const r1 = await call("POST", "/auth/otp/request", undefined, { email, name });
  assert.equal(r1.status, 200, JSON.stringify(r1.json));
  const r2 = await call("POST", "/auth/otp/verify", undefined, { email, code: r1.json.demoCode, device });
  assert.equal(r2.status, 200, JSON.stringify(r2.json));
  return r2.json as { accessToken: string; refreshToken: string; sessionId: string };
}
async function signIn(email: string, name: string) {
  return (await signInFull(email, name)).accessToken;
}

const line = (id: string, qty: number) => ({ id, trade: "Plumbing", family: "Pipe", item: "Pipe", material: "PVC", size: "40 mm", secondarySize: null, core: null, qty, unit: "m" });
const estimate = (id: string, projectId: string, qty: number, extra: J = {}) => ({ id, name: `Est ${id}`, projectId, updatedAt: Date.now(), items: [line(`${id}-l1`, qty)], ...extra });
const PIPE_KEY = "Plumbing|Pipe|PVC|40 mm||";

let owner: string, eng1: string, eng2: string, pm: string, finance: string;

before(async () => {
  execSync("npx prisma migrate reset --force", { env: { ...process.env, DATABASE_URL: url, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes" }, stdio: "pipe" });
  db = createDb(url);
  ({ app } = await buildApp({ db, env, logger: false }));
  await app.listen({ port: 0, host: "127.0.0.1" });
});

after(async () => {
  await app.close();
  await db.$disconnect();
});

describe("company + team", () => {
  test("owner signs in, creates a company, invites two engineers who auto-join", async () => {
    owner = await signIn("owner@test.dev", "Owner");
    let me = await call("GET", "/me", owner);
    assert.equal(me.json.membership, null);

    const c = await call("POST", "/companies", owner, { name: "Katvora Test" });
    assert.equal(c.status, 200);
    assert.deepEqual(c.json.membership.roles, ["owner"]);

    for (const [email, name] of [["eng1@test.dev", "Ravi"], ["eng2@test.dev", "Anil"]]) {
      const inv = await call("POST", "/invites", owner, { email, name, roles: ["site_supervisor"] });
      assert.equal(inv.status, 200, JSON.stringify(inv.json));
    }
    await call("POST", "/invites", owner, { email: "pm@test.dev", name: "Priya", roles: ["project_manager"] });
    await call("POST", "/invites", owner, { email: "finance@test.dev", name: "Farhan", roles: ["finance"] });
    eng1 = await signIn("eng1@test.dev", "Ravi");
    eng2 = await signIn("eng2@test.dev", "Anil");
    pm = await signIn("pm@test.dev", "Priya");
    finance = await signIn("finance@test.dev", "Farhan");
    me = await call("GET", "/me", eng1);
    assert.deepEqual(me.json.membership.roles, ["site_supervisor"]);
    assert.equal(me.json.company.name, "Katvora Test");
    await call("GET", "/me", eng2);
    // /me is what accepts a pending invite (the app calls it right after sign-in) — the PM and
    // Finance accounts below need their membership to exist before they can be used.
    assert.deepEqual((await call("GET", "/me", pm)).json.membership.roles, ["project_manager"]);
    assert.deepEqual((await call("GET", "/me", finance)).json.membership.roles, ["finance"]);

    const members = await call("GET", "/members", owner);
    assert.equal(members.json.length, 5);
    assert.equal((await call("GET", "/invites", owner)).json.length, 0);
  });

  test("admin can hold more than one role at once", async () => {
    const set = await call("PATCH", `/members/${(await call("GET", "/members", owner)).json.find((x: J) => x.email === "pm@test.dev").id}`, owner, {
      roles: ["project_manager", "procurement"],
    });
    assert.equal(set.status, 200, JSON.stringify(set.json));
    assert.deepEqual(set.json.roles.sort(), ["procurement", "project_manager"]);
    // back to just PM for the rest of the tests
    await call("PATCH", `/members/${set.json.id}`, owner, { roles: ["project_manager"] });
  });

  test("engineers can't invite or change the company", async () => {
    assert.equal((await call("POST", "/invites", eng1, { email: "x@test.dev" })).status, 403);
    assert.equal((await call("PATCH", "/company", eng1, { profile: { name: "Hacked" } })).status, 403);
  });

  test("wrong OTP is refused, and locks out after 5 tries", async () => {
    await call("POST", "/auth/otp/request", undefined, { email: "lock@test.dev" });
    for (let i = 0; i < 5; i++) assert.equal((await call("POST", "/auth/otp/verify", undefined, { email: "lock@test.dev", code: "000000" })).status, 400);
    const r = await call("POST", "/auth/otp/verify", undefined, { email: "lock@test.dev", code: "000000" });
    assert.match(r.json.error, /Too many/);
  });
});

describe("library + stock", () => {
  test("only admins change stock and rates", async () => {
    const bad = await call("POST", "/sync/stock", eng1, { upserts: [{ trade: "Plumbing", item: "Pipe", material: "PVC", size: "40 mm", stock: 999 }] });
    assert.equal(bad.json.results[0].ok, false);
    assert.equal(bad.json.results[0].code, "forbidden");

    const ok = await call("POST", "/sync/stock", owner, { upserts: [{ trade: "Plumbing", family: "Pipe", item: "Pipe", material: "PVC", size: "40 mm", unit: "m", stock: 10 }] });
    assert.equal(ok.json.results[0].ok, true);
    assert.equal(ok.json.results[0].id, PIPE_KEY);

    const rate = await call("POST", "/sync/rates", owner, { upserts: [{ id: "Plumbing::Pipe::Pipe::PVC", materialRate: 70, labourRate: 13 }] });
    assert.equal(rate.json.results[0].ok, true);
    const rates = await call("GET", "/sync/rates", eng1);
    assert.deepEqual(rates.json.items, [{ id: "Plumbing::Pipe::Pipe::PVC", materialRate: 70, labourRate: 13 }]);
  });

  test("stock lines keep a unit price; a doc without price leaves it alone", async () => {
    const key = "Plumbing|Pipe|CPVC|25 mm||";
    const base = { trade: "Plumbing", family: "Pipe", item: "Pipe", material: "CPVC", size: "25 mm", unit: "m" };
    const find = async () => (await call("GET", "/sync/stock", eng1)).json.items.find((s: J) => s.key === key);

    assert.equal((await call("POST", "/sync/stock", owner, { upserts: [{ ...base, stock: 5 }] })).json.results[0].ok, true);
    assert.equal((await find()).price, 0);

    assert.equal((await call("POST", "/sync/stock", owner, { upserts: [{ ...base, stock: 5, price: 1250.5 }] })).json.results[0].ok, true);
    assert.equal((await find()).price, 1250.5);

    // older app build: no price field → price kept, stock updated
    await call("POST", "/sync/stock", owner, { upserts: [{ ...base, stock: 8 }] });
    const kept = await find();
    assert.equal(kept.price, 1250.5);
    assert.equal(kept.stock, 8);

    const neg = await call("POST", "/sync/stock", owner, { upserts: [{ ...base, stock: 8, price: -1 }] });
    assert.equal(neg.json.results[0].ok, false);
    await call("POST", "/sync/stock", owner, { deletes: [key] });
  });

  test("catalog: default is version 0, admins publish new versions", async () => {
    const v0 = await call("GET", "/library/catalog", eng1);
    assert.equal(v0.json.version, 0);
    assert.ok(v0.json.data.plumbing.families.length > 0);
    assert.equal((await call("POST", "/library/catalog", eng1, { data: v0.json.data })).status, 403);
    const pub = await call("POST", "/library/catalog", owner, { data: v0.json.data, note: "first" });
    assert.equal(pub.json.version, 1);
    assert.equal((await call("GET", "/library/catalog", eng2)).json.version, 1);
  });

  test("catalog edits: checked, no lost updates, can't remove what stock uses", async () => {
    const cur = (await call("GET", "/library/catalog", owner)).json;
    const data = structuredClone(cur.data);
    data.plumbing.families.push("Pump");
    data.plumbing.items.Pump = [{ name: "Booster Pump", unit: "Nos", needsSecondarySize: false }];

    const ok = await call("POST", "/library/catalog", owner, { data, baseVersion: cur.version, note: "add pump" });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    const saved = (await call("GET", "/library/catalog", eng1)).json;
    assert.equal(saved.version, cur.version + 1);
    assert.equal(saved.data.plumbing.items.Pump[0].name, "Booster Pump");

    // someone saving from the old version is stopped, not silently overwritten
    const stale = await call("POST", "/library/catalog", owner, { data, baseVersion: cur.version });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.code, "catalog_changed");

    // duplicate item name within a trade
    const dup = structuredClone(saved.data);
    dup.plumbing.items.Pump.push({ name: "Pipe", unit: "m" });
    const bad = await call("POST", "/library/catalog", owner, { data: dup, baseVersion: saved.version });
    assert.equal(bad.status, 400);
    assert.match(bad.json.error, /unique/);

    // PVC is used by a stock line → can't be removed
    const noPvc = structuredClone(saved.data);
    noPvc.plumbing.materials = noPvc.plumbing.materials.filter((m: string) => m !== "PVC");
    const inUse = await call("POST", "/library/catalog", owner, { data: noPvc, baseVersion: saved.version });
    assert.equal(inUse.status, 409);
    assert.equal(inUse.json.code, "catalog_in_use");
    assert.match(inUse.json.error, /PVC/);

    assert.equal((await call("POST", "/library/catalog", eng1, { data: saved.data, baseVersion: saved.version })).status, 403);
  });
});

describe("projects", () => {
  test("only PM/Admin/Owner create projects; duplicate names are refused", async () => {
    const bad = await call("POST", "/projects", eng1, { name: "Whitefield Tower" });
    assert.equal(bad.status, 403);

    const ok = await call("POST", "/projects", owner, { name: "Whitefield Tower", siteName: "Whitefield, Bengaluru" });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.equal(ok.json.status, "open");

    const dupe = await call("POST", "/projects", pm, { name: "Whitefield Tower" });
    assert.equal(dupe.status, 409);

    const list = await call("GET", "/projects", eng1);
    assert.ok(list.json.some((p: J) => p.name === "Whitefield Tower"));
  });
});

describe("mto workflow", () => {
  let projectId: string;

  test("server numbers MTOs and site supervisors only see their own", async () => {
    projectId = (await call("GET", "/projects", owner)).json.find((p: J) => p.name === "Whitefield Tower").id;

    const a = await call("POST", "/sync/estimates", eng1, { upserts: [estimate("e1-a", projectId, 2)] });
    assert.equal(a.json.results[0].ok, true, JSON.stringify(a.json));
    assert.equal(a.json.results[0].item.estimateNumber, "MTO-0001");
    assert.equal(a.json.results[0].item.status, "DRAFT");
    const b = await call("POST", "/sync/estimates", eng2, { upserts: [estimate("e2-a", projectId, 1)] });
    assert.equal(b.json.results[0].item.estimateNumber, "MTO-0002");

    assert.deepEqual((await call("GET", "/sync/estimates", eng1)).json.items.map((e: J) => e.id), ["e1-a"]);
    assert.equal((await call("GET", "/sync/estimates", owner)).json.items.length, 2);

    // eng2 can't touch eng1's MTO
    const steal = await call("POST", "/sync/estimates", eng2, { upserts: [estimate("e1-a", projectId, 0)] });
    assert.equal(steal.json.results[0].code, "forbidden");
  });

  test("no stock check at MTO time — any item, any quantity goes straight in", async () => {
    const stock = (await call("GET", "/sync/stock", eng2)).json.items.find((s: J) => s.key === PIPE_KEY);
    assert.equal(stock.stock, 10);
    const big = await call("POST", "/sync/estimates", eng2, { upserts: [estimate("e2-b", projectId, 999)] });
    assert.equal(big.json.results[0].ok, true, JSON.stringify(big.json));
  });

  test("submit needs a line and an open project; then the approval loop with comments", async () => {
    const emptyProject = await call("POST", "/projects", owner, { name: "Empty Site" });
    const emptyMto = await call("POST", "/sync/estimates", eng1, { upserts: [{ id: "e-empty", name: "x", projectId: emptyProject.json.id, updatedAt: Date.now(), items: [] }] });
    assert.equal(emptyMto.json.results[0].ok, true);
    const noLines = await call("POST", "/mtos/e-empty/transition", eng1, { to: "SUBMITTED" });
    assert.equal(noLines.status, 400);
    assert.match(noLines.json.error, /at least one item/);

    // Site Supervisor submits; PM rejects with a comment; Supervisor edits and resubmits.
    const submit = await call("POST", "/mtos/e1-a/transition", eng1, { to: "SUBMITTED" });
    assert.equal(submit.status, 200, JSON.stringify(submit.json));
    assert.equal(submit.json.item.status, "SUBMITTED");

    const wrongRole = await call("POST", "/mtos/e1-a/transition", eng1, { to: "APPROVED" });
    assert.equal(wrongRole.status, 403);

    const noComment = await call("POST", "/mtos/e1-a/transition", pm, { to: "REJECTED" });
    assert.equal(noComment.status, 400);
    const reject = await call("POST", "/mtos/e1-a/transition", pm, { to: "REJECTED", comment: "Wrong pipe size for this site." });
    assert.equal(reject.status, 200, JSON.stringify(reject.json));
    assert.equal(reject.json.item.status, "REJECTED");

    // Editable again now it's Rejected.
    const edited = await call("POST", "/sync/estimates", eng1, { upserts: [estimate("e1-a", projectId, 3, { updatedAt: Date.now() + 1000 })] });
    assert.equal(edited.json.results[0].ok, true, JSON.stringify(edited.json));

    const resubmit = await call("POST", "/mtos/e1-a/transition", eng1, { to: "SUBMITTED" });
    assert.equal(resubmit.status, 200);
    const approve = await call("POST", "/mtos/e1-a/transition", pm, { to: "APPROVED" });
    assert.equal(approve.status, 200, JSON.stringify(approve.json));

    const sentBack = await call("POST", "/mtos/e1-a/transition", finance, { to: "SENT_BACK", comment: "Confirm budget code first." });
    assert.equal(sentBack.status, 200, JSON.stringify(sentBack.json));
    const reapprove = await call("POST", "/mtos/e1-a/transition", pm, { to: "APPROVED" });
    assert.equal(reapprove.status, 200);
    const budgetOk = await call("POST", "/mtos/e1-a/transition", finance, { to: "BUDGET_OK" });
    assert.equal(budgetOk.status, 200, JSON.stringify(budgetOk.json));
    assert.equal(budgetOk.json.item.status, "BUDGET_OK");

    const hist = await call("GET", "/mtos/e1-a/history", owner);
    assert.deepEqual(
      hist.json.map((h: J) => h.to),
      ["DRAFT", "SUBMITTED", "REJECTED", "SUBMITTED", "APPROVED", "SENT_BACK", "APPROVED", "BUDGET_OK"]
    );
    assert.equal(hist.json.find((h: J) => h.to === "REJECTED").comment, "Wrong pipe size for this site.");
  });

  test("editing is refused once an MTO has moved on", async () => {
    const r = await call("POST", "/sync/estimates", eng1, { upserts: [estimate("e1-a", projectId, 5, { updatedAt: Date.now() + 5000 })] });
    assert.equal(r.json.results[0].ok, false);
    assert.equal(r.json.results[0].code, "not_editable");
  });

  test("only a Draft can be deleted outright", async () => {
    const del = await call("POST", "/sync/estimates", eng2, { deletes: ["e2-a"] });
    assert.equal(del.json.results[0].ok, true);
    assert.ok(!(await call("GET", "/sync/estimates", eng2)).json.items.some((x: J) => x.id === "e2-a"));

    // e1-a is Budget OK now — deleting it is refused.
    const cant = await call("POST", "/sync/estimates", eng1, { deletes: ["e1-a"] });
    assert.equal(cant.json.results[0].ok, false);
    assert.equal(cant.json.results[0].code, "not_deletable");
  });

  test("inbox shows what's waiting on each role, plus mine", async () => {
    await call("POST", "/sync/estimates", eng1, { upserts: [estimate("e1-c", projectId, 1)] });
    await call("POST", "/mtos/e1-c/transition", eng1, { to: "SUBMITTED" });

    const pmInbox = await call("GET", "/mtos/inbox", pm);
    assert.ok(pmInbox.json.waiting.some((e: J) => e.id === "e1-c"));

    const engInbox = await call("GET", "/mtos/inbox", eng1);
    assert.ok(engInbox.json.mine.some((e: J) => e.id === "e1-c"));
    assert.ok(!engInbox.json.waiting.some((e: J) => e.id === "e1-c")); // not a PM

    const financeInbox = await call("GET", "/mtos/inbox", finance);
    assert.ok(!financeInbox.json.waiting.some((e: J) => e.id === "e1-c")); // still Submitted, not Approved yet
  });

  test("an older copy never overwrites a newer one (stale)", async () => {
    const r = await call("POST", "/sync/estimates", eng2, { upserts: [estimate("e2-b", projectId, 1, { updatedAt: 1, name: "old copy" })] });
    assert.equal(r.json.results[0].stale, true);
    assert.equal(r.json.results[0].item.name, "Est e2-b");
  });

  test("websocket tells other devices that stock changed", async () => {
    const port = (app.server.address() as { port: number }).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${eng2}`);
    const got: J[] = [];
    await new Promise<void>((res, rej) => {
      ws.on("message", (m) => {
        const msg = JSON.parse(String(m));
        got.push(msg);
        if (msg.type === "hello") call("POST", "/sync/stock", owner, { upserts: [{ trade: "Plumbing", family: "Pipe", item: "Pipe", material: "PVC", size: "40 mm", unit: "m", stock: 50 }] });
        if (msg.type === "changed" && msg.resource === "stock") res();
      });
      ws.on("error", rej);
      setTimeout(() => rej(new Error("no event: " + JSON.stringify(got))), 4000);
    });
    ws.close();
  });

  test("refresh rotates tokens; old refresh token stops working", async () => {
    await db.otpCode.deleteMany({});
    const a = await signInFull("owner@test.dev", "Owner", { name: "Suraj's laptop", platform: "web" });
    const r1 = await call("POST", "/auth/refresh", undefined, { refreshToken: a.refreshToken });
    assert.equal(r1.status, 200, JSON.stringify(r1.json));
    assert.notEqual(r1.json.refreshToken, a.refreshToken);
    assert.equal((await call("GET", "/me", r1.json.accessToken)).status, 200);
    const reuse = await call("POST", "/auth/refresh", undefined, { refreshToken: a.refreshToken });
    assert.equal(reuse.status, 401);
  });

  test("devices list, sign out one device, sign out all others", async () => {
    await db.otpCode.deleteMany({});
    const phone = await signInFull("eng1@test.dev", "Ravi", { name: "Ravi's phone", platform: "android" });
    await db.otpCode.deleteMany({});
    const tablet = await signInFull("eng1@test.dev", "Ravi", { name: "Ravi's tablet", platform: "ios" });
    const list = await call("GET", "/auth/sessions", phone.accessToken);
    const names = list.json.map((d: J) => d.deviceName);
    assert.ok(names.includes("Ravi's phone") && names.includes("Ravi's tablet"), JSON.stringify(list.json));
    assert.equal(list.json.find((d: J) => d.current).deviceName, "Ravi's phone");

    // lost tablet: sign it out from the phone → its access token is refused at once
    const del = await call("DELETE", `/auth/sessions/${tablet.sessionId}`, phone.accessToken);
    assert.equal(del.status, 200);
    const refused = await call("GET", "/me", tablet.accessToken);
    assert.equal(refused.status, 401);
    assert.equal(refused.json.code, "session_revoked");
    assert.equal((await call("POST", "/auth/refresh", undefined, { refreshToken: tablet.refreshToken })).status, 401);

    // sign out all other devices: every earlier session of eng1 goes, this one stays
    const others = await call("POST", "/auth/sessions/revoke-others", phone.accessToken);
    assert.ok(others.json.signedOut >= 1);
    assert.equal((await call("GET", "/me", eng1)).status, 401); // the token from the first test
    assert.equal((await call("GET", "/me", phone.accessToken)).status, 200);

    // sign out this device
    assert.equal((await call("POST", "/auth/logout", phone.accessToken)).status, 200);
    assert.equal((await call("GET", "/me", phone.accessToken)).status, 401);
  });

  test("bad token is refused", async () => {
    assert.equal((await call("GET", "/sync/stock", "nope")).status, 401);
  });
});

describe("procurement + stock ledger (Phase 3)", () => {
  let projectId: string;
  let procurement: string;

  before(async () => {
    // Give owner a procurement role for these tests
    const members = await call("GET", "/members", owner);
    const ownerMem = members.json.find((x: J) => x.email === "owner@test.dev");
    await call("PATCH", `/members/${ownerMem.id}`, owner, { roles: ["owner", "procurement"] });

    projectId = (await call("GET", "/projects", owner)).json.find((p: J) => p.name === "Whitefield Tower").id;
    // add a procurement-only user
    await call("POST", "/invites", owner, { email: "proc@test.dev", name: "Preet", roles: ["procurement"] });
    procurement = await signIn("proc@test.dev", "Preet");
    await call("GET", "/me", procurement); // accept invite
  });

  test("inbox includes BUDGET_OK for procurement role", async () => {
    // e1-a is BUDGET_OK from the workflow tests above
    const inbox = await call("GET", "/mtos/inbox", procurement);
    assert.ok(inbox.json.waiting.some((e: J) => e.id === "e1-a"), JSON.stringify(inbox.json.waiting));
    assert.ok(typeof inbox.json.waitingCount === "number");
  });

  test("only procurement/admin can call the procurement endpoint", async () => {
    const r = await call("POST", "/mtos/e1-a/procurement", eng1, { lines: [{ lineId: "e1-a-l1", issueQty: 1, purchaseQty: 0 }] });
    assert.equal(r.status, 403);
  });

  test("procurement refused on wrong status", async () => {
    // e1-c is SUBMITTED — not Budget OK
    const r = await call("POST", "/mtos/e1-c/procurement", procurement, { lines: [{ lineId: "e1-c-l1", issueQty: 1, purchaseQty: 0 }] });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /Budget OK/);
  });

  test("issuing more than in stock is refused", async () => {
    // Stock is 50 from the websocket test; e1-a has 3 m (updated in the workflow tests)
    const r = await call("POST", "/mtos/e1-a/procurement", procurement, {
      lines: [{ lineId: "e1-a-l1", issueQty: 9999, purchaseQty: 0 }],
    });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /in stock/);
  });

  test("issue from stock lowers onHand and creates a movement", async () => {
    const stockBefore = (await call("GET", "/sync/stock", owner)).json.items.find((s: J) => s.key === PIPE_KEY).stock;

    const r = await call("POST", "/mtos/e1-a/procurement", procurement, {
      lines: [{ lineId: "e1-a-l1", issueQty: 3, purchaseQty: 0 }],
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.lines[0].issuedQty, 3);

    const stockAfter = (await call("GET", "/sync/stock", owner)).json.items.find((s: J) => s.key === PIPE_KEY).stock;
    assert.equal(stockAfter, stockBefore - 3);

    const movements = await call("GET", `/stock/movements?stockLineId=${PIPE_KEY}`, owner);
    assert.ok(movements.json.some((m: J) => m.type === "ISSUE" && m.qty === 3));
  });

  test("receive purchased items raises onHand", async () => {
    const stockBefore = (await call("GET", "/sync/stock", owner)).json.items.find((s: J) => s.key === PIPE_KEY).stock;

    const r = await call("POST", "/stock/receipts", procurement, {
      lines: [{ stockLineId: PIPE_KEY, qty: 10, estimateId: "e1-a" }],
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.receipts[0].qty, 10);

    const stockAfter = (await call("GET", "/sync/stock", owner)).json.items.find((s: J) => s.key === PIPE_KEY).stock;
    assert.equal(stockAfter, stockBefore + 10);

    const movements = await call("GET", `/stock/movements?stockLineId=${PIPE_KEY}`, owner);
    assert.ok(movements.json.some((m: J) => m.type === "RECEIPT" && m.qty === 10));
  });

  test("manual adjust with reason changes stock", async () => {
    const stockBefore = (await call("GET", "/sync/stock", owner)).json.items.find((s: J) => s.key === PIPE_KEY).stock;

    const r = await call("POST", "/stock/adjust", procurement, {
      stockLineId: PIPE_KEY, qty: -5, reason: "Damaged pipes removed",
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));

    const stockAfter = (await call("GET", "/sync/stock", owner)).json.items.find((s: J) => s.key === PIPE_KEY).stock;
    assert.equal(stockAfter, stockBefore - 5);

    const movements = await call("GET", `/stock/movements?stockLineId=${PIPE_KEY}`, owner);
    assert.ok(movements.json.some((m: J) => m.type === "ADJUST" && m.reason === "Damaged pipes removed"));
  });

  test("adjust without reason is refused", async () => {
    const r = await call("POST", "/stock/adjust", procurement, { stockLineId: PIPE_KEY, qty: 1 });
    assert.equal(r.status, 400);
  });

  test("adjust that would push stock below zero is refused", async () => {
    const stock = (await call("GET", "/sync/stock", owner)).json.items.find((s: J) => s.key === PIPE_KEY).stock;
    const r = await call("POST", "/stock/adjust", procurement, { stockLineId: PIPE_KEY, qty: -(stock + 999), reason: "test" });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /below zero/);
  });

  test("ready to dispatch refused if not all lines issued", async () => {
    // e1-c is still SUBMITTED — need to push it to BUDGET_OK first for this check
    // Use a fresh MTO instead: create, submit, approve, budget OK, then try to dispatch
    await call("POST", "/sync/estimates", eng1, { upserts: [estimate("e1-d", projectId, 10)] });
    await call("POST", "/mtos/e1-d/transition", eng1, { to: "SUBMITTED" });
    await call("POST", "/mtos/e1-d/transition", pm, { to: "APPROVED" });
    await call("POST", "/mtos/e1-d/transition", finance, { to: "BUDGET_OK" });

    // Try to mark ready to dispatch without issuing — server refuses
    const r = await call("POST", "/mtos/e1-d/transition", procurement, { to: "READY_TO_DISPATCH" });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /fully issued/);
  });

  test("ready to dispatch succeeds once all lines are issued", async () => {
    // Issue the full 10 m for e1-d
    const issueR = await call("POST", "/mtos/e1-d/procurement", procurement, {
      lines: [{ lineId: "e1-d-l1", issueQty: 10, purchaseQty: 0 }],
    });
    assert.equal(issueR.status, 200, JSON.stringify(issueR.json));

    const dispatch = await call("POST", "/mtos/e1-d/transition", procurement, { to: "READY_TO_DISPATCH" });
    assert.equal(dispatch.status, 200, JSON.stringify(dispatch.json));
    assert.equal(dispatch.json.item.status, "READY_TO_DISPATCH");

    const hist = await call("GET", "/mtos/e1-d/history", owner);
    assert.ok(hist.json.some((h: J) => h.to === "READY_TO_DISPATCH"));
  });
});

describe("logistics + cancel (Phase 4)", () => {
  let logistics: string;
  let projectId: string;
  let stockBefore: number;

  before(async () => {
    await call("POST", "/invites", owner, { email: "logi@test.dev", name: "Laxmi", roles: ["logistics"] });
    logistics = await signIn("logi@test.dev", "Laxmi");
    await call("GET", "/me", logistics); // accept invite

    projectId = (await call("GET", "/projects", owner)).json.find((p: J) => p.name === "Whitefield Tower").id;
    stockBefore = (await call("GET", "/sync/stock", owner)).json.items.find((s: J) => s.key === PIPE_KEY)?.stock ?? 0;
  });

  test("logistics moves READY_TO_DISPATCH → DISPATCHED via dispatch sheet", async () => {
    // e1-d is READY_TO_DISPATCH from procurement tests
    const dispatchR = await call("POST", "/mtos/e1-d/dispatch", logistics, {
      loadingCheck: true,
      loadingCost: 500,
      vehicle: "KA 01 AB 1234",
      driver: "Ramesh",
    });
    assert.equal(dispatchR.status, 200, JSON.stringify(dispatchR.json));
    assert.equal(dispatchR.json.dispatch.loadingCheck, true);

    const transR = await call("POST", "/mtos/e1-d/transition", logistics, { to: "DISPATCHED" });
    assert.equal(transR.status, 200, JSON.stringify(transR.json));
    assert.equal(transR.json.item.status, "DISPATCHED");
  });

  test("dispatch endpoint refused on wrong status", async () => {
    // e1-a is BUDGET_OK — not READY_TO_DISPATCH
    const r = await call("POST", "/mtos/e1-a/dispatch", logistics, {});
    assert.equal(r.status, 400);
    assert.match(r.json.error, /Ready-to-dispatch/);
  });

  test("DISPATCHED → DELIVERED (logistics or supervisor)", async () => {
    // Supervisor can also mark delivered
    const r = await call("POST", "/mtos/e1-d/transition", eng1, { to: "DELIVERED" });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.item.status, "DELIVERED");
  });

  test("cancel after delivery returns all issued qty to stock immediately", async () => {
    const stockMid = (await call("GET", "/sync/stock", owner)).json.items.find((s: J) => s.key === PIPE_KEY)?.stock ?? 0;

    // PM cancels the delivered MTO — should RETURN all issued qty (10 m for e1-d)
    const cancel = await call("POST", "/mtos/e1-d/transition", pm, { to: "CANCELLED", comment: "Site plan changed." });
    assert.equal(cancel.status, 200, JSON.stringify(cancel.json));
    assert.equal(cancel.json.item.status, "CANCELLED");

    const stockAfter = (await call("GET", "/sync/stock", owner)).json.items.find((s: J) => s.key === PIPE_KEY)?.stock ?? 0;
    assert.equal(stockAfter, stockMid + 10, `Expected stock +10, got ${stockAfter - stockMid}`);

    const movements = await call("GET", `/stock/movements?stockLineId=${PIPE_KEY}`, owner);
    assert.ok(movements.json.some((mv: J) => mv.type === "RETURN" && mv.estimateId === "e1-d"));
  });

  test("cancel with no comment is refused", async () => {
    // create a fresh MTO, push it to Approved, then try to cancel without comment
    await call("POST", "/sync/estimates", eng1, { upserts: [estimate("e1-e", projectId, 1)] });
    await call("POST", "/mtos/e1-e/transition", eng1, { to: "SUBMITTED" });
    await call("POST", "/mtos/e1-e/transition", pm, { to: "APPROVED" });

    const r = await call("POST", "/mtos/e1-e/transition", pm, { to: "CANCELLED" });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /comment/);
  });

  test("cancel at APPROVED (no stock issued) makes no RETURN movements", async () => {
    const stockSnapshot = (await call("GET", "/sync/stock", owner)).json.items.find((s: J) => s.key === PIPE_KEY)?.stock ?? 0;

    const cancel = await call("POST", "/mtos/e1-e/transition", pm, { to: "CANCELLED", comment: "Not needed." });
    assert.equal(cancel.status, 200);

    const stockAfter = (await call("GET", "/sync/stock", owner)).json.items.find((s: J) => s.key === PIPE_KEY)?.stock ?? 0;
    assert.equal(stockAfter, stockSnapshot); // no change
  });

  test("dispatch record can be patched and fetched", async () => {
    // Create a fresh MTO, push to ready-to-dispatch, create dispatch record
    await call("POST", "/sync/estimates", eng1, { upserts: [estimate("e1-f", projectId, 2)] });
    await call("POST", "/mtos/e1-f/transition", eng1, { to: "SUBMITTED" });
    await call("POST", "/mtos/e1-f/transition", pm, { to: "APPROVED" });
    await call("POST", "/mtos/e1-f/transition", finance, { to: "BUDGET_OK" });

    // Get procurement token (reuse owner who has procurement role)
    const procOwner = owner;
    await call("POST", "/mtos/e1-f/procurement", procOwner, { lines: [{ lineId: "e1-f-l1", issueQty: 2, purchaseQty: 0 }] });
    await call("POST", "/mtos/e1-f/transition", procOwner, { to: "READY_TO_DISPATCH" });

    const dispR = await call("POST", "/mtos/e1-f/dispatch", logistics, { vehicle: "KA 02 CD 5678", loadingCheck: false });
    assert.equal(dispR.status, 200);
    const dispId = dispR.json.dispatch.id;

    const patch = await call("PATCH", `/dispatches/${dispId}`, logistics, { dispatched: true });
    assert.equal(patch.status, 200);
    assert.ok(patch.json.dispatch.dispatchedAt != null);

    const list = await call("GET", "/mtos/e1-f/dispatches", owner);
    assert.equal(list.status, 200);
    assert.ok(list.json.some((d: J) => d.id === dispId));
  });
});
