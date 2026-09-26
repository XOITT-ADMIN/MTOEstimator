import { calculateEstimateBreakdown } from "@mto/shared";
import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";

import { assert, can, requireMember, type Member } from "../lib/access.js";
import { HttpError, notFound } from "../lib/errors.js";
import { toNum } from "../lib/num.js";
import type { Resource } from "../lib/realtime.js";
import { deleteEstimate, listEstimates, saveEstimate } from "../services/estimates.js";
import { batchSchema, rateSchema } from "../services/schemas.js";
import { listStock, upsertStock } from "../services/stock.js";
import type { Deps } from "../app.js";

const notifyReadySchema = z.object({ pdfBase64: z.string().min(1).max(8_000_000) });

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
export async function syncRoutes(app: FastifyInstance, { db, hub, mailer }: Deps) {
  const auth = { onRequest: [app.authenticate] };

  const handlers: Record<string, {
    list: (m: Member) => Promise<unknown[]>;
    upsert: (m: Member, doc: Record<string, unknown>, policy: string) => Promise<Result>;
    remove: (m: Member, id: string) => Promise<void>;
    alsoChanges?: Resource[];
  }> = {
    estimates: {
      list: (m) => listEstimates(db, m),
      upsert: async (m, doc, policy) => {
        const r = await saveEstimate(db, m, doc, policy);
        return { id: String(doc.id), ok: true, item: r.item, stale: r.status === "stale" };
      },
      remove: (m, id) => deleteEstimate(db, m, id),
      alsoChanges: ["stock"], // used/available move with every estimate change
    },
    stock: {
      list: (m) => listStock(db, m.companyId),
      upsert: async (m, doc) => {
        assert(can.manageLibrary(m.role), "Only an owner or admin can change stock.");
        const key = await upsertStock(db, m.companyId, doc);
        return { id: key, ok: true };
      },
      remove: async (m, id) => {
        assert(can.manageLibrary(m.role), "Only an owner or admin can change stock.");
        await db.stockLine.deleteMany({ where: { companyId: m.companyId, key: id } });
      },
    },
    rates: {
      list: async (m) =>
        (await db.rateOverride.findMany({ where: { companyId: m.companyId } })).map((r) => ({ id: r.key, materialRate: toNum(r.materialRate), labourRate: toNum(r.labourRate) })),
      upsert: async (m, doc) => {
        assert(can.manageLibrary(m.role), "Only an owner or admin can change rates.");
        const r = rateSchema.parse(doc);
        const data = { materialRate: r.materialRate, labourRate: r.labourRate };
        await db.rateOverride.upsert({ where: { companyId_key: { companyId: m.companyId, key: r.id } }, create: { companyId: m.companyId, key: r.id, ...data }, update: data });
        return { id: r.id, ok: true };
      },
      remove: async (m, id) => {
        assert(can.manageLibrary(m.role), "Only an owner or admin can change rates.");
        await db.rateOverride.deleteMany({ where: { companyId: m.companyId, key: id } });
      },
    },
  };

  function handler(resource: string) {
    const h = handlers[resource];
    if (!h) throw notFound(`Unknown collection "${resource}".`);
    return h;
  }

  app.get<{ Params: { resource: string } }>("/sync/:resource", auth, async (req) => {
    const h = handler(req.params.resource);
    const m = await requireMember(db, req);
    return { items: await h.list(m), serverTime: Date.now() };
  });

  app.post<{ Params: { resource: string } }>("/sync/:resource", auth, async (req) => {
    const h = handler(req.params.resource);
    const m = await requireMember(db, req);
    const body = batchSchema.parse(req.body);
    const company = await db.company.findUniqueOrThrow({ where: { id: m.companyId }, select: { stockPolicy: true } });
    const results: Result[] = [];
    let changed = false;

    for (const doc of body.upserts) {
      const id = String(doc.id ?? doc.key ?? "");
      try {
        const r = await h.upsert(m, doc, company.stockPolicy);
        if (!(r.ok && r.stale)) changed = true;
        results.push(r);
      } catch (e) {
        results.push(failure(id, e));
      }
    }
    for (const id of body.deletes) {
      try {
        await h.remove(m, id);
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

  // Field engineer just marked an estimate Ready, from the app, with the PDF it already
  // built for the preview. One email, straight through, PDF attached — nothing is stored
  // here; if there's no notification address configured, or SMTP isn't set up, this is a
  // silent no-op rather than an error (a missing "nice to have" shouldn't fail the app).
  app.post<{ Params: { id: string } }>("/estimates/:id/notify-ready", auth, async (req) => {
    const m = await requireMember(db, req);
    const { pdfBase64 } = notifyReadySchema.parse(req.body);

    const estimate = await db.estimate.findUnique({ where: { companyId_id: { companyId: m.companyId, id: req.params.id } } });
    if (!estimate || estimate.deletedAt) throw notFound("Estimate not found.");

    const company = await db.company.findUniqueOrThrow({ where: { id: m.companyId }, select: { name: true, profile: true } });
    const notificationEmail = (company.profile as Record<string, unknown> | null)?.notificationEmail as string | undefined;
    if (!notificationEmail || !mailer.enabled) return { sent: false };

    const doc = estimate.data as Record<string, unknown>;
    const b = calculateEstimateBreakdown(doc) as { grandTotal: number };
    const amount = Number(b.grandTotal || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
    const client = doc.client as string | undefined;
    const lines = [
      `${m.name} marked an estimate Ready on XMTO.`,
      "",
      `Estimate: ${estimate.estimateNumber}`,
      `Project: ${estimate.name || "Untitled estimate"}`,
      ...(client ? [`Client: ${client}`] : []),
      `Amount: ₹${amount}`,
      "",
      "The quotation PDF is attached.",
      "",
      "— XMTO · A XOITT Transformation product · https://xoitt.com",
    ];

    try {
      await mailer.send(
        notificationEmail,
        `${estimate.estimateNumber} is ready — ${estimate.name || "Untitled estimate"}`,
        lines.join("\n"),
        [{ filename: `${estimate.estimateNumber}.pdf`, content: Buffer.from(pdfBase64, "base64"), contentType: "application/pdf" }]
      );
    } catch (e) {
      req.log.warn({ err: e }, "notify-ready email failed");
      return { sent: false };
    }
    return { sent: true };
  });
}
