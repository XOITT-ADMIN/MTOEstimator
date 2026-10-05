import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { hasPerm, isOrgAdmin, permsIn, projectIdsOf, requireMember, type Member } from "../lib/access.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { canPerform, findTransition, isMtoStatus, statusesWaitingOnPerms, STATUSES_WAITING_ON_CREATOR } from "../lib/mtoStatus.js";
import { toNum } from "../lib/num.js";
import type { Deps } from "../app.js";
import type { Prisma } from "../db.js";
import { returnMtoLeftover } from "../services/siteStock.js";

const transitionSchema = z.object({
  to: z.string().min(1).max(40),
  comment: z.string().trim().max(2000).optional().default(""),
});

const procurementSchema = z.object({
  lines: z.array(
    z.object({
      lineId:      z.string().min(1),
      issueQty:    z.number().min(0),
      purchaseQty: z.number().min(0),
    })
  ).min(1),
});

const dispatchSchema = z.object({
  loadingCheck: z.boolean().optional().default(false),
  loadingCost:  z.number().min(0).optional().default(0),
  vehicle:      z.string().trim().max(120).optional().default(""),
  driver:       z.string().trim().max(120).optional().default(""),
  notes:        z.string().trim().max(2000).optional().default(""),
});

const deliverSchema = z.object({
  dispatchId: z.string().min(1),
});

export async function mtoRoutes(app: FastifyInstance, { db, hub, mailer }: Deps) {
  const auth = { onRequest: [app.authenticate] };

  // The MTO must exist in this company and be on a project the caller belongs to (owner/admin: any).
  async function requireMtoAccess(m: Member, id: string) {
    const mto = await db.estimate.findUnique({ where: { companyId_id: { companyId: m.companyId, id } }, select: { projectId: true } });
    if (!mto || (!isOrgAdmin(m) && !m.projectRoles[mto.projectId])) throw notFound("MTO not found.");
    return mto;
  }

  // "Waiting for you" (by role) plus "My MTOs" (mine, whatever their status).
  app.get("/mtos/inbox", auth, async (req) => {
    const m = await requireMember(db, req);
    // Roles are per project: what's waiting on you is worked out project by project. Owner/admin
    // act company-wide, so they hold every permission on every project.
    const scopes: { project: Record<string, unknown>; perms: Set<string> }[] = isOrgAdmin(m)
      ? [{ project: {}, perms: permsIn(m, "") }]
      : projectIdsOf(m).map((projectId) => ({ project: { projectId }, perms: permsIn(m, projectId) }));
    const or: Record<string, unknown>[] = [];
    for (const { project, perms } of scopes) {
      const statuses = statusesWaitingOnPerms(perms);
      if (statuses.length) or.push({ ...project, status: { in: statuses } });
      // A rejected MTO waits on its creator — anyone who can submit.
      if (perms.has("mto.submit")) or.push({ ...project, status: { in: STATUSES_WAITING_ON_CREATOR }, createdById: m.userId });
    }

    const [waiting, mine] = await Promise.all([
      or.length
        ? db.estimate.findMany({ where: { companyId: m.companyId, deletedAt: null, OR: or }, orderBy: { updatedAt: "desc" } })
        : Promise.resolve([]),
      db.estimate.findMany({ where: { companyId: m.companyId, deletedAt: null, createdById: m.userId }, orderBy: { updatedAt: "desc" }, take: 100 }),
    ]);
    return {
      waiting: waiting.map((r) => r.data),
      mine: mine.map((r) => r.data),
      waitingCount: waiting.length,
    };
  });

  app.get<{ Params: { id: string } }>("/mtos/:id/history", auth, async (req) => {
    const m = await requireMember(db, req);
    await requireMtoAccess(m, req.params.id);
    const events = await db.mtoEvent.findMany({
      where: { companyId: m.companyId, estimateId: req.params.id },
      orderBy: { createdAt: "asc" },
    });
    return events.map((e) => ({
      id: e.id,
      actorId: e.actorId,
      actorName: e.actorName,
      from: e.fromStatus,
      to: e.toStatus,
      action: e.action,
      comment: e.comment,
      at: e.createdAt.getTime(),
    }));
  });

  // Authoritative issued/purchased qty per line — the estimate's own `data.items` JSON is never
  // updated by procurement (only EstimateLine is), so the Procurement tab reads this instead of
  // trusting stale item fields after a reload.
  app.get<{ Params: { id: string } }>("/mtos/:id/lines", auth, async (req) => {
    const m = await requireMember(db, req);
    await requireMtoAccess(m, req.params.id);
    const lines = await db.estimateLine.findMany({
      where: { companyId: m.companyId, estimateId: req.params.id },
    });
    return lines.map((l) => ({
      lineId:       l.lineId,
      stockKey:     l.stockKey,
      qty:          toNum(l.qty),
      issuedQty:    toNum(l.issuedQty),
      purchasedQty: toNum(l.purchasedQty),
    }));
  });

  app.post<{ Params: { id: string } }>("/mtos/:id/transition", auth, async (req) => {
    const m = await requireMember(db, req);
    const body = transitionSchema.parse(req.body);
    if (!isMtoStatus(body.to)) throw badRequest(`"${body.to}" isn't a status.`);
    const { id } = req.params;

    const result = await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ status: string; data: unknown; createdById: string; projectId: string; deletedAt: Date | null }[]>`
        SELECT "status", "data", "createdById", "projectId", "deletedAt" FROM "Estimate"
        WHERE "companyId" = ${m.companyId} AND "id" = ${id} FOR UPDATE`;
      const row = rows[0];
      if (!row || row.deletedAt) throw notFound("MTO not found.");

      const rule = findTransition(row.status, body.to);
      if (!rule) {
        throw conflict(`This MTO is "${row.status}" now — someone may have already moved it. Refresh and try again.`);
      }
      if (!canPerform(permsIn(m, row.projectId), rule)) throw forbidden("Your role on this project doesn't allow that move.");
      if (rule.requireOwnMto && !isOrgAdmin(m) && row.createdById !== m.userId) {
        throw forbidden("That MTO belongs to someone else.");
      }
      if (rule.commentRequired && !body.comment) throw badRequest("Add a comment before you send this back.");

      if (body.to === "SUBMITTED") {
        const items = (row.data as { items?: unknown[] })?.items ?? [];
        if (!Array.isArray(items) || items.length === 0) throw badRequest("Add at least one item before submitting.");
        const project = await tx.project.findUnique({ where: { id: row.projectId }, select: { status: true } });
        if (!project || project.status !== "open") throw conflict("That project is closed — this MTO needs an open project.", "project_closed");
      }

      // Phase 3: READY_TO_DISPATCH only when every line is fully issued
      if (body.to === "READY_TO_DISPATCH") {
        const lines = await tx.estimateLine.findMany({
          where: { companyId: m.companyId, estimateId: id },
          select: { qty: true, issuedQty: true },
        });
        const notFullyIssued = lines.filter((l) => toNum(l.issuedQty) < toNum(l.qty));
        if (notFullyIssued.length > 0) {
          throw badRequest(`${notFullyIssued.length} line(s) still need to be fully allocated before marking Ready to dispatch.`);
        }
      }

      // Phase 4: Cancel — return all issued qty to stock immediately (confirmed by Suraj 29 Sep 2026)
      if (body.to === "CANCELLED") {
        const lines = await tx.estimateLine.findMany({
          where: { companyId: m.companyId, estimateId: id },
          select: { lineId: true, stockKey: true, issuedQty: true },
        });
        for (const line of lines) {
          const issued = toNum(line.issuedQty);
          if (issued <= 0) continue;
          await tx.$executeRaw`
            UPDATE "StockLine" SET "onHand" = "onHand" + ${issued}
            WHERE "companyId" = ${m.companyId} AND "projectId" = ${row.projectId} AND "key" = ${line.stockKey}`;
          await tx.stockMovement.create({
            data: {
              companyId:   m.companyId,
              projectId:   row.projectId,
              stockLineId: line.stockKey,
              type:        "RETURN",
              qty:         issued,
              estimateId:  id,
              reason:      `MTO cancelled: ${body.comment}`,
              createdById: m.userId,
            },
          });
        }
      }

      // Closing an MTO: its unused material is recorded as returned (shows in the returns report).
      if (body.to === "CLOSED") {
        const project = await tx.project.findUniqueOrThrow({ where: { id: row.projectId }, select: { id: true, name: true } });
        const est = await tx.estimate.findUniqueOrThrow({ where: { companyId_id: { companyId: m.companyId, id } }, select: { id: true, estimateNumber: true } });
        await returnMtoLeftover(tx, m.companyId, m.userId, project, est, `MTO closed: ${est.estimateNumber}`);
      }

      const now = new Date();
      const nextData = { ...(row.data as Record<string, unknown>), status: body.to };
      await tx.estimate.update({
        where: { companyId_id: { companyId: m.companyId, id } },
        data: {
          status: body.to,
          data: nextData,
          ...(body.to === "SUBMITTED"  ? { submittedAt: now } : {}),
          ...(body.to === "CLOSED"     ? { closedAt:    now } : {}),
          ...(body.to === "CANCELLED"  ? { closedAt:    now } : {}),
        },
      });
      await tx.mtoEvent.create({
        data: {
          companyId:  m.companyId,
          estimateId: id,
          actorId:    m.userId,
          actorName:  m.name,
          fromStatus: row.status,
          toStatus:   body.to,
          action:     "transition",
          comment:    body.comment || null,
        },
      });
      return { nextData, createdById: row.createdById, projectId: row.projectId };
    });

    hub.publish(m.companyId, "estimates", { by: m.userId });
    if (body.to === "CANCELLED" || body.to === "CLOSED") hub.publish(m.companyId, "stock", { by: m.userId });

    sendTransitionEmail({ db, mailer, companyId: m.companyId, estimateId: id, toStatus: body.to, actorName: m.name, comment: body.comment, mtoData: result.nextData }).catch(() => {});

    return { item: result.nextData };
  });

  // Phase 3: Procurement records how much to issue from stock and how much to buy externally.
  app.post<{ Params: { id: string } }>("/mtos/:id/procurement", auth, async (req) => {
    const m = await requireMember(db, req);
    const body = procurementSchema.parse(req.body);
    const { id } = req.params;

    const mto = await db.estimate.findUnique({
      where: { companyId_id: { companyId: m.companyId, id } },
      select: { status: true, deletedAt: true, projectId: true },
    });
    if (!mto || mto.deletedAt) throw notFound("MTO not found.");
    if (!hasPerm(m, mto.projectId, "mto.procure")) {
      throw forbidden("Your role on this project can't allocate stock for an MTO.");
    }
    if (mto.status !== "BUDGET_OK" && mto.status !== "READY_TO_DISPATCH") {
      throw badRequest(`Can only allocate stock for an MTO in Budget OK status (this one is "${mto.status}").`);
    }

    const updatedLines = await db.$transaction(async (tx) => {
      const results: { lineId: string; issuedQty: number; purchasedQty: number }[] = [];

      for (const entry of body.lines) {
        if (entry.issueQty === 0 && entry.purchaseQty === 0) continue;

        const line = await tx.estimateLine.findUnique({
          where: { companyId_estimateId_lineId: { companyId: m.companyId, estimateId: id, lineId: entry.lineId } },
        });
        if (!line) throw notFound(`Line "${entry.lineId}" not found.`);

        if (entry.issueQty > 0) {
          const stockRows = await tx.$queryRaw<{ key: string; onHand: string }[]>`
            SELECT "key", "onHand" FROM "StockLine"
            WHERE "companyId" = ${m.companyId} AND "projectId" = ${mto.projectId} AND "key" = ${line.stockKey} FOR UPDATE`;
          const stock = stockRows[0];
          if (!stock) throw badRequest(`No stock line found for "${line.stockKey}" in this project. Add it to the project's stock first.`);

          const available = toNum(stock.onHand);
          if (entry.issueQty > available) {
            throw badRequest(`Only ${available} ${line.stockKey.split("|")[5] || "units"} in stock for "${line.stockKey.split("|")[2]} · ${line.stockKey.split("|")[1]} · ${line.stockKey.split("|")[3]}".`);
          }

          await tx.$executeRaw`
            UPDATE "StockLine" SET "onHand" = "onHand" - ${entry.issueQty}
            WHERE "companyId" = ${m.companyId} AND "projectId" = ${mto.projectId} AND "key" = ${line.stockKey}`;

          await tx.stockMovement.create({
            data: {
              companyId:   m.companyId,
              projectId:   mto.projectId,
              stockLineId: line.stockKey,
              type:        "ISSUE",
              qty:         entry.issueQty,
              estimateId:  id,
              createdById: m.userId,
            },
          });
        }

        await tx.estimateLine.update({
          where: { companyId_estimateId_lineId: { companyId: m.companyId, estimateId: id, lineId: entry.lineId } },
          data: {
            issuedQty:    { increment: entry.issueQty },
            purchasedQty: { increment: entry.purchaseQty },
          },
        });

        results.push({
          lineId:       entry.lineId,
          issuedQty:    toNum(line.issuedQty) + entry.issueQty,
          purchasedQty: toNum(line.purchasedQty) + entry.purchaseQty,
        });
      }

      return results;
    });

    hub.publish(m.companyId, "stock", { by: m.userId });
    hub.publish(m.companyId, "estimates", { by: m.userId });
    return { lines: updatedLines };
  });

  // Phase 4: Create the dispatch record for a Ready-to-dispatch MTO (loading details, transport).
  app.post<{ Params: { id: string } }>("/mtos/:id/dispatch", auth, async (req) => {
    const m = await requireMember(db, req);
    const body = dispatchSchema.parse(req.body);
    const { id } = req.params;

    const mto = await db.estimate.findUnique({
      where: { companyId_id: { companyId: m.companyId, id } },
      select: { status: true, deletedAt: true, projectId: true },
    });
    if (!mto || mto.deletedAt) throw notFound("MTO not found.");
    if (!hasPerm(m, mto.projectId, "mto.dispatch")) {
      throw forbidden("Your role on this project can't create a dispatch record.");
    }
    if (mto.status !== "READY_TO_DISPATCH") {
      throw badRequest(`Dispatch can only be created for a Ready-to-dispatch MTO (this one is "${mto.status}").`);
    }

    const dispatch = await db.dispatch.create({
      data: {
        companyId:    m.companyId,
        estimateId:   id,
        loadingCheck: body.loadingCheck,
        loadingCost:  body.loadingCost,
        vehicle:      body.vehicle || null,
        driver:       body.driver || null,
        notes:        body.notes || null,
        createdById:  m.userId,
      },
    });

    hub.publish(m.companyId, "estimates", { by: m.userId });
    return { dispatch: viewDispatch(dispatch) };
  });

  // Phase 4: Update a dispatch record (mark dispatched or delivered).
  app.patch<{ Params: { dispatchId: string } }>("/dispatches/:dispatchId", auth, async (req) => {
    const m = await requireMember(db, req);
    const body = z.object({
      loadingCheck: z.boolean().optional(),
      loadingCost:  z.number().min(0).optional(),
      vehicle:      z.string().trim().max(120).optional(),
      driver:       z.string().trim().max(120).optional(),
      notes:        z.string().trim().max(2000).optional(),
      dispatched:   z.boolean().optional(),
      delivered:    z.boolean().optional(),
    }).parse(req.body);

    const dispatch = await db.dispatch.findUnique({ where: { id: req.params.dispatchId } });
    if (!dispatch || dispatch.companyId !== m.companyId) throw notFound("Dispatch not found.");
    const dispatchMto = await db.estimate.findUnique({ where: { companyId_id: { companyId: m.companyId, id: dispatch.estimateId } }, select: { projectId: true } });
    const dPerms = dispatchMto ? permsIn(m, dispatchMto.projectId) : new Set<string>();
    if (!dPerms.has("mto.dispatch") && !dPerms.has("mto.deliver")) {
      throw forbidden("Your role on this project can't update a dispatch.");
    }

    const now = new Date();
    const updated = await db.dispatch.update({
      where: { id: dispatch.id },
      data: {
        ...(body.loadingCheck !== undefined ? { loadingCheck: body.loadingCheck } : {}),
        ...(body.loadingCost  !== undefined ? { loadingCost:  body.loadingCost  } : {}),
        ...(body.vehicle      !== undefined ? { vehicle:      body.vehicle || null } : {}),
        ...(body.driver       !== undefined ? { driver:       body.driver  || null } : {}),
        ...(body.notes        !== undefined ? { notes:        body.notes   || null } : {}),
        ...(body.dispatched   ? { dispatchedAt: now } : {}),
        ...(body.delivered    ? { deliveredAt:  now } : {}),
      },
    });

    // Marking delivered also advances the MTO to DELIVERED via the state machine
    if (body.delivered && !dispatch.deliveredAt) {
      const mto = await db.estimate.findUnique({
        where: { companyId_id: { companyId: m.companyId, id: dispatch.estimateId } },
        select: { status: true, data: true, createdById: true },
      });
      if (mto && mto.status === "DISPATCHED") {
        const nextData = { ...(mto.data as Record<string, unknown>), status: "DELIVERED" };
        await db.estimate.update({
          where: { companyId_id: { companyId: m.companyId, id: dispatch.estimateId } },
          data: { status: "DELIVERED", data: nextData },
        });
        await db.mtoEvent.create({
          data: {
            companyId:  m.companyId,
            estimateId: dispatch.estimateId,
            actorId:    m.userId,
            actorName:  m.name,
            fromStatus: "DISPATCHED",
            toStatus:   "DELIVERED",
            action:     "transition",
          },
        });
      }
    }

    hub.publish(m.companyId, "estimates", { by: m.userId });
    return { dispatch: viewDispatch(updated) };
  });

  // Get dispatch records for an MTO
  app.get<{ Params: { id: string } }>("/mtos/:id/dispatches", auth, async (req) => {
    const m = await requireMember(db, req);
    await requireMtoAccess(m, req.params.id);
    const dispatches = await db.dispatch.findMany({
      where: { companyId: m.companyId, estimateId: req.params.id },
      orderBy: { createdAt: "asc" },
    });
    return dispatches.map(viewDispatch);
  });
}

function viewDispatch(d: { id: string; loadingCheck: boolean; loadingCost: Prisma.Decimal; vehicle: string | null; driver: string | null; notes: string | null; dispatchedAt: Date | null; deliveredAt: Date | null; createdById: string; createdAt: Date }) {
  return {
    id:           d.id,
    loadingCheck: d.loadingCheck,
    loadingCost:  toNum(d.loadingCost),
    vehicle:      d.vehicle ?? "",
    driver:       d.driver  ?? "",
    notes:        d.notes   ?? "",
    dispatchedAt: d.dispatchedAt?.getTime() ?? null,
    deliveredAt:  d.deliveredAt?.getTime()  ?? null,
    createdById:  d.createdById,
    createdAt:    d.createdAt.getTime(),
  };
}

// The one workflow email: when an MTO is marked Ready to dispatch, the project's notification
// email (set on the project) is told. Nobody is emailed individually. Runs outside the transaction.
async function sendTransitionEmail({ db, mailer, companyId, estimateId, toStatus, actorName, comment, mtoData }: {
  db: Parameters<typeof mtoRoutes>[1]["db"];
  mailer: Parameters<typeof mtoRoutes>[1]["mailer"];
  companyId: string;
  estimateId: string;
  toStatus: string;
  actorName: string;
  comment: string;
  mtoData: unknown;
}) {
  if (!mailer.enabled || toStatus !== "READY_TO_DISPATCH") return;

  const est = await db.estimate.findUnique({ where: { companyId_id: { companyId, id: estimateId } }, select: { projectId: true } });
  const project = est ? await db.project.findUnique({ where: { id: est.projectId }, select: { name: true, notificationEmail: true } }) : null;
  if (!project?.notificationEmail) return;

  const data = mtoData as Record<string, unknown>;
  const number = (data.estimateNumber as string) || estimateId;
  const name = (data.name as string) || "";
  const body = [
    `MTO ${number}${name && name !== number ? ` — ${name}` : ""}`,
    `Project: ${project.name}`,
    "Status: Ready to dispatch",
    `By: ${actorName}`,
    comment ? `Comment: ${comment}` : "",
  ].filter(Boolean).join("\n");

  mailer.send(project.notificationEmail, `${number} is ready to dispatch`, body).catch(() => {});
}
