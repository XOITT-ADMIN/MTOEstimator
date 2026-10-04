import { findItem } from "@mto/shared";

import type { Db } from "../db.js";

// Works on the db or on a transaction client.
type Client = Pick<Db, "estimate" | "estimateLine" | "consumptionEntry" | "stockMovement" | "stockLine" | "$executeRaw">;

const round2 = (n: number) => Math.round(n * 100) / 100;

// Material on a project's site, per item: delivered (issued on DELIVERED/IN_USE/CLOSED MTOs),
// minus used, wasted and anything already returned. `mtos` says which MTOs
// delivered it.
export async function computeSiteBalance(db: Client, companyId: string, projectId: string) {
  const activeStatuses = ["DELIVERED", "IN_USE", "CLOSED"];
  const activeEstimates = await db.estimate.findMany({
    where: { companyId, projectId, status: { in: activeStatuses } },
    select: { id: true },
  });
  const estimateIds = activeEstimates.map((e) => e.id);

  const issuedLines = estimateIds.length
    ? await db.estimateLine.findMany({
        where: { companyId, estimateId: { in: estimateIds }, issuedQty: { gt: 0 } },
        select: { stockKey: true, issuedQty: true, estimate: { select: { id: true, estimateNumber: true, name: true } } },
      })
    : [];

  const returnedRows = await db.stockMovement.groupBy({
    by: ["stockLineId"],
    where: { companyId, sourceProjectId: projectId, type: "RETURN" },
    _sum: { qty: true },
  });
  const returnedMap: Record<string, number> = {};
  for (const r of returnedRows) returnedMap[r.stockLineId] = Number(r._sum.qty ?? 0);

  const consumedRows = await db.consumptionEntry.groupBy({
    by: ["stockKey", "kind"],
    where: { companyId, projectId },
    _sum: { qty: true },
  });

  const deliveredMap: Record<string, number> = {};
  const mtosMap: Record<string, { estimateId: string; estimateNumber: string; name: string; issued: number }[]> = {};
  for (const l of issuedLines) {
    const qty = Number(l.issuedQty);
    deliveredMap[l.stockKey] = (deliveredMap[l.stockKey] ?? 0) + qty;
    const list = (mtosMap[l.stockKey] ??= []);
    const existing = list.find((x) => x.estimateId === l.estimate.id);
    if (existing) existing.issued += qty;
    else list.push({ estimateId: l.estimate.id, estimateNumber: l.estimate.estimateNumber, name: l.estimate.name, issued: qty });
  }

  const usedMap: Record<string, number> = {};
  const wastedMap: Record<string, number> = {};
  for (const r of consumedRows) {
    if (r.kind === "USED") usedMap[r.stockKey] = (usedMap[r.stockKey] ?? 0) + Number(r._sum.qty ?? 0);
    else wastedMap[r.stockKey] = (wastedMap[r.stockKey] ?? 0) + Number(r._sum.qty ?? 0);
  }

  const allKeys = new Set([...Object.keys(deliveredMap), ...Object.keys(usedMap), ...Object.keys(wastedMap), ...Object.keys(returnedMap)]);
  return Array.from(allKeys).map((k) => {
    const delivered = deliveredMap[k] ?? 0;
    const used = usedMap[k] ?? 0;
    const wasted = wastedMap[k] ?? 0;
    const returned = returnedMap[k] ?? 0;
    return { stockKey: k, delivered, used, wasted, returned, balance: round2(delivered - used - wasted - returned), mtos: mtosMap[k] ?? [] };
  });
}

// Record that `qty` of an item came back from a project's site (and the MTO it was delivered for):
// it goes back onto that project's own stock (Library › Stock) and is logged as a Return in the
// stock ledger and the returns report; it also comes off the project's site balance.
export async function recordReturn(
  tx: Client,
  companyId: string,
  userId: string,
  project: { id: string; name: string },
  stockKeyStr: string,
  qty: number,
  reason: string,
  estimateId: string | null = null,
) {
  const updated = await tx.$executeRaw`
    UPDATE "StockLine" SET "onHand" = "onHand" + ${qty}, "updatedAt" = now()
    WHERE "companyId" = ${companyId} AND "projectId" = ${project.id} AND "key" = ${stockKeyStr}`;
  if (!updated) {
    // The project's stock line was deleted after the issue — bring it back from the key.
    const [trade = "", item = "", material = "", size = "", secondarySize = "", core = ""] = stockKeyStr.split("|");
    await tx.stockLine.create({
      data: { companyId, projectId: project.id, key: stockKeyStr, trade, item, material, size, secondarySize: secondarySize || null, core: core || null, unit: findItem(trade, item)?.unit || "Nos", onHand: qty },
    });
  }
  await tx.stockMovement.create({
    data: { companyId, stockLineId: stockKeyStr, type: "RETURN", qty, projectId: project.id, sourceProjectId: project.id, estimateId, reason, createdById: userId },
  });
}

// An MTO is closing: send back what it delivered and the site hasn't used. Use is logged per
// project, not per MTO, so each item is capped at what's still on the project's site — an MTO
// never returns more than it was issued, nor more than is actually left.
export async function returnMtoLeftover(
  tx: Client,
  companyId: string,
  userId: string,
  project: { id: string; name: string },
  estimate: { id: string; estimateNumber: string },
  reason: string,
) {
  const lines = await tx.estimateLine.groupBy({
    by: ["stockKey"],
    where: { companyId, estimateId: estimate.id, issuedQty: { gt: 0 } },
    _sum: { issuedQty: true },
  });
  const balance = await computeSiteBalance(tx, companyId, project.id);
  const left = new Map(balance.map((b) => [b.stockKey, b.balance]));

  const returned: { stockKey: string; qty: number }[] = [];
  for (const l of lines) {
    const qty = round2(Math.min(Number(l._sum.issuedQty ?? 0), left.get(l.stockKey) ?? 0));
    if (qty <= 0) continue;
    await recordReturn(tx, companyId, userId, project, l.stockKey, qty, reason, estimate.id);
    returned.push({ stockKey: l.stockKey, qty });
  }
  return returned;
}
