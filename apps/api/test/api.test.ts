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
const estimate = (id: string, qty: number, extra: J = {}) => ({ id, name: `Est ${id}`, status: "Draft", updatedAt: Date.now(), items: [line(`${id}-l1`, qty)], ...extra });
const PIPE_KEY = "Plumbing|Pipe|PVC|40 mm||";

let owner: string, eng1: string, eng2: string;

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
    assert.equal(c.json.membership.role, "owner");

    for (const [email, name] of [["eng1@test.dev", "Ravi"], ["eng2@test.dev", "Anil"]]) {
      const inv = await call("POST", "/invites", owner, { email, name, role: "estimator" });
      assert.equal(inv.status, 200, JSON.stringify(inv.json));
    }
    eng1 = await signIn("eng1@test.dev", "Ravi");
    eng2 = await signIn("eng2@test.dev", "Anil");
    me = await call("GET", "/me", eng1);
    assert.equal(me.json.membership.role, "estimator");
    assert.equal(me.json.company.name, "Katvora Test");
    await call("GET", "/me", eng2);

    const members = await call("GET", "/members", owner);
    assert.equal(members.json.length, 3);
    assert.equal((await call("GET", "/invites", owner)).json.length, 0);
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

describe("estimates + live stock", () => {
  test("server numbers estimates and engineers only see their own", async () => {
    const a = await call("POST", "/sync/estimates", eng1, { upserts: [estimate("e1-a", 2)] });
    assert.equal(a.json.results[0].ok, true, JSON.stringify(a.json));
    assert.equal(a.json.results[0].item.estimateNumber, "EST-0001");
    const b = await call("POST", "/sync/estimates", eng2, { upserts: [estimate("e2-a", 1)] });
    assert.equal(b.json.results[0].item.estimateNumber, "EST-0002");

    assert.deepEqual((await call("GET", "/sync/estimates", eng1)).json.items.map((e: J) => e.id), ["e1-a"]);
    assert.equal((await call("GET", "/sync/estimates", owner)).json.items.length, 2);

    // eng2 can't touch eng1's estimate
    const steal = await call("POST", "/sync/estimates", eng2, { upserts: [estimate("e1-a", 0)] });
    assert.equal(steal.json.results[0].code, "forbidden");
  });

  test("stock shows what everyone has used; out of stock is refused", async () => {
    let stock = (await call("GET", "/sync/stock", eng2)).json.items;
    let pipe = stock.find((s: J) => s.key === PIPE_KEY);
    assert.equal(pipe.stock, 10);
    assert.equal(pipe.used, 3); // 2 (eng1) + 1 (eng2)
    assert.equal(pipe.available, 7);

    const tooMuch = await call("POST", "/sync/estimates", eng2, { upserts: [estimate("e2-b", 8)] });
    assert.equal(tooMuch.json.results[0].ok, false);
    assert.equal(tooMuch.json.results[0].code, "out_of_stock");
    assert.equal(tooMuch.json.results[0].details.shortages[0].available, 7);
    assert.match(tooMuch.json.results[0].error, /Only 7 m left/);

    // Editing an estimate doesn't double-count its own lines: e1-a 2 → 9 fits (10 − 1 other).
    const grow = await call("POST", "/sync/estimates", eng1, { upserts: [estimate("e1-a", 9)] });
    assert.equal(grow.json.results[0].ok, true, JSON.stringify(grow.json));
    stock = (await call("GET", "/sync/stock", eng2)).json.items;
    pipe = stock.find((s: J) => s.key === PIPE_KEY);
    assert.equal(pipe.available, 0);
    const out = await call("POST", "/sync/estimates", eng2, { upserts: [estimate("e2-c", 1)] });
    assert.match(out.json.results[0].error, /out of stock/);
  });

  test("two engineers racing for the last units: exactly one wins", async () => {
    await call("POST", "/sync/estimates", eng1, { upserts: [estimate("e1-a", 1, { updatedAt: Date.now() + 1000 })] }); // frees 8 → available 8
    const [r1, r2] = await Promise.all([
      call("POST", "/sync/estimates", eng1, { upserts: [estimate("race-1", 6)] }),
      call("POST", "/sync/estimates", eng2, { upserts: [estimate("race-2", 6)] }),
    ]);
    const oks = [r1, r2].map((r) => r.json.results[0].ok);
    assert.deepEqual(oks.sort(), [false, true], JSON.stringify([r1.json, r2.json]));
    const pipe = (await call("GET", "/sync/stock", owner)).json.items.find((s: J) => s.key === PIPE_KEY);
    assert.equal(pipe.used, 8); // 1 + 1 + 6
    assert.equal(pipe.available, 2);
  });

  test("only admins approve/reject; rejecting releases stock", async () => {
    const { items } = (await call("GET", "/sync/estimates", eng1)).json;
    const e = items.find((x: J) => x.id === "e1-a");
    const selfApprove = await call("POST", "/sync/estimates", eng1, { upserts: [{ ...e, status: "Approved", updatedAt: Date.now() + 2000 }] });
    assert.equal(selfApprove.json.results[0].code, "forbidden");

    const before = (await call("GET", "/sync/stock", owner)).json.items.find((s: J) => s.key === PIPE_KEY).available;
    const reject = await call("POST", "/sync/estimates", owner, { upserts: [{ ...e, status: "Rejected", updatedAt: Date.now() + 3000 }] });
    assert.equal(reject.json.results[0].ok, true, JSON.stringify(reject.json));
    const afterAvail = (await call("GET", "/sync/stock", owner)).json.items.find((s: J) => s.key === PIPE_KEY).available;
    assert.equal(afterAvail, before + 1);
  });

  test("an older copy never overwrites a newer one (stale)", async () => {
    const r = await call("POST", "/sync/estimates", eng2, { upserts: [estimate("e2-a", 1, { updatedAt: 1, name: "old copy" })] });
    assert.equal(r.json.results[0].stale, true);
    assert.equal(r.json.results[0].item.name, "Est e2-a");
  });

  test("deleting an estimate releases its stock", async () => {
    const before = (await call("GET", "/sync/stock", owner)).json.items.find((s: J) => s.key === PIPE_KEY).used;
    const d = await call("POST", "/sync/estimates", eng2, { deletes: ["e2-a"] });
    assert.equal(d.json.results[0].ok, true);
    const pipe = (await call("GET", "/sync/stock", owner)).json.items.find((s: J) => s.key === PIPE_KEY);
    assert.equal(pipe.used, before - 1);
    assert.ok(!(await call("GET", "/sync/estimates", eng2)).json.items.some((x: J) => x.id === "e2-a"));
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
