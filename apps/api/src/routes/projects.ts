import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { assert, requireMember } from "../lib/access.js";
import { conflict, forbidden, notFound } from "../lib/errors.js";
import type { Deps } from "../app.js";

const canManageProjects = (roles: string[]) => roles.includes("owner") || roles.includes("admin") || roles.includes("project_manager");

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the project a name.").max(160),
  siteName: z.string().trim().max(200).optional().default(""),
});
const patchSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  siteName: z.string().trim().max(200).optional(),
});

const consumptionEntrySchema = z.object({
  stockKey: z.string().min(1),
  qty: z.number().positive("Quantity must be positive."),
  kind: z.enum(["USED", "WASTED"]),
  note: z.string().max(500).optional(),
});
const addConsumptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  entries: z.array(consumptionEntrySchema).min(1, "Provide at least one entry."),
});

function view(p: { id: string; name: string; siteName: string | null; status: string; createdAt: Date; closedAt: Date | null }) {
  return { id: p.id, name: p.name, siteName: p.siteName ?? "", status: p.status, createdAt: p.createdAt.getTime(), closedAt: p.closedAt?.getTime() ?? null };
}

async function computeSiteBalance(db: Deps["db"], companyId: string, projectId: string) {
  const activeStatuses = ["DELIVERED", "IN_USE", "CLOSED"];
  const activeEstimates = await db.estimate.findMany({
    where: { companyId, projectId, status: { in: activeStatuses } },
    select: { id: true },
  });
  const estimateIds = activeEstimates.map((e) => e.id);

  const issuedRows = estimateIds.length
    ? await db.estimateLine.groupBy({
        by: ["stockKey"],
        where: { companyId, estimateId: { in: estimateIds } },
        _sum: { issuedQty: true },
      })
    : [];

  const consumedRows = await db.consumptionEntry.groupBy({
    by: ["stockKey", "kind"],
    where: { companyId, projectId },
    _sum: { qty: true },
  });

  const deliveredMap: Record<string, number> = {};
  for (const r of issuedRows) deliveredMap[r.stockKey] = Number(r._sum.issuedQty ?? 0);

  const usedMap: Record<string, number> = {};
  const wastedMap: Record<string, number> = {};
  for (const r of consumedRows) {
    if (r.kind === "USED") usedMap[r.stockKey] = (usedMap[r.stockKey] ?? 0) + Number(r._sum.qty ?? 0);
    else wastedMap[r.stockKey] = (wastedMap[r.stockKey] ?? 0) + Number(r._sum.qty ?? 0);
  }

  const allKeys = new Set([...Object.keys(deliveredMap), ...Object.keys(usedMap), ...Object.keys(wastedMap)]);
  return Array.from(allKeys).map((k) => {
    const delivered = deliveredMap[k] ?? 0;
    const used = usedMap[k] ?? 0;
    const wasted = wastedMap[k] ?? 0;
    return { stockKey: k, delivered, used, wasted, balance: delivered - used - wasted };
  });
}

// Projects: the sites/jobs MTOs are raised against. Creating, renaming and (from Phase 5)
// closing a project is a PM/Admin/Owner job; everyone in the company can read the list, since
// every role needs it to pick a project or see site progress.
export async function projectRoutes(app: FastifyInstance, { db, hub }: Deps) {
  const auth = { onRequest: [app.authenticate] };

  app.get("/projects", auth, async (req) => {
    const m = await requireMember(db, req);
    const rows = await db.project.findMany({ where: { companyId: m.companyId }, orderBy: [{ status: "asc" }, { updatedAt: "desc" }] });
    return rows.map(view);
  });

  app.post("/projects", auth, async (req) => {
    const m = await requireMember(db, req);
    assert(canManageProjects(m.roles), "Only a Project Manager, Admin or Owner can create a project.");
    const body = createSchema.parse(req.body);
    const existing = await db.project.findUnique({ where: { companyId_name: { companyId: m.companyId, name: body.name } } });
    if (existing) throw conflict("A project with that name already exists.");
    const p = await db.project.create({
      data: { companyId: m.companyId, name: body.name, siteName: body.siteName || null, createdById: m.userId },
    });
    hub.publish(m.companyId, "projects", { by: m.userId });
    return view(p);
  });

  app.patch<{ Params: { id: string } }>("/projects/:id", auth, async (req) => {
    const m = await requireMember(db, req);
    assert(canManageProjects(m.roles), "Only a Project Manager, Admin or Owner can edit a project.");
    const body = patchSchema.parse(req.body);
    const existing = await db.project.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.companyId !== m.companyId) throw notFound("Project not found.");
    if (body.name && body.name !== existing.name) {
      const dupe = await db.project.findUnique({ where: { companyId_name: { companyId: m.companyId, name: body.name } } });
      if (dupe) throw conflict("A project with that name already exists.");
    }
    const p = await db.project.update({ where: { id: existing.id }, data: { name: body.name ?? existing.name, siteName: body.siteName ?? existing.siteName } });
    hub.publish(m.companyId, "projects", { by: m.userId });
    return view(p);
  });

  // --- Phase 5 routes ---

  app.get<{ Params: { id: string } }>("/projects/:id/site-balance", auth, async (req) => {
    const m = await requireMember(db, req);
    const project = await db.project.findUnique({ where: { id: req.params.id } });
    if (!project || project.companyId !== m.companyId) throw notFound("Project not found.");
    return computeSiteBalance(db, m.companyId, project.id);
  });

  app.post<{ Params: { id: string } }>("/projects/:id/consumption", auth, async (req) => {
    const m = await requireMember(db, req);
    const project = await db.project.findUnique({ where: { id: req.params.id } });
    if (!project || project.companyId !== m.companyId) throw notFound("Project not found.");
    if (project.status !== "open") throw forbidden("Cannot record consumption on a closed project.");

    const body = addConsumptionSchema.parse(req.body);
    const entryDate = new Date(`${body.date}T00:00:00.000Z`);

    // Validate that no entry would push balance below zero
    const balance = await computeSiteBalance(db, m.companyId, project.id);
    const balanceMap: Record<string, number> = {};
    for (const b of balance) balanceMap[b.stockKey] = b.balance;

    // Aggregate the new entries by stockKey (sum of USED+WASTED both count against balance)
    const newTotals: Record<string, number> = {};
    for (const e of body.entries) {
      newTotals[e.stockKey] = (newTotals[e.stockKey] ?? 0) + e.qty;
    }
    for (const [key, qty] of Object.entries(newTotals)) {
      const current = balanceMap[key] ?? 0;
      if (qty > current + 1e-9) {
        throw forbidden(`Quantity ${qty} for ${key} exceeds site balance of ${current.toFixed(2)}.`);
      }
    }

    // Insert all entries and auto-advance any DELIVERED MTOs to IN_USE
    await db.$transaction(async (tx) => {
      await tx.consumptionEntry.createMany({
        data: body.entries.map((e) => ({
          companyId: m.companyId,
          projectId: project.id,
          stockKey: e.stockKey,
          qty: e.qty,
          kind: e.kind as "USED" | "WASTED",
          entryDate,
          note: e.note ?? null,
          createdById: m.userId,
        })),
      });

      // Auto-advance DELIVERED MTOs in this project to IN_USE
      await tx.estimate.updateMany({
        where: { companyId: m.companyId, projectId: project.id, status: "DELIVERED" },
        data: { status: "IN_USE" },
      });
    });

    hub.publish(m.companyId, "projects", { by: m.userId });
    return { ok: true };
  });

  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>("/projects/:id/consumption", auth, async (req) => {
    const m = await requireMember(db, req);
    const project = await db.project.findUnique({ where: { id: req.params.id } });
    if (!project || project.companyId !== m.companyId) throw notFound("Project not found.");

    const where: Record<string, unknown> = { companyId: m.companyId, projectId: project.id };
    const { from, to } = req.query as { from?: string; to?: string };
    if (from || to) {
      where.entryDate = {
        ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
      };
    }

    const rows = await db.consumptionEntry.findMany({
      where,
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((r) => ({
      id: r.id,
      stockKey: r.stockKey,
      qty: Number(r.qty),
      kind: r.kind,
      entryDate: r.entryDate.toISOString().slice(0, 10),
      note: r.note ?? null,
      createdById: r.createdById,
      createdAt: r.createdAt.getTime(),
    }));
  });

  app.post<{ Params: { id: string } }>("/projects/:id/close", auth, async (req) => {
    const m = await requireMember(db, req);
    assert(canManageProjects(m.roles), "Only a Project Manager, Admin or Owner can close a project.");
    const project = await db.project.findUnique({ where: { id: req.params.id } });
    if (!project || project.companyId !== m.companyId) throw notFound("Project not found.");
    if (project.status !== "open") throw conflict("Project is already closed.");

    // Block if any MTOs are still in an active workflow state
    const BLOCKING = ["SUBMITTED", "APPROVED", "BUDGET_OK", "SENT_BACK", "READY_TO_DISPATCH", "DISPATCHED"];
    const blocker = await db.estimate.findFirst({
      where: { companyId: m.companyId, projectId: project.id, status: { in: BLOCKING } },
      select: { estimateNumber: true, status: true },
    });
    if (blocker) {
      throw forbidden(`Cannot close: ${blocker.estimateNumber} is still ${blocker.status.replace(/_/g, " ").toLowerCase()}. Resolve all pending MTOs first.`);
    }

    // Compute what goes back to stock (USED balance only — wasted stays wasted)
    const balance = await computeSiteBalance(db, m.companyId, project.id);
    const returnable = balance.filter((b) => b.balance > 1e-9);

    await db.$transaction(async (tx) => {
      // Return balance per stockKey to stock
      for (const b of returnable) {
        const sl = await tx.stockLine.findUnique({ where: { companyId_key: { companyId: m.companyId, key: b.stockKey } } });
        if (!sl) continue;
        await tx.stockLine.update({
          where: { companyId_key: { companyId: m.companyId, key: b.stockKey } },
          data: { onHand: { increment: b.balance } },
        });
        await tx.stockMovement.create({
          data: {
            companyId: m.companyId,
            stockLineId: b.stockKey,
            type: "RETURN",
            qty: b.balance,
            projectId: project.id,
            reason: `Project close: ${project.name}`,
            createdById: m.userId,
          },
        });
      }

      // Close all DELIVERED and IN_USE MTOs
      await tx.estimate.updateMany({
        where: { companyId: m.companyId, projectId: project.id, status: { in: ["DELIVERED", "IN_USE"] } },
        data: { status: "CLOSED", closedAt: new Date() },
      });

      // Close the project
      await tx.project.update({
        where: { id: project.id },
        data: { status: "closed", closedById: m.userId, closedAt: new Date() },
      });
    });

    hub.publish(m.companyId, "projects", { by: m.userId });
    return { ok: true, returned: returnable.map((b) => ({ stockKey: b.stockKey, qty: b.balance })) };
  });
}
