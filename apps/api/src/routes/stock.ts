import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { requireMember } from "../lib/access.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { toNum } from "../lib/num.js";
import type { Deps } from "../app.js";

const receiptsSchema = z.object({
  lines: z.array(
    z.object({
      stockLineId: z.string().min(1),
      qty:         z.number().positive("Quantity must be positive."),
      estimateId:  z.string().optional(),
    })
  ).min(1),
});

const adjustSchema = z.object({
  stockLineId: z.string().min(1),
  qty:         z.number(), // signed: positive = stock up, negative = stock down
  reason:      z.string().trim().min(1, "Reason is required for a stock adjustment."),
});

export async function stockRoutes(app: FastifyInstance, { db, hub }: Deps) {
  const auth = { onRequest: [app.authenticate] };

  const isProcurement = (roles: string[]) =>
    roles.includes("procurement") || roles.includes("owner") || roles.includes("admin");

  // Receive purchased items into stock. Bought items always go through stock (RECEIPT first,
  // then ISSUE), never straight to site. See XMTO_BUILD_BRIEF.md section 6.
  app.post("/stock/receipts", auth, async (req) => {
    const m = await requireMember(db, req);
    if (!isProcurement(m.roles)) throw forbidden("Only Procurement, Admin or Owner can receive stock.");
    const body = receiptsSchema.parse(req.body);

    const movements = await db.$transaction(async (tx) => {
      const created: { stockLineId: string; qty: number; newOnHand: number }[] = [];

      for (const entry of body.lines) {
        const stockRows = await tx.$queryRaw<{ key: string; onHand: string }[]>`
          SELECT "key", "onHand" FROM "StockLine"
          WHERE "companyId" = ${m.companyId} AND "key" = ${entry.stockLineId} FOR UPDATE`;
        const stock = stockRows[0];
        if (!stock) throw notFound(`Stock line "${entry.stockLineId}" not found.`);

        await tx.$executeRaw`
          UPDATE "StockLine" SET "onHand" = "onHand" + ${entry.qty}
          WHERE "companyId" = ${m.companyId} AND "key" = ${entry.stockLineId}`;

        await tx.stockMovement.create({
          data: {
            companyId:   m.companyId,
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

  // Manual stock correction by Procurement or Admin. Reason is always required.
  app.post("/stock/adjust", auth, async (req) => {
    const m = await requireMember(db, req);
    if (!isProcurement(m.roles)) throw forbidden("Only Procurement, Admin or Owner can adjust stock.");
    const body = adjustSchema.parse(req.body);

    const result = await db.$transaction(async (tx) => {
      const stockRows = await tx.$queryRaw<{ key: string; onHand: string }[]>`
        SELECT "key", "onHand" FROM "StockLine"
        WHERE "companyId" = ${m.companyId} AND "key" = ${body.stockLineId} FOR UPDATE`;
      const stock = stockRows[0];
      if (!stock) throw notFound(`Stock line "${body.stockLineId}" not found.`);

      const newOnHand = toNum(stock.onHand) + body.qty;
      if (newOnHand < 0) throw badRequest("Adjustment would push stock below zero. Check the quantity.");

      await tx.$executeRaw`
        UPDATE "StockLine" SET "onHand" = "onHand" + ${body.qty}
        WHERE "companyId" = ${m.companyId} AND "key" = ${body.stockLineId}`;

      await tx.stockMovement.create({
        data: {
          companyId:   m.companyId,
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

  // Stock ledger: every movement for a given stock line, newest first.
  app.get("/stock/movements", auth, async (req) => {
    const m = await requireMember(db, req);
    const qs = req.query as { stockLineId?: string; from?: string; to?: string };
    if (!qs.stockLineId) throw badRequest("Provide stockLineId.");

    const where: Record<string, unknown> = { companyId: m.companyId, stockLineId: qs.stockLineId };
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
      reason:      r.reason,
      createdById: r.createdById,
      at:          r.createdAt.getTime(),
    }));
  });
}
