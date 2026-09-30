import { findItem } from "@mto/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { requireMember } from "../lib/access.js";
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

  // Lines flagged "to buy" during procurement that are still short (qty not yet issued),
  // grouped by stockKey so Procurement can see total external-purchase demand across every
  // waiting MTO, receive it into stock once, then go issue it per MTO. See the Procurement
  // endpoint (/mtos/:id/procurement) — purchasedQty is recorded there but never auto-received;
  // this is the list that closes that loop.
  app.get("/stock/pending-purchases", auth, async (req) => {
    const m = await requireMember(db, req);
    if (!isProcurement(m.roles)) throw forbidden("Only Procurement, Admin or Owner can see pending purchases.");

    const lines = await db.estimateLine.findMany({
      where: {
        companyId: m.companyId,
        purchasedQty: { gt: 0 },
        estimate: { status: { in: ["BUDGET_OK", "READY_TO_DISPATCH"] } },
      },
      select: {
        lineId: true,
        stockKey: true,
        qty: true,
        issuedQty: true,
        purchasedQty: true,
        estimate: { select: { id: true, estimateNumber: true, name: true } },
      },
    });

    const byKey = new Map<string, { stockKey: string; pending: number; mtos: { estimateId: string; estimateNumber: string; name: string; lineId: string; pending: number }[] }>();
    for (const l of lines) {
      const pending = Math.round(Math.max(0, Math.min(toNum(l.purchasedQty), toNum(l.qty) - toNum(l.issuedQty))) * 100) / 100;
      if (pending <= 0) continue;
      const cur = byKey.get(l.stockKey) ?? { stockKey: l.stockKey, pending: 0, mtos: [] };
      cur.pending = Math.round((cur.pending + pending) * 100) / 100;
      cur.mtos.push({ estimateId: l.estimate.id, estimateNumber: l.estimate.estimateNumber, name: l.estimate.name, lineId: l.lineId, pending });
      byKey.set(l.stockKey, cur);
    }

    const keys = Array.from(byKey.keys());
    const stockLines = keys.length
      ? await db.stockLine.findMany({ where: { companyId: m.companyId, key: { in: keys } } })
      : [];
    const stockByKey = new Map(stockLines.map((s) => [s.key, s]));

    return Array.from(byKey.values())
      .map((row) => {
        const sl = stockByKey.get(row.stockKey);
        return {
          stockKey: row.stockKey,
          trade: sl?.trade ?? "",
          item: sl?.item ?? "",
          material: sl?.material ?? "",
          size: sl?.size ?? "",
          unit: sl?.unit ?? "Nos",
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
