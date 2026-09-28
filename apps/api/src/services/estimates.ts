import { Prisma, type Db } from "../db.js";
import { can, type Member } from "../lib/access.js";
import { conflict, forbidden, notFound } from "../lib/errors.js";
import { estimateSchema } from "./schemas.js";

// An MTO can only be edited (items, details, notes — anything) while it's in one of these
// statuses. Once it's moved on, the only way to change it is the transition endpoint (or, from
// Phase 3 onward, the procurement / dispatch / consumption endpoints).
const EDITABLE_STATUSES = new Set(["DRAFT", "REJECTED"]);

export type SaveResult =
  | { status: "saved"; item: Record<string, unknown> }
  | { status: "stale"; item: Record<string, unknown> };

function visibleWhere(m: Member): Prisma.EstimateWhereInput {
  return can.seeAllEstimates(m.roles)
    ? { companyId: m.companyId, deletedAt: null }
    : { companyId: m.companyId, deletedAt: null, createdById: m.userId };
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
  if (!can.editEstimates(m.roles)) throw forbidden("Viewers can't edit MTOs.");
  const doc = estimateSchema.parse(raw);

  return db.$transaction(async (tx): Promise<SaveResult> => {
    const existing = await tx.estimate.findUnique({ where: { companyId_id: { companyId: m.companyId, id: doc.id } } });

    if (existing && !existing.deletedAt) {
      if (!can.seeAllEstimates(m.roles) && existing.createdById !== m.userId) throw forbidden("That MTO belongs to someone else.");
      if (Number(existing.clientUpdatedAt) > doc.updatedAt) return { status: "stale", item: existing.data as Record<string, unknown> };
      if (!EDITABLE_STATUSES.has(existing.status)) {
        throw conflict(`This MTO is "${existing.status}" now and can no longer be edited here.`, "not_editable");
      }
    }

    const project = await tx.project.findUnique({ where: { id: doc.projectId } });
    if (!project || project.companyId !== m.companyId) throw notFound("Pick a project for this MTO.");
    const changingProject = !existing || existing.projectId !== doc.projectId;
    if (changingProject && project.status !== "open") throw conflict("That project is closed — pick an open project.", "project_closed");

    const status = existing && !existing.deletedAt ? existing.status : "DRAFT";

    let estimateNumber = existing?.estimateNumber;
    let createdById = existing?.createdById ?? m.userId;
    const isNew = !existing || existing.deletedAt;
    if (isNew) {
      const c = await tx.company.update({ where: { id: m.companyId }, data: { estimateSeq: { increment: 1 } }, select: { estimateSeq: true } });
      estimateNumber = `MTO-${String(c.estimateSeq).padStart(4, "0")}`;
      createdById = m.userId;
    }

    const owner = createdById === m.userId ? { id: m.userId, name: m.name } : ((existing?.data as { createdBy?: unknown })?.createdBy ?? null);
    const data = { ...doc, status, estimateNumber, createdBy: owner } as Record<string, unknown>;
    const row = {
      estimateNumber: estimateNumber!,
      name: doc.name,
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
    if (isNew) {
      await tx.mtoEvent.create({
        data: { companyId: m.companyId, estimateId: doc.id, actorId: m.userId, actorName: m.name, fromStatus: null, toStatus: "DRAFT", action: "created" },
      });
    }
    return { status: "saved", item: data };
  });
}

export async function deleteEstimate(db: Db, m: Member, id: string) {
  if (!can.editEstimates(m.roles)) throw forbidden("Viewers can't delete MTOs.");
  const existing = await db.estimate.findUnique({ where: { companyId_id: { companyId: m.companyId, id } } });
  if (!existing || existing.deletedAt) return;
  if (!can.seeAllEstimates(m.roles) && existing.createdById !== m.userId) throw forbidden("That MTO belongs to someone else.");
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
