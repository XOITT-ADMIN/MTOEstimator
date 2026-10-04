import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

import { assert, can, isOrgAdmin, requireMember, type Member } from "../lib/access.js";
import { badRequest, HttpError, notFound } from "../lib/errors.js";
import { toNum } from "../lib/num.js";
import type { Resource } from "../lib/realtime.js";
import { deleteEstimate, listEstimates, saveEstimate } from "../services/estimates.js";
import { batchSchema, rateSchema } from "../services/schemas.js";
import { listStock, upsertStock } from "../services/stock.js";
import type { Deps } from "../app.js";

type Result = { id: string; ok: true; item?: unknown; stale?: boolean } | { id: string; ok: false; code: string; error: string; details?: unknown };

function failure(id: string, e: unknown): Result {
  if (e instanceof HttpError) return { id, ok: false, code: e.code, error: e.message, details: e.details };
  if (e instanceof ZodError) return { id, ok: false, code: "bad_request", error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  throw e;
}

// One small sync protocol for every shared collection, matching how the app stores them:
//   GET  /sync/:resource            → { items }             (everything this member may see)
//   POST /sync/:resource  { upserts: [doc], deletes: [id] } → { results: [...] }
// Each doc is saved on its own, so one bad line (e.g. out of stock) doesn't block the rest.
export async function syncRoutes(app: FastifyInstance, { db, hub }: Deps) {
  const auth = { onRequest: [app.authenticate] };

  const handlers: Record<string, {
    // Stock and rates are kept per project: those collections need ?projectId= and get it as `pid`.
    projectScoped?: boolean;
    list: (m: Member, pid: string) => Promise<unknown[]>;
    upsert: (m: Member, doc: Record<string, unknown>, pid: string) => Promise<Result>;
    remove: (m: Member, id: string, pid: string) => Promise<void>;
    alsoChanges?: Resource[];
  }> = {
    estimates: {
      list: (m) => listEstimates(db, m),
      upsert: async (m, doc) => {
        const r = await saveEstimate(db, m, doc);
        return { id: String(doc.id), ok: true, item: r.item, stale: r.status === "stale" };
      },
      remove: (m, id) => deleteEstimate(db, m, id),
    },
    stock: {
      projectScoped: true,
      list: (m, pid) => listStock(db, m.companyId, pid),
      upsert: async (m, doc, pid) => {
        assert(can.manageLibrary(m.roles), "Only an owner or admin can change stock.");
        const key = await upsertStock(db, m.companyId, pid, doc);
        return { id: key, ok: true };
      },
      remove: async (m, id, pid) => {
        assert(can.manageLibrary(m.roles), "Only an owner or admin can change stock.");
        await db.stockLine.deleteMany({ where: { companyId: m.companyId, projectId: pid, key: id } });
      },
    },
    rates: {
      projectScoped: true,
      list: async (m, pid) =>
        (await db.rateOverride.findMany({ where: { companyId: m.companyId, projectId: pid } })).map((r) => ({ id: r.key, materialRate: toNum(r.materialRate), labourRate: toNum(r.labourRate) })),
      upsert: async (m, doc, pid) => {
        assert(can.manageLibrary(m.roles), "Only an owner or admin can change rates.");
        const r = rateSchema.parse(doc);
        const data = { materialRate: r.materialRate, labourRate: r.labourRate };
        await db.rateOverride.upsert({ where: { companyId_projectId_key: { companyId: m.companyId, projectId: pid, key: r.id } }, create: { companyId: m.companyId, projectId: pid, key: r.id, ...data }, update: data });
        return { id: r.id, ok: true };
      },
      remove: async (m, id, pid) => {
        assert(can.manageLibrary(m.roles), "Only an owner or admin can change rates.");
        await db.rateOverride.deleteMany({ where: { companyId: m.companyId, projectId: pid, key: id } });
      },
    },
  };

  function handler(resource: string) {
    const h = handlers[resource];
    if (!h) throw notFound(`Unknown collection "${resource}".`);
    return h;
  }

  // The project a stock/rates request is about — must be one of this company's.
  async function scopeOf(h: { projectScoped?: boolean }, m: Member, req: { query: unknown }) {
    if (!h.projectScoped) return "";
    const pid = String((req.query as { projectId?: string }).projectId ?? "");
    if (!pid) throw badRequest("Pick a project: stock and rates are kept per project.");
    const project = await db.project.findUnique({ where: { id: pid }, select: { companyId: true } });
    if (!project || project.companyId !== m.companyId) throw notFound("Project not found.");
    if (!isOrgAdmin(m) && !m.projectRoles[pid]) throw notFound("Project not found.");
    return pid;
  }

  app.get<{ Params: { resource: string } }>("/sync/:resource", auth, async (req) => {
    const h = handler(req.params.resource);
    const m = await requireMember(db, req);
    const pid = await scopeOf(h, m, req);
    return { items: await h.list(m, pid), serverTime: Date.now() };
  });

  app.post<{ Params: { resource: string } }>("/sync/:resource", auth, async (req) => {
    const h = handler(req.params.resource);
    const m = await requireMember(db, req);
    const pid = await scopeOf(h, m, req);
    const body = batchSchema.parse(req.body);
    const results: Result[] = [];
    let changed = false;

    for (const doc of body.upserts) {
      const id = String(doc.id ?? doc.key ?? "");
      try {
        const r = await h.upsert(m, doc, pid);
        if (!(r.ok && r.stale)) changed = true;
        results.push(r);
      } catch (e) {
        results.push(failure(id, e));
      }
    }
    for (const id of body.deletes) {
      try {
        await h.remove(m, id, pid);
        changed = true;
        results.push({ id, ok: true });
      } catch (e) {
        results.push(failure(id, e));
      }
    }

    if (changed) {
      const resource = req.params.resource as Resource;
      hub.publish(m.companyId, resource, { by: m.userId });
      for (const r of h.alsoChanges ?? []) hub.publish(m.companyId, r, { by: m.userId });
    }
    return { results };
  });
}
