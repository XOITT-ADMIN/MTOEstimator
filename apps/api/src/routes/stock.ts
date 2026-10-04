import { findItem } from "@mto/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { hasPerm, isOrgAdmin, requireMember, type Member } from "../lib/access.js";
import type { Permission } from "../lib/permissions.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { toNum } from "../lib/num.js";
import type { Deps } from "../app.js";

// A stockKey is trade|item|material|size|secondarySize|core (see @mto/shared's stockKey()) —
// enough to reconstruct a StockLine's descriptive fields when one doesn't exist yet.
function parseStockKey(key: string) {
  const [trade, item, material, size, secondarySize, core] = key.split("|");
  return { trade: trade || "", item: item || "", material: material || "", size: size || "", secondarySize: secondarySize || null, core: core || null };
}

const receiptsSchema = z.object({
  projectId: z.string().min(1, "Pick a project."),
  lines: z.array(
    z.object({
      stockLineId: z.string().min(1),
      qty:         z.number().positive("Quantity must be positive."),
      estimateId:  z.string().optional(),
    })
  ).min(1),
});

const adjustSchema = z.object({
  projectId:   z.string().min(1, "Pick a project."),
  stockLineId: z.string().min(1),
  qty:         z.number(), // signed: positive = stock up, negative = stock down
  reason:      z.string().trim().min(1, "Reason is required for a stock adjustment."),
});

export async function stockRoutes(app: FastifyInstance, { db, hub }: Deps) {
  const auth = { onRequest: [app.authenticate] };

  // Stock is kept per project — the project must be one of this company's.
  const requireProject = async (companyId: string, projectId: string) => {
    const project = await db.project.findUnique({ where: { id: projectId }, select: { companyId: true } });
    if (!project || project.companyId !== companyId) throw notFound("Project not found.");
    return projectId;
  };

  // Roles are per project: what a role allows on one project says nothing about another.
  const allowed = (m: Member, projectId: string, perm: Permission) => hasPerm(m, projectId, perm);
  // Projects this person may see stock for (owner/admin: all, i.e. null).
  const visibleProjects = (m: Member): string[] | null => (isOrgAdmin(m) ? null : Object.keys(m.projectRoles));

  // Receive purchased items into stock. Bought items always go through stock (RECEIPT first,
  // then ISSUE), never straight to site. See XMTO_BUILD_BRIEF.md section 6.
  app.post("/stock/receipts", auth, async (req) => {
    const m = await requireMember(db, req);
    const body = receiptsSchema.parse(req.body);
    body.projectId = await requireProject(m.companyId, body.projectId);
    if (!allowed(m, body.projectId, "stock.in")) throw forbidden("Your role on this project can't stock in purchases.");

    const movements = await db.$transaction(async (tx) => {
      const created: { stockLineId: string; qty: number; newOnHand: number }[] = [];

      for (const entry of body.lines) {
        const stockRows = await tx.$queryRaw<{ key: string; onHand: string }[]>`
          SELECT "key", "onHand" FROM "StockLine"
          WHERE "companyId" = ${m.companyId} AND "projectId" = ${body.projectId} AND "key" = ${entry.stockLineId} FOR UPDATE`;
        let stock = stockRows[0];

        // Nothing in the library under this key yet (e.g. an MTO item that was never added to
        // stock) — a receipt is exactly the moment to create it, not a reason to refuse it.
        if (!stock) {
          const parsed = parseStockKey(entry.stockLineId);
          if (!parsed.trade || !parsed.item) throw notFound(`Stock line "${entry.stockLineId}" not found.`);
          const found = findItem(parsed.trade, parsed.item);
          await tx.stockLine.create({
            data: {
              companyId: m.companyId,
              projectId: body.projectId,
              key: entry.stockLineId,
              trade: parsed.trade,
              family: found?.family ?? "",
              item: parsed.item,
              material: parsed.material,
              size: parsed.size,
              secondarySize: parsed.secondarySize,
              core: parsed.core,
              unit: found?.unit || "Nos",
              onHand: 0,
            },
          });
          stock = { key: entry.stockLineId, onHand: "0" };
        }

        await tx.$executeRaw`
          UPDATE "StockLine" SET "onHand" = "onHand" + ${entry.qty}
          WHERE "companyId" = ${m.companyId} AND "projectId" = ${body.projectId} AND "key" = ${entry.stockLineId}`;

        await tx.stockMovement.create({
          data: {
            companyId:   m.companyId,
            projectId:   body.projectId,
            stockLineId: entry.stockLineId,
            type:        "RECEIPT",
            qty:         entry.qty,
            estimateId:  entry.estimateId || null,
            createdById: m.userId,
          },
        });

        created.push({
          stockLineId: entry.stockLineId,
          qty:         entry.qty,
          newOnHand:   toNum(stock.onHand) + entry.qty,
        });
      }

      return created;
    });

    hub.publish(m.companyId, "stock", { by: m.userId });
    return { receipts: movements };
  });

  // Lines flagged "to buy" during procurement that are still short (qty not yet issued),
  // grouped by stockKey so Procurement can see total external-purchase demand across every
  // waiting MTO, receive it into stock once, then go issue it per MTO. See the Procurement
  // endpoint (/mtos/:id/procurement) — purchasedQty is recorded there but never auto-received;
  // this is the list that closes that loop.
  app.get("/stock/pending-purchases", auth, async (req) => {
    const m = await requireMember(db, req);
    const qs = req.query as { projectId?: string };
    if (qs.projectId) {
      await requireProject(m.companyId, qs.projectId);
      if (!allowed(m, qs.projectId, "stock.in")) throw forbidden("Your role on this project can't see pending purchases.");
    }
    // Without a project: every project this person does procurement on.
    const procurementProjects = isOrgAdmin(m) ? null : Object.keys(m.projectRoles).filter((pid) => allowed(m, pid, "stock.in"));
    if (!qs.projectId && procurementProjects && !procurementProjects.length) throw forbidden("Your roles don't allow seeing pending purchases.");

    const lines = await db.estimateLine.findMany({
      where: {
        companyId: m.companyId,
        purchasedQty: { gt: 0 },
        estimate: { status: { in: ["BUDGET_OK", "READY_TO_DISPATCH"] }, ...(qs.projectId ? { projectId: qs.projectId } : procurementProjects ? { projectId: { in: procurementProjects } } : {}) },
      },
      select: {
        lineId: true,
        stockKey: true,
        qty: true,
        issuedQty: true,
        purchasedQty: true,
        estimate: { select: { id: true, estimateNumber: true, name: true, projectId: true } },
      },
    });

    // Grouped per project + stockKey: each project has its own store, so demand is never pooled across them.
    const byKey = new Map<string, { projectId: string; stockKey: string; pending: number; mtos: { estimateId: string; estimateNumber: string; name: string; lineId: string; pending: number }[] }>();
    for (const l of lines) {
      const pending = Math.round(Math.max(0, Math.min(toNum(l.purchasedQty), toNum(l.qty) - toNum(l.issuedQty))) * 100) / 100;
      if (pending <= 0) continue;
      const groupKey = `${l.estimate.projectId}::${l.stockKey}`;
      const cur = byKey.get(groupKey) ?? { projectId: l.estimate.projectId, stockKey: l.stockKey, pending: 0, mtos: [] };
      cur.pending = Math.round((cur.pending + pending) * 100) / 100;
      cur.mtos.push({ estimateId: l.estimate.id, estimateNumber: l.estimate.estimateNumber, name: l.estimate.name, lineId: l.lineId, pending });
      byKey.set(groupKey, cur);
    }

    const groups = Array.from(byKey.values());
    const stockLines = groups.length
      ? await db.stockLine.findMany({
          where: { companyId: m.companyId, OR: groups.map((g) => ({ projectId: g.projectId, key: g.stockKey })) },
        })
      : [];
    const stockByKey = new Map(stockLines.map((s) => [`${s.projectId}::${s.key}`, s]));

    const projects = groups.length
      ? await db.project.findMany({ where: { companyId: m.companyId, id: { in: [...new Set(groups.map((g) => g.projectId))] } }, select: { id: true, name: true } })
      : [];
    const projectName = new Map(projects.map((p) => [p.id, p.name]));

    return groups
      .map((row) => {
        const sl = stockByKey.get(`${row.projectId}::${row.stockKey}`);
        // No stock line in this project yet (nothing received here) → describe it from its key.
        const k = parseStockKey(row.stockKey);
        return {
          projectId: row.projectId,
          projectName: projectName.get(row.projectId) ?? "",
          stockKey: row.stockKey,
          trade: sl?.trade ?? k.trade,
          item: sl?.item ?? k.item,
          material: sl?.material ?? k.material,
          size: sl?.size ?? k.size,
          unit: sl?.unit ?? findItem(k.trade, k.item)?.unit ?? "Nos",
          onHand: sl ? toNum(sl.onHand) : 0,
          pending: row.pending,
          mtos: row.mtos,
        };
      })
      .sort((a, b) => b.pending - a.pending);
  });

  // Manual stock correction by Procurement or Admin. Reason is always required.
  app.post("/stock/adjust", auth, async (req) => {
    const m = await requireMember(db, req);
    const body = adjustSchema.parse(req.body);
    body.projectId = await requireProject(m.companyId, body.projectId);
    if (!allowed(m, body.projectId, "stock.adjust")) throw forbidden("Your role on this project can't adjust stock.");

    const result = await db.$transaction(async (tx) => {
      const stockRows = await tx.$queryRaw<{ key: string; onHand: string }[]>`
        SELECT "key", "onHand" FROM "StockLine"
        WHERE "companyId" = ${m.companyId} AND "projectId" = ${body.projectId} AND "key" = ${body.stockLineId} FOR UPDATE`;
      const stock = stockRows[0];
      if (!stock) throw notFound(`Stock line "${body.stockLineId}" not found.`);

      const newOnHand = toNum(stock.onHand) + body.qty;
      if (newOnHand < 0) throw badRequest("Adjustment would push stock below zero. Check the quantity.");

      await tx.$executeRaw`
        UPDATE "StockLine" SET "onHand" = "onHand" + ${body.qty}
        WHERE "companyId" = ${m.companyId} AND "projectId" = ${body.projectId} AND "key" = ${body.stockLineId}`;

      await tx.stockMovement.create({
        data: {
          companyId:   m.companyId,
          projectId:   body.projectId,
          stockLineId: body.stockLineId,
          type:        "ADJUST",
          qty:         body.qty,
          reason:      body.reason,
          createdById: m.userId,
        },
      });

      return { stockLineId: body.stockLineId, qty: body.qty, newOnHand };
    });

    hub.publish(m.companyId, "stock", { by: m.userId });
    return result;
  });

  // Returns report: material returned to a project's stock when an MTO or the whole project is
  // closed, and from which MTO — newest first.
  app.get("/stock/returns", auth, async (req) => {
    const m = await requireMember(db, req);
    const rows = await db.stockMovement.findMany({
      where: { companyId: m.companyId, type: "RETURN", sourceProjectId: visibleProjects(m) ? { in: visibleProjects(m)! } : { not: null } },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    const projectIds = [...new Set(rows.map((r) => r.sourceProjectId!))];
    const estimateIds = [...new Set(rows.map((r) => r.estimateId).filter((x): x is string => !!x))];
    const [projects, estimates] = await Promise.all([
      projectIds.length ? db.project.findMany({ where: { companyId: m.companyId, id: { in: projectIds } }, select: { id: true, name: true } }) : [],
      estimateIds.length ? db.estimate.findMany({ where: { companyId: m.companyId, id: { in: estimateIds } }, select: { id: true, estimateNumber: true, name: true } }) : [],
    ]);
    const projectName = new Map(projects.map((p) => [p.id, p.name]));
    const estimateById = new Map(estimates.map((e) => [e.id, e]));
    return rows.map((r) => ({
      id: r.id,
      stockKey: r.stockLineId,
      qty: toNum(r.qty),
      at: r.createdAt.getTime(),
      reason: r.reason,
      projectId: r.sourceProjectId,
      projectName: projectName.get(r.sourceProjectId!) ?? "",
      estimateId: r.estimateId,
      estimateNumber: r.estimateId ? estimateById.get(r.estimateId)?.estimateNumber ?? "" : "",
      estimateName: r.estimateId ? estimateById.get(r.estimateId)?.name ?? "" : "",
    }));
  });

  // Stock ledger: every movement for a given stock line, newest first.
  app.get("/stock/movements", auth, async (req) => {
    const m = await requireMember(db, req);
    const qs = req.query as { stockLineId?: string; projectId?: string; from?: string; to?: string };
    if (!qs.stockLineId) throw badRequest("Provide stockLineId.");
    if (!qs.projectId) throw badRequest("Provide projectId.");
    const storeId = await requireProject(m.companyId, qs.projectId);
    if (!isOrgAdmin(m) && !m.projectRoles[qs.projectId]) throw forbidden("You're not on that project.");

    const where: Record<string, unknown> = { companyId: m.companyId, projectId: storeId, stockLineId: qs.stockLineId };
    if (qs.from || qs.to) {
      const createdAt: Record<string, Date> = {};
      if (qs.from) createdAt.gte = new Date(Number(qs.from));
      if (qs.to)   createdAt.lte = new Date(Number(qs.to));
      where.createdAt = createdAt;
    }

    const rows = await db.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return rows.map((r) => ({
      id:          r.id,
      type:        r.type,
      qty:         toNum(r.qty),
      estimateId:  r.estimateId,
      projectId:   r.projectId,
      sourceProjectId: r.sourceProjectId,
      reason:      r.reason,
      createdById: r.createdById,
      at:          r.createdAt.getTime(),
    }));
  });
}
