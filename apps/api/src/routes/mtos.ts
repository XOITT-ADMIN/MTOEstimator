import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { requireMember } from "../lib/access.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { canPerform, findTransition, isMtoStatus, statusesWaitingOnRoles, STATUSES_WAITING_ON_CREATOR } from "../lib/mtoStatus.js";
import type { Deps } from "../app.js";

const transitionSchema = z.object({
  to: z.string().min(1).max(40),
  comment: z.string().trim().max(2000).optional().default(""),
});

// The approval workflow: moving an MTO between statuses, the "waiting for you" inbox, and the
// History tab. See XMTO_BUILD_BRIEF.md section 5 and section 8.
export async function mtoRoutes(app: FastifyInstance, { db, hub }: Deps) {
  const auth = { onRequest: [app.authenticate] };

  // "Waiting for you" (by role) plus "My MTOs" (mine, whatever their status).
  app.get("/mtos/inbox", auth, async (req) => {
    const m = await requireMember(db, req);
    const roleStatuses = statusesWaitingOnRoles(m.roles);
    const isSupervisor = m.roles.includes("site_supervisor");

    const or: Record<string, unknown>[] = [];
    if (roleStatuses.length) or.push({ status: { in: roleStatuses } });
    if (isSupervisor) or.push({ status: { in: STATUSES_WAITING_ON_CREATOR }, createdById: m.userId });

    const [waiting, mine] = await Promise.all([
      or.length
        ? db.estimate.findMany({ where: { companyId: m.companyId, deletedAt: null, OR: or }, orderBy: { updatedAt: "desc" } })
        : Promise.resolve([]),
      db.estimate.findMany({ where: { companyId: m.companyId, deletedAt: null, createdById: m.userId }, orderBy: { updatedAt: "desc" }, take: 100 }),
    ]);
    return { waiting: waiting.map((r) => r.data), mine: mine.map((r) => r.data) };
  });

  app.get<{ Params: { id: string } }>("/mtos/:id/history", auth, async (req) => {
    const m = await requireMember(db, req);
    const exists = await db.estimate.findUnique({ where: { companyId_id: { companyId: m.companyId, id: req.params.id } }, select: { id: true } });
    if (!exists) throw notFound("MTO not found.");
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

  app.post<{ Params: { id: string } }>("/mtos/:id/transition", auth, async (req) => {
    const m = await requireMember(db, req);
    const body = transitionSchema.parse(req.body);
    if (!isMtoStatus(body.to)) throw badRequest(`"${body.to}" isn't a status.`);
    const { id } = req.params;

    const result = await db.$transaction(async (tx) => {
      // Lock the row so two people acting on the same MTO at once are serialised, not racing.
      const rows = await tx.$queryRaw<{ status: string; data: unknown; createdById: string; projectId: string; deletedAt: Date | null }[]>`
        SELECT "status", "data", "createdById", "projectId", "deletedAt" FROM "Estimate"
        WHERE "companyId" = ${m.companyId} AND "id" = ${id} FOR UPDATE`;
      const row = rows[0];
      if (!row || row.deletedAt) throw notFound("MTO not found.");

      const rule = findTransition(row.status, body.to);
      if (!rule) {
        throw forbidden(`This MTO is "${row.status}" now — someone may have already moved it. Refresh and try again.`);
      }
      if (!canPerform(m.roles, rule)) throw forbidden("You don't have the role to make that move.");
      if (rule.requireOwnMto && !m.roles.includes("owner") && !m.roles.includes("admin") && row.createdById !== m.userId) {
        throw forbidden("That MTO belongs to someone else.");
      }
      if (rule.commentRequired && !body.comment) throw badRequest("Add a comment before you send this back.");

      if (body.to === "SUBMITTED") {
        const items = (row.data as { items?: unknown[] })?.items ?? [];
        if (!Array.isArray(items) || items.length === 0) throw badRequest("Add at least one item before submitting.");
        const project = await tx.project.findUnique({ where: { id: row.projectId }, select: { status: true } });
        if (!project || project.status !== "open") throw conflict("That project is closed — this MTO needs an open project.", "project_closed");
      }

      const now = new Date();
      const nextData = { ...(row.data as Record<string, unknown>), status: body.to };
      await tx.estimate.update({
        where: { companyId_id: { companyId: m.companyId, id } },
        data: {
          status: body.to,
          data: nextData,
          ...(body.to === "SUBMITTED" ? { submittedAt: now } : {}),
          ...(body.to === "CLOSED" ? { closedAt: now } : {}),
        },
      });
      await tx.mtoEvent.create({
        data: {
          companyId: m.companyId,
          estimateId: id,
          actorId: m.userId,
          actorName: m.name,
          fromStatus: row.status,
          toStatus: body.to,
          action: "transition",
          comment: body.comment || null,
        },
      });
      return nextData;
    });

    hub.publish(m.companyId, "estimates", { by: m.userId });
    return { item: result };
  });
}
