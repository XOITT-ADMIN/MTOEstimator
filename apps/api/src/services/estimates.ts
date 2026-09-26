import { stockKey } from "@mto/shared";

import { Prisma, type Db } from "../db.js";
import { ADMIN_ONLY_STATUSES, can, type Member } from "../lib/access.js";
import { conflict, forbidden } from "../lib/errors.js";
import { round2, toNum } from "../lib/num.js";
import { estimateSchema, type EstimateDoc } from "./schemas.js";

// Estimates in these states no longer draw on stock (same rule the app used on its own).
export const RELEASED_STATUSES = new Set(["Rejected"]);

export interface Shortage {
  key: string;
  item: string;
  requested: number;
  available: number;
  unit: string;
  notStocked?: boolean; // no stock line at all for this item · material · size
}

export type SaveResult =
  | { status: "saved"; item: Record<string, unknown> }
  | { status: "stale"; item: Record<string, unknown> };

function visibleWhere(m: Member): Prisma.EstimateWhereInput {
  return can.seeAllEstimates(m.role)
    ? { companyId: m.companyId, deletedAt: null }
    : { companyId: m.companyId, deletedAt: null, createdById: m.userId };
}

export async function listEstimates(db: Db, m: Member) {
  const rows = await db.estimate.findMany({ where: visibleWhere(m), orderBy: { updatedAt: "desc" } });
  return rows.map((r) => r.data as Record<string, unknown>);
}

function linesOf(doc: EstimateDoc) {
  if (RELEASED_STATUSES.has(doc.status)) return [];
  return doc.items
    .filter((it) => it.qty > 0)
    .map((it) => ({
      lineId: it.id,
      unit: String((it as Record<string, unknown>).unit ?? ""),
      stockKey: stockKey({ trade: it.trade, item: it.item, material: it.material ?? "", size: it.size ?? "", secondarySize: it.secondarySize, core: it.core }),
      qty: round2(it.qty),
    }));
}

function sumByKey(lines: { stockKey: string; qty: number }[]) {
  const m = new Map<string, number>();
  for (const l of lines) m.set(l.stockKey, round2((m.get(l.stockKey) ?? 0) + l.qty));
  return m;
}

/**
 * Saves one estimate (create or update) in a single transaction.
 *
 * Stock safety: for every stock line this save asks MORE of than before, the stock rows are
 * locked (SELECT … FOR UPDATE, in key order so two saves can't deadlock), what every OTHER
 * estimate already uses is summed, and the save is refused with a list of shortages if it would
 * take more than is on hand. Two engineers racing for the last 10 m of pipe are therefore
 * serialised by Postgres: the first commits, the second sees 0 left and is refused.
 *
 * A line whose item · material · size has no stock line at all counts as 0 available: it is
 * "not in stock" and refused the same way. Lines that aren't asking for more than they already
 * had are never re-checked, so estimates made before a stock line was removed still save.
 */
export async function saveEstimate(db: Db, m: Member, raw: unknown, stockPolicy: string): Promise<SaveResult> {
  if (!can.editEstimates(m.role)) throw forbidden("Viewers can't edit estimates.");
  const doc = estimateSchema.parse(raw);

  return db.$transaction(async (tx): Promise<SaveResult> => {
    const existing = await tx.estimate.findUnique({ where: { companyId_id: { companyId: m.companyId, id: doc.id } } });

    if (existing && !existing.deletedAt) {
      if (!can.seeAllEstimates(m.role) && existing.createdById !== m.userId) throw forbidden("That estimate belongs to someone else.");
      if (Number(existing.clientUpdatedAt) > doc.updatedAt) return { status: "stale", item: existing.data as Record<string, unknown> };
    }

    const prevStatus = existing && !existing.deletedAt ? existing.status : "Draft";
    if (doc.status !== prevStatus && (ADMIN_ONLY_STATUSES.has(doc.status) || ADMIN_ONLY_STATUSES.has(prevStatus)) && !can.approve(m.role)) {
      throw forbidden(`Only an owner or admin can move an estimate to or from "${ADMIN_ONLY_STATUSES.has(doc.status) ? doc.status : prevStatus}".`);
    }

    // ── Stock check ──────────────────────────────────────────────────────────────────────────
    const nextLines = linesOf(doc);
    const nextByKey = sumByKey(nextLines);
    const prevLines = existing ? await tx.estimateLine.findMany({ where: { companyId: m.companyId, estimateId: doc.id } }) : [];
    const prevByKey = sumByKey(prevLines.map((l) => ({ stockKey: l.stockKey, qty: toNum(l.qty) })));
    const growing = [...nextByKey.entries()].filter(([k, q]) => q > (prevByKey.get(k) ?? 0)).map(([k]) => k).sort();

    if (growing.length) {
      const locked = await tx.$queryRaw<{ key: string; item: string; unit: string; onHand: Prisma.Decimal }[]>`
        SELECT "key", "item", "unit", "onHand" FROM "StockLine"
        WHERE "companyId" = ${m.companyId} AND "key" IN (${Prisma.join(growing)})
        ORDER BY "key" FOR UPDATE`;
      const shortages: Shortage[] = [];
      const lockedKeys = new Set(locked.map((l) => l.key));
      for (const k of growing) {
        if (lockedKeys.has(k)) continue;
        const [, item] = k.split("|");
        const unit = nextLines.find((l) => l.stockKey === k)?.unit || "";
        shortages.push({ key: k, item: item ?? k, requested: nextByKey.get(k) ?? 0, available: 0, unit, notStocked: true });
      }
      if (locked.length) {
        const others = await tx.$queryRaw<{ stockKey: string; used: Prisma.Decimal }[]>`
          SELECT "stockKey", SUM("qty") AS "used" FROM "EstimateLine"
          WHERE "companyId" = ${m.companyId} AND "estimateId" <> ${doc.id} AND "stockKey" IN (${Prisma.join(locked.map((l) => l.key))})
          GROUP BY "stockKey"`;
        const usedByOthers = new Map(others.map((o) => [o.stockKey, toNum(o.used)]));
        for (const s of locked) {
          const available = round2(toNum(s.onHand) - (usedByOthers.get(s.key) ?? 0));
          const requested = nextByKey.get(s.key) ?? 0;
          if (requested > available) shortages.push({ key: s.key, item: s.item, requested, available: Math.max(0, available), unit: s.unit });
        }
      }
      if (shortages.length && stockPolicy === "block") {
        const first = shortages[0];
        const what = first.key.split("|").filter(Boolean).slice(1).join(" · ");
        throw conflict(
          first.notStocked
            ? `${what} is not in stock — there is no stock line for it in the library.`
            : first.available > 0
              ? `Only ${first.available} ${first.unit} left of ${what} — you asked for ${first.requested}.`
              : `${what} is out of stock.`,
          "out_of_stock",
          { shortages }
        );
      }
    }

    // ── Write ────────────────────────────────────────────────────────────────────────────────
    let estimateNumber = existing?.estimateNumber;
    let createdById = existing?.createdById ?? m.userId;
    if (!existing) {
      const c = await tx.company.update({ where: { id: m.companyId }, data: { estimateSeq: { increment: 1 } }, select: { estimateSeq: true } });
      estimateNumber = `EST-${String(c.estimateSeq).padStart(4, "0")}`;
    } else if (existing.deletedAt) {
      createdById = m.userId; // re-created after a delete
    }

    const owner = createdById === m.userId ? { id: m.userId, name: m.name } : ((existing?.data as { createdBy?: unknown })?.createdBy ?? null);
    const data = { ...doc, estimateNumber, createdBy: owner } as Record<string, unknown>;
    const row = {
      estimateNumber: estimateNumber!,
      name: doc.name,
      status: doc.status,
      createdById,
      data: data as Prisma.InputJsonValue,
      clientUpdatedAt: BigInt(doc.updatedAt),
      deletedAt: null,
    };
    await tx.estimate.upsert({
      where: { companyId_id: { companyId: m.companyId, id: doc.id } },
      create: { companyId: m.companyId, id: doc.id, ...row },
      update: row,
    });
    await tx.estimateLine.deleteMany({ where: { companyId: m.companyId, estimateId: doc.id } });
    // Two lines on one estimate can share an id if the app ever duplicates badly — de-dupe.
    const seen = new Set<string>();
    const unique = nextLines.filter((l) => (seen.has(l.lineId) ? false : (seen.add(l.lineId), true)));
    if (unique.length) {
      await tx.estimateLine.createMany({
        data: unique.map((l) => ({ companyId: m.companyId, estimateId: doc.id, lineId: l.lineId, stockKey: l.stockKey, qty: l.qty })),
      });
    }
    return { status: "saved", item: data };
  });
}

export async function deleteEstimate(db: Db, m: Member, id: string) {
  if (!can.editEstimates(m.role)) throw forbidden("Viewers can't delete estimates.");
  const existing = await db.estimate.findUnique({ where: { companyId_id: { companyId: m.companyId, id } } });
  if (!existing || existing.deletedAt) return;
  if (!can.seeAllEstimates(m.role) && existing.createdById !== m.userId) throw forbidden("That estimate belongs to someone else.");
  await db.$transaction([
    db.estimateLine.deleteMany({ where: { companyId: m.companyId, estimateId: id } }),
    db.estimate.update({ where: { companyId_id: { companyId: m.companyId, id } }, data: { deletedAt: new Date() } }),
  ]);
}
