import { stockKey } from "@mto/shared";

import { Prisma, type Db } from "../db.js";
import { hasPerm, isOrgAdmin, projectIdsOf, type Member } from "../lib/access.js";
import { conflict, forbidden, notFound } from "../lib/errors.js";
import { estimateSchema } from "./schemas.js";

// An MTO can only be edited (items, details, notes — anything) while it's in one of these
// statuses. Once it's moved on, the only way to change it is the transition endpoint (or, from
// Phase 3 onward, the procurement / dispatch / consumption endpoints).
const EDITABLE_STATUSES = new Set(["DRAFT", "REJECTED"]);

export type SaveResult =
  | { status: "saved"; item: Record<string, unknown> }
  | { status: "stale"; item: Record<string, unknown> };

// Owner/admin see every MTO. Everyone else sees the MTOs of the projects they're on — all of
// them if their role there allows it ("See everyone's MTOs"), otherwise just their own.
function visibleWhere(m: Member): Prisma.EstimateWhereInput {
  if (isOrgAdmin(m)) return { companyId: m.companyId, deletedAt: null };
  const or: Prisma.EstimateWhereInput[] = projectIdsOf(m).map((projectId) =>
    hasPerm(m, projectId, "mto.view_all") ? { projectId } : { projectId, createdById: m.userId }
  );
  return { companyId: m.companyId, deletedAt: null, OR: or.length ? or : [{ id: "" }] };
}

export async function listEstimates(db: Db, m: Member) {
  const rows = await db.estimate.findMany({ where: visibleWhere(m), orderBy: { updatedAt: "desc" } });
  return rows.map((r) => r.data as Record<string, unknown>);
}

/**
 * Saves one MTO (create or update) in a single transaction. Stock is never checked here —
 * Phase 1 moved that check to Procurement, at issue time (see the brief, section 6).
 *
 * An MTO's status can't be changed through this path at all; that's what POST
 * /mtos/:id/transition is for. Trying to edit anything on an MTO that isn't Draft or Rejected
 * is refused outright, so a queued offline edit made before someone else approved it comes back
 * with a clear reason instead of silently reopening an approved MTO.
 */
export async function saveEstimate(db: Db, m: Member, raw: unknown): Promise<SaveResult> {
  const doc = estimateSchema.parse(raw);

  return db.$transaction(async (tx): Promise<SaveResult> => {
    const existing = await tx.estimate.findUnique({ where: { companyId_id: { companyId: m.companyId, id: doc.id } } });

    if (existing && !existing.deletedAt) {
      if (!hasPerm(m, existing.projectId, "mto.view_all") && existing.createdById !== m.userId) throw forbidden("That MTO belongs to someone else.");
      if (Number(existing.clientUpdatedAt) > doc.updatedAt) return { status: "stale", item: existing.data as Record<string, unknown> };
      if (!EDITABLE_STATUSES.has(existing.status)) {
        throw conflict(`This MTO is "${existing.status}" now and can no longer be edited here.`, "not_editable");
      }
    }

    const project = await tx.project.findUnique({ where: { id: doc.projectId } });
    if (!project || project.companyId !== m.companyId) throw notFound("Pick a project for this MTO.");
    if (!hasPerm(m, project.id, "mto.edit")) throw forbidden("Your role on this project can't create or edit MTOs.");
    const changingProject = !existing || existing.projectId !== doc.projectId;
    if (changingProject && project.status !== "open") throw conflict("That project is closed — pick an open project.", "project_closed");

    const status = existing && !existing.deletedAt ? existing.status : "DRAFT";

    let estimateNumber = existing?.estimateNumber;
    let createdById = existing?.createdById ?? m.userId;
    const isNew = !existing || existing.deletedAt;
    if (isNew) {
      const c = await tx.project.update({ where: { id: project.id }, data: { mtoSeq: { increment: 1 } }, select: { mtoSeq: true } });
      estimateNumber = `${project.code}-MTO-${String(c.mtoSeq).padStart(4, "0")}`;
      createdById = m.userId;
    }

    const owner = createdById === m.userId ? { id: m.userId, name: m.name } : ((existing?.data as { createdBy?: unknown })?.createdBy ?? null);
    // The number doubles as the name unless someone typed a title — no need to type one.
    // (A queued offline MTO carries a placeholder like "AKKO-MTO-····" — also "no title".)
    const typed = doc.name.trim();
    const name = typed && typed !== "Untitled estimate" && !typed.includes("····") ? typed : estimateNumber!;
    const data = { ...doc, name, status, estimateNumber, createdBy: owner } as Record<string, unknown>;
    const row = {
      estimateNumber: estimateNumber!,
      name,
      status,
      projectId: doc.projectId,
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

    // Keep EstimateLine (stockKey/qty per item) in sync with the doc's items — this is what
    // Procurement, Ready-to-dispatch and site-balance all read from. Only reachable while the
    // MTO is still editable, so issuedQty/purchasedQty can't have moved off zero yet.
    const lineIds = doc.items.map((it) => it.id);
    await tx.estimateLine.deleteMany({
      where: { companyId: m.companyId, estimateId: doc.id, lineId: { notIn: lineIds } },
    });
    await Promise.all(
      doc.items.map((it) => {
        const key = stockKey({ trade: it.trade, item: it.item, material: it.material ?? "", size: it.size ?? "", secondarySize: it.secondarySize, core: it.core });
        return tx.estimateLine.upsert({
          where: { companyId_estimateId_lineId: { companyId: m.companyId, estimateId: doc.id, lineId: it.id } },
          create: { companyId: m.companyId, estimateId: doc.id, lineId: it.id, stockKey: key, qty: it.qty },
          update: { stockKey: key, qty: it.qty },
        });
      })
    );

    if (isNew) {
      await tx.mtoEvent.create({
        data: { companyId: m.companyId, estimateId: doc.id, actorId: m.userId, actorName: m.name, fromStatus: null, toStatus: "DRAFT", action: "created" },
      });
    }
    return { status: "saved", item: data };
  });
}

export async function deleteEstimate(db: Db, m: Member, id: string) {
  const existing = await db.estimate.findUnique({ where: { companyId_id: { companyId: m.companyId, id } } });
  if (!existing || existing.deletedAt) return;
  if (!hasPerm(m, existing.projectId, "mto.edit")) throw forbidden("Your role on this project can't delete MTOs.");
  if (!hasPerm(m, existing.projectId, "mto.view_all") && existing.createdById !== m.userId) throw forbidden("That MTO belongs to someone else.");
  // Only a Draft can be deleted outright (brief, section 5) — anything past that uses Cancel
  // (a later phase), so its number and history stay on the record.
  if (existing.status !== "DRAFT") throw conflict("Only a Draft MTO can be deleted — cancel it instead.", "not_deletable");
  await tx_delete(db, m.companyId, id);
}

async function tx_delete(db: Db, companyId: string, id: string) {
  await db.$transaction([
    db.estimateLine.deleteMany({ where: { companyId, estimateId: id } }),
    db.estimate.update({ where: { companyId_id: { companyId, id } }, data: { deletedAt: new Date() } }),
  ]);
}
