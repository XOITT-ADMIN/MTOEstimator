import { stockKey } from "@mto/shared";

import type { Db } from "../db.js";
import { toNum } from "../lib/num.js";
import { stockSchema } from "./schemas.js";

// Stock lines of one project as the app sees them: on hand, used (summed from every estimate line
// in that project that draws on stock) and where it's used. "available" = stock − used.
export async function listStock(db: Db, companyId: string, projectId: string) {
  const [lines, used] = await Promise.all([
    db.stockLine.findMany({ where: { companyId, projectId }, orderBy: [{ trade: "asc" }, { item: "asc" }, { key: "asc" }] }),
    db.estimateLine.findMany({
      where: { companyId, estimate: { projectId } },
      select: { stockKey: true, qty: true, estimateId: true, estimate: { select: { name: true, estimateNumber: true } } },
    }),
  ]);

  const byKey = new Map<string, { used: number; usedIn: { estimateId: string; estimateName: string; estimateNumber: string; qty: number }[] }>();
  for (const u of used) {
    const cur = byKey.get(u.stockKey) ?? { used: 0, usedIn: [] };
    const qty = toNum(u.qty);
    cur.used = Math.round((cur.used + qty) * 100) / 100;
    const existing = cur.usedIn.find((x) => x.estimateId === u.estimateId);
    if (existing) existing.qty = Math.round((existing.qty + qty) * 100) / 100;
    else cur.usedIn.push({ estimateId: u.estimateId, estimateName: u.estimate.name, estimateNumber: u.estimate.estimateNumber, qty });
    byKey.set(u.stockKey, cur);
  }

  return lines.map((l) => {
    const u = byKey.get(l.key) ?? { used: 0, usedIn: [] };
    const stock = toNum(l.onHand);
    return {
      id: l.key,
      key: l.key,
      trade: l.trade,
      family: l.family,
      item: l.item,
      material: l.material,
      size: l.size,
      secondarySize: l.secondarySize,
      core: l.core,
      unit: l.unit,
      stock,
      price: toNum(l.price),
      used: u.used,
      available: Math.round((stock - u.used) * 100) / 100,
      usedIn: u.usedIn,
    };
  });
}

export async function upsertStock(db: Db, companyId: string, projectId: string, raw: unknown) {
  const e = stockSchema.parse(raw);
  const key = stockKey({ ...e, material: e.material ?? "", size: e.size ?? "" });
  const data = {
    trade: e.trade,
    family: e.family ?? "",
    item: e.item,
    material: e.material ?? "",
    size: e.size ?? "",
    secondarySize: e.secondarySize || null,
    core: e.core || null,
    unit: e.unit || "Nos",
    onHand: Math.max(0, Math.round(e.stock * 100) / 100),
  };
  // A doc without a price (older app build) leaves the stored price as it is.
  const price = e.price == null ? undefined : Math.max(0, Math.round(e.price * 100) / 100);
  await db.stockLine.upsert({
    where: { companyId_projectId_key: { companyId, projectId, key } },
    create: { companyId, projectId, key, ...data, price: price ?? 0 },
    update: price == null ? data : { ...data, price },
  });
  return key;
}
