import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { assert, hasPerm, isOrgAdmin, permsIn, requireMember, type Member } from "../lib/access.js";
import { computeSiteBalance, recordReturn, returnMtoLeftover } from "../services/siteStock.js";
import { conflict, forbidden, notFound } from "../lib/errors.js";
import type { Deps } from "../app.js";

// Roles are per project and their permissions are company-defined. Creating a project is an
// owner/admin job; editing/closing it and choosing who works on it are permissions a role can hold.
const membersSchema = z.object({ roles: z.array(z.string().min(1).max(60)).max(50) });

// Short code typed once per project; the MTOs in it are numbered <code>-MTO-0001, 0002, …
const codeField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,12}$/, "Project code: 2–12 letters or digits, no spaces.");

// Optional address emailed when one of the project's MTOs is Ready. Empty clears it.
const emailField = z.union([z.literal(""), z.string().trim().email("Enter a valid email address.").max(160)]).optional();

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the project a name.").max(160),
  code: codeField,
  siteName: z.string().trim().max(200).optional().default(""),
  notificationEmail: emailField,
});
const patchSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  code: codeField.optional(),
  siteName: z.string().trim().max(200).optional(),
  notificationEmail: emailField,
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

function view(p: { id: string; name: string; code: string; mtoSeq: number; siteName: string | null; notificationEmail: string | null; status: string; createdAt: Date; closedAt: Date | null }) {
  return { id: p.id, name: p.name, code: p.code, hasMtos: p.mtoSeq > 0, siteName: p.siteName ?? "", notificationEmail: p.notificationEmail ?? "", status: p.status, createdAt: p.createdAt.getTime(), closedAt: p.closedAt?.getTime() ?? null };
}

// Projects: the sites/jobs MTOs are raised against. Creating, renaming and (from Phase 5)
// closing a project is a PM/Admin/Owner job; everyone in the company can read the list, since
// every role needs it to pick a project or see site progress.
export async function projectRoutes(app: FastifyInstance, { db, hub }: Deps) {
  const auth = { onRequest: [app.authenticate] };

  app.get("/projects", auth, async (req) => {
    const m = await requireMember(db, req);
    // Owner/admin see every project; everyone else only the ones they're on.
    const rows = await db.project.findMany({
      where: { companyId: m.companyId, ...(isOrgAdmin(m) ? {} : { id: { in: Object.keys(m.projectRoles) } }) },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    });
    return rows.map((p) => ({ ...view(p), roles: isOrgAdmin(m) ? [] : (m.projectRoles[p.id] ?? []), permissions: [...permsIn(m, p.id)] }));
  });

  // The project must be this company's and, unless you're owner/admin, one you're on.
  async function loadProject(m: Member, id: string) {
    const project = await db.project.findUnique({ where: { id } });
    if (!project || project.companyId !== m.companyId || (!isOrgAdmin(m) && !m.projectRoles[id])) throw notFound("Project not found.");
    return project;
  }

  app.post("/projects", auth, async (req) => {
    const m = await requireMember(db, req);
    assert(isOrgAdmin(m), "Only an Admin or Owner can create a project.");
    const body = createSchema.parse(req.body);
    const existing = await db.project.findUnique({ where: { companyId_name: { companyId: m.companyId, name: body.name } } });
    if (existing) throw conflict("A project with that name already exists.");
    if (await db.project.findUnique({ where: { companyId_code: { companyId: m.companyId, code: body.code } } })) throw conflict("That project code is already used.");
    const p = await db.project.create({
      data: { companyId: m.companyId, name: body.name, code: body.code, siteName: body.siteName || null, notificationEmail: body.notificationEmail || null, createdById: m.userId },
    });
    hub.publish(m.companyId, "projects", { by: m.userId });
    return view(p);
  });

  app.patch<{ Params: { id: string } }>("/projects/:id", auth, async (req) => {
    const m = await requireMember(db, req);
    const body = patchSchema.parse(req.body);
    const existing = await loadProject(m, req.params.id);
    assert(hasPerm(m, existing.id, "project.edit"), "Your role on this project can't edit it.");
    if (body.code && body.code !== existing.code) {
      if (existing.mtoSeq > 0) throw conflict("The code can't change once the project has MTOs.");
      if (await db.project.findUnique({ where: { companyId_code: { companyId: m.companyId, code: body.code } } })) throw conflict("That project code is already used.");
    }
    if (body.name && body.name !== existing.name) {
      const dupe = await db.project.findUnique({ where: { companyId_name: { companyId: m.companyId, name: body.name } } });
      if (dupe) throw conflict("A project with that name already exists.");
    }
    const p = await db.project.update({ where: { id: existing.id }, data: { name: body.name ?? existing.name, code: body.code ?? existing.code, siteName: body.siteName ?? existing.siteName, notificationEmail: body.notificationEmail === undefined ? existing.notificationEmail : body.notificationEmail || null } });
    hub.publish(m.companyId, "projects", { by: m.userId });
    return view(p);
  });

  // --- Who works on this project, and as what ---
  app.get<{ Params: { id: string } }>("/projects/:id/members", auth, async (req) => {
    const m = await requireMember(db, req);
    const project = await loadProject(m, req.params.id);
    const rows = await db.projectMember.findMany({ where: { projectId: project.id }, include: { user: true }, orderBy: { createdAt: "asc" } });
    return rows.map((r) => ({ userId: r.userId, name: r.user.name, email: r.user.email, roles: r.roles }));
  });

  // Set (or, with no roles, remove) a person's roles on this project.
  app.put<{ Params: { id: string; userId: string } }>("/projects/:id/members/:userId", auth, async (req) => {
    const m = await requireMember(db, req);
    const project = await loadProject(m, req.params.id);
    assert(hasPerm(m, project.id, "project.team"), "Your role on this project can't manage its team.");
    const { roles } = membersSchema.parse(req.body);
    const known = new Set((await db.orgRole.findMany({ where: { companyId: m.companyId }, select: { key: true } })).map((r) => r.key));
    const unknown = roles.find((r) => !known.has(r));
    if (unknown) throw notFound(`There's no role "${unknown}" in this company.`);
    const target = await db.membership.findUnique({ where: { userId: req.params.userId } });
    if (!target || target.companyId !== m.companyId) throw notFound("That person isn't in your company.");
    const unique = [...new Set(roles)];
    if (!unique.length) await db.projectMember.deleteMany({ where: { projectId: project.id, userId: target.userId } });
    else {
      await db.projectMember.upsert({
        where: { projectId_userId: { projectId: project.id, userId: target.userId } },
        create: { companyId: m.companyId, projectId: project.id, userId: target.userId, roles: unique },
        update: { roles: unique },
      });
    }
    hub.publish(m.companyId, "members", { by: m.userId });
    hub.publish(m.companyId, "projects", { by: m.userId });
    return { userId: target.userId, roles: unique };
  });

  // --- Phase 5 routes ---

  app.get<{ Params: { id: string } }>("/projects/:id/site-balance", auth, async (req) => {
    const m = await requireMember(db, req);
    const project = await loadProject(m, req.params.id);
    return computeSiteBalance(db, m.companyId, project.id);
  });

  app.post<{ Params: { id: string } }>("/projects/:id/consumption", auth, async (req) => {
    const m = await requireMember(db, req);
    const project = await loadProject(m, req.params.id);
    if (project.status !== "open") throw forbidden("Cannot record consumption on a closed project.");
    if (!hasPerm(m, project.id, "site.use")) throw forbidden("Your role on this project can't record site use.");

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
    const project = await loadProject(m, req.params.id);

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
    const userIds = [...new Set(rows.map((r) => r.createdById))];
    const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
    const nameMap: Record<string, string> = {};
    for (const u of users) nameMap[u.id] = u.name;
    return rows.map((r) => ({
      id: r.id,
      stockKey: r.stockKey,
      qty: Number(r.qty),
      kind: r.kind,
      entryDate: r.entryDate.toISOString().slice(0, 10),
      note: r.note ?? null,
      createdById: r.createdById,
      createdByName: nameMap[r.createdById] ?? null,
      createdAt: r.createdAt.getTime(),
    }));
  });

  // What a project returned (closed MTOs and the project close).
  app.get<{ Params: { id: string } }>("/projects/:id/returns", auth, async (req) => {
    const m = await requireMember(db, req);
    const project = await loadProject(m, req.params.id);
    const rows = await db.stockMovement.findMany({
      where: { companyId: m.companyId, sourceProjectId: project.id, type: "RETURN" },
      orderBy: { createdAt: "asc" },
    });
    const userIds = [...new Set(rows.map((r) => r.createdById))];
    const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
    const nameMap: Record<string, string> = {};
    for (const u of users) nameMap[u.id] = u.name;
    const estimateIds = [...new Set(rows.map((r) => r.estimateId).filter(Boolean))] as string[];
    const estimates = estimateIds.length ? await db.estimate.findMany({ where: { id: { in: estimateIds } }, select: { id: true, estimateNumber: true, name: true } }) : [];
    const estMap: Record<string, { estimateNumber: string; name: string }> = {};
    for (const e of estimates) estMap[e.id] = { estimateNumber: e.estimateNumber, name: e.name };
    return rows.map((r) => ({
      stockKey: r.stockLineId,
      qty: Number(r.qty),
      reason: r.reason ?? null,
      estimateNumber: r.estimateId ? estMap[r.estimateId]?.estimateNumber ?? null : null,
      estimateName: r.estimateId ? estMap[r.estimateId]?.name ?? null : null,
      createdByName: nameMap[r.createdById] ?? null,
      at: r.createdAt.getTime(),
    }));
  });

  app.post<{ Params: { id: string } }>("/projects/:id/close", auth, async (req) => {
    const m = await requireMember(db, req);
    const project = await loadProject(m, req.params.id);
    assert(hasPerm(m, project.id, "project.edit"), "Your role on this project can't close it.");
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

    const returnedTotals = new Map<string, number>();
    await db.$transaction(async (tx) => {
      const reason = `Project closed: ${project.name}`;
      const onSite = await tx.estimate.findMany({
        where: { companyId: m.companyId, projectId: project.id, status: { in: ["DELIVERED", "IN_USE"] } },
        orderBy: { createdAt: "asc" },
        select: { id: true, estimateNumber: true },
      });

      // Compute site balance once and use it for all MTO returns instead of
      // recomputing inside each returnMtoLeftover call.
      const balance = await computeSiteBalance(tx, m.companyId, project.id);
      const remaining = new Map(balance.map((b) => [b.stockKey, b.balance]));

      // Per-MTO issued quantities for attributed returns.
      const round2 = (n: number) => Math.round(n * 100) / 100;
      for (const e of onSite) {
        const lines = await tx.estimateLine.groupBy({
          by: ["stockKey"],
          where: { companyId: m.companyId, estimateId: e.id, issuedQty: { gt: 0 } },
          _sum: { issuedQty: true },
        });
        for (const l of lines) {
          const qty = round2(Math.min(Number(l._sum.issuedQty ?? 0), remaining.get(l.stockKey) ?? 0));
          if (qty <= 0) continue;
          await recordReturn(tx, m.companyId, m.userId, project, l.stockKey, qty, reason, e.id);
          remaining.set(l.stockKey, round2((remaining.get(l.stockKey) ?? 0) - qty));
          returnedTotals.set(l.stockKey, (returnedTotals.get(l.stockKey) ?? 0) + qty);
        }
      }

      // Anything still left that no single MTO accounts for goes back too.
      for (const [stockKey, bal] of remaining) {
        if (bal <= 1e-9) continue;
        await recordReturn(tx, m.companyId, m.userId, project, stockKey, bal, reason);
        returnedTotals.set(stockKey, (returnedTotals.get(stockKey) ?? 0) + bal);
      }

      await tx.estimate.updateMany({
        where: { companyId: m.companyId, projectId: project.id, status: { in: ["DELIVERED", "IN_USE"] } },
        data: { status: "CLOSED", closedAt: new Date() },
      });

      await tx.project.update({
        where: { id: project.id },
        data: { status: "closed", closedById: m.userId, closedAt: new Date() },
      });
    }, { timeout: 15000 });

    hub.publish(m.companyId, "projects", { by: m.userId });
    hub.publish(m.companyId, "stock", { by: m.userId });
    return { ok: true, returned: Array.from(returnedTotals, ([stockKey, qty]) => ({ stockKey, qty: Math.round(qty * 100) / 100 })) };
  });
}
