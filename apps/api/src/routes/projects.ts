import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { assert, requireMember } from "../lib/access.js";
import { conflict, forbidden, notFound } from "../lib/errors.js";
import type { Deps } from "../app.js";

const canManageProjects = (roles: string[]) => roles.includes("owner") || roles.includes("admin") || roles.includes("project_manager");

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the project a name.").max(160),
  siteName: z.string().trim().max(200).optional().default(""),
});
const patchSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  siteName: z.string().trim().max(200).optional(),
});

function view(p: { id: string; name: string; siteName: string | null; status: string; createdAt: Date; closedAt: Date | null }) {
  return { id: p.id, name: p.name, siteName: p.siteName ?? "", status: p.status, createdAt: p.createdAt.getTime(), closedAt: p.closedAt?.getTime() ?? null };
}

// Projects: the sites/jobs MTOs are raised against. Creating, renaming and (from Phase 5)
// closing a project is a PM/Admin/Owner job; everyone in the company can read the list, since
// every role needs it to pick a project or see site progress.
export async function projectRoutes(app: FastifyInstance, { db, hub }: Deps) {
  const auth = { onRequest: [app.authenticate] };

  app.get("/projects", auth, async (req) => {
    const m = await requireMember(db, req);
    const rows = await db.project.findMany({ where: { companyId: m.companyId }, orderBy: [{ status: "asc" }, { updatedAt: "desc" }] });
    return rows.map(view);
  });

  app.post("/projects", auth, async (req) => {
    const m = await requireMember(db, req);
    assert(canManageProjects(m.roles), "Only a Project Manager, Admin or Owner can create a project.");
    const body = createSchema.parse(req.body);
    const existing = await db.project.findUnique({ where: { companyId_name: { companyId: m.companyId, name: body.name } } });
    if (existing) throw conflict("A project with that name already exists.");
    const p = await db.project.create({
      data: { companyId: m.companyId, name: body.name, siteName: body.siteName || null, createdById: m.userId },
    });
    hub.publish(m.companyId, "projects", { by: m.userId });
    return view(p);
  });

  app.patch<{ Params: { id: string } }>("/projects/:id", auth, async (req) => {
    const m = await requireMember(db, req);
    assert(canManageProjects(m.roles), "Only a Project Manager, Admin or Owner can edit a project.");
    const body = patchSchema.parse(req.body);
    const existing = await db.project.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.companyId !== m.companyId) throw notFound("Project not found.");
    if (body.name && body.name !== existing.name) {
      const dupe = await db.project.findUnique({ where: { companyId_name: { companyId: m.companyId, name: body.name } } });
      if (dupe) throw conflict("A project with that name already exists.");
    }
    const p = await db.project.update({ where: { id: existing.id }, data: { name: body.name ?? existing.name, siteName: body.siteName ?? existing.siteName } });
    hub.publish(m.companyId, "projects", { by: m.userId });
    return view(p);
  });
}
