import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { assert, can, hasPerm, requireMember, userId } from "../lib/access.js";
import { ensureDefaultRoles, isPermission, PERMISSIONS, roleView } from "../lib/permissions.js";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../lib/errors.js";
import { normaliseEmail } from "../lib/otp.js";
import type { Deps } from "../app.js";
import type { Role } from "../db.js";

const DEFAULT_TERMS =
  "1. Rates are valid as stated above and subject to change thereafter.\n" +
  "2. Material to be verified on-site before installation.\n" +
  "3. Payment terms: 50% advance, balance on completion.\n" +
  "4. GST as applicable is extra unless shown as included above.";

const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    address: z.string().max(400),
    phone: z.string().max(40),
    email: z.string().max(160),
    gstin: z.string().max(20),
    termsAndConditions: z.string().max(5000),
  })
  .partial();

// Organisation-level roles. Only "admin" can be handed out here (owner is set at creation).
// Everything else is a company-defined role (Settings › Roles & permissions) held per project —
// see PUT /projects/:id/members/:userId.
const ASSIGNABLE_ROLES = ["admin"] as const;
const rolesSchema = z.array(z.enum(ASSIGNABLE_ROLES)).max(ASSIGNABLE_ROLES.length);

function roleNames(roles: string[]) {
  return roles.length ? roles.map((r) => (r === "admin" ? "an admin" : r)).join(", ") : "a team member";
}

const roleBodySchema = z.object({
  name: z.string().trim().min(2, "Give the role a name.").max(60),
  description: z.string().trim().max(200).optional(),
  permissions: z.array(z.string()).max(100).refine((p) => p.every(isPermission), "Unknown permission."),
});
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "role";

function companyView(c: { id: string; name: string; profile: unknown; createdAt: Date }, ownerUid: string | null) {
  return { id: c.id, name: c.name, profile: { ...(c.profile as object), name: c.name }, ownerUid, createdAt: c.createdAt.getTime() };
}

export async function companyRoutes(app: FastifyInstance, { db, hub, mailer }: Deps) {
  const auth = { onRequest: [app.authenticate] };

  async function ownerOf(companyId: string) {
    const o = await db.membership.findFirst({ where: { companyId, roles: { has: "owner" } }, select: { userId: true } });
    return o?.userId ?? null;
  }

  async function projectRolesOf(uid: string) {
    const rows = await db.projectMember.findMany({ where: { userId: uid }, select: { projectId: true, roles: true } });
    return Object.fromEntries(rows.map((r) => [r.projectId, r.roles]));
  }

  // Who am I, and which company am I in? A pending invite for my email is accepted here, so an
  // invited engineer lands straight in the company the first time they sign in.
  app.get("/me", auth, async (req) => {
    const id = userId(req);
    const user = await db.user.findUnique({ where: { id } });
    if (!user) throw unauthorized();
    let m = await db.membership.findUnique({ where: { userId: id }, include: { company: true } });
    if (!m) {
      const invite = await db.invite.findFirst({ where: { email: user.email }, orderBy: { createdAt: "asc" } });
      if (invite) {
        m = await db.$transaction(async (tx) => {
          const created = await tx.membership.create({ data: { companyId: invite.companyId, userId: id, roles: invite.roles }, include: { company: true } });
          const assigned = (Array.isArray(invite.projects) ? invite.projects : []) as { projectId: string; roles: Role[] }[];
          const valid = await tx.project.findMany({ where: { companyId: invite.companyId, id: { in: assigned.map((a) => a.projectId) } }, select: { id: true } });
          const ok = new Set(valid.map((p) => p.id));
          for (const a of assigned) {
            if (ok.has(a.projectId) && a.roles?.length) await tx.projectMember.create({ data: { companyId: invite.companyId, projectId: a.projectId, userId: id, roles: a.roles } });
          }
          await tx.invite.deleteMany({ where: { email: user.email } });
          if (invite.name && !user.name) await tx.user.update({ where: { id }, data: { name: invite.name } });
          return created;
        });
        hub.publish(invite.companyId, "members");
      }
    }
    return {
      user: { id: user.id, uid: user.id, email: user.email, name: user.name, photo: user.photo, provider: user.provider },
      membership: m ? { companyId: m.companyId, roles: m.roles, projectRoles: await projectRolesOf(id) } : null,
      // The company's roles and what each allows, so the app can show only what this person may do.
      roleDefs: m ? (await db.orgRole.findMany({ where: { companyId: m.companyId }, orderBy: { createdAt: "asc" } })).map((r) => roleView(r)) : [],
      company: m ? companyView(m.company, await ownerOf(m.companyId)) : null,
    };
  });

  app.patch("/me", auth, async (req) => {
    const body = z.object({ name: z.string().trim().min(1).max(120) }).parse(req.body);
    const u = await db.user.update({ where: { id: userId(req) }, data: { name: body.name } });
    return { id: u.id, name: u.name };
  });

  // Start a company — the caller becomes its owner.
  app.post("/companies", auth, async (req) => {
    const id = userId(req);
    const body = z.object({ name: z.string().trim().min(2, "Enter a company name.").max(160), profile: profileSchema.optional() }).parse(req.body);
    if (await db.membership.findUnique({ where: { userId: id } })) throw conflict("You're already in a company.");
    const company = await db.company.create({
      data: {
        name: body.name,
        profile: { address: "", phone: "", email: "", gstin: "", termsAndConditions: DEFAULT_TERMS, ...body.profile, name: body.name },
        members: { create: { userId: id, roles: ["owner"] } },
      },
    });
    await ensureDefaultRoles(db, company.id);
    return { company: companyView(company, id), membership: { companyId: company.id, roles: ["owner"] } };
  });

  app.get("/company", auth, async (req) => {
    const m = await requireMember(db, req);
    const c = await db.company.findUniqueOrThrow({ where: { id: m.companyId } });
    return companyView(c, await ownerOf(c.id));
  });

  app.patch("/company", auth, async (req) => {
    const m = await requireMember(db, req);
    assert(can.manageTeam(m.roles), "Only an owner or admin can change the company profile.");
    const body = z.object({ profile: profileSchema.optional() }).parse(req.body);
    const c = await db.company.findUniqueOrThrow({ where: { id: m.companyId } });
    const profile = { ...(c.profile as object), ...(body.profile ?? {}) } as Record<string, unknown>;
    const updated = await db.company.update({
      where: { id: m.companyId },
      data: { profile: profile as object, name: (body.profile?.name as string) || c.name },
    });
    hub.publish(m.companyId, "company");
    return companyView(updated, await ownerOf(updated.id));
  });

  // ── Roles & permissions ──────────────────────────────────────────────────────────────────
  // Company-defined roles. Everyone can read them (the app needs the names); only owner/admin
  // change them. Built-in roles can be renamed and re-permissioned but not deleted.
  app.get("/roles", auth, async (req) => {
    const m = await requireMember(db, req);
    const rows = await db.orgRole.findMany({ where: { companyId: m.companyId }, orderBy: { createdAt: "asc" } });
    const people = await db.projectMember.findMany({ where: { companyId: m.companyId }, select: { roles: true } });
    const inUse = (key: string) => people.filter((p) => p.roles.includes(key)).length;
    return { roles: rows.map((r) => roleView(r, inUse(r.key))), catalogue: PERMISSIONS };
  });

  app.post("/roles", auth, async (req) => {
    const m = await requireMember(db, req);
    assert(can.manageTeam(m.roles), "Only an owner or admin can add roles.");
    const body = roleBodySchema.parse(req.body);
    const existing = await db.orgRole.findMany({ where: { companyId: m.companyId }, select: { key: true, name: true } });
    if (existing.some((r) => r.name.toLowerCase() === body.name.toLowerCase())) throw conflict("A role with that name already exists.");
    let key = slug(body.name);
    const taken = new Set(existing.map((r) => r.key));
    for (let n = 2; taken.has(key); n++) key = `${slug(body.name)}_${n}`;
    const r = await db.orgRole.create({ data: { companyId: m.companyId, key, name: body.name, description: body.description ?? "", permissions: body.permissions } });
    hub.publish(m.companyId, "members");
    return roleView(r);
  });

  app.patch<{ Params: { id: string } }>("/roles/:id", auth, async (req) => {
    const m = await requireMember(db, req);
    assert(can.manageTeam(m.roles), "Only an owner or admin can change roles.");
    const body = roleBodySchema.partial().parse(req.body);
    const role = await db.orgRole.findUnique({ where: { id: req.params.id } });
    if (!role || role.companyId !== m.companyId) throw notFound("Role not found.");
    if (body.name && body.name.toLowerCase() !== role.name.toLowerCase()) {
      const dupe = await db.orgRole.findFirst({ where: { companyId: m.companyId, name: { equals: body.name, mode: "insensitive" }, id: { not: role.id } } });
      if (dupe) throw conflict("A role with that name already exists.");
    }
    const r = await db.orgRole.update({ where: { id: role.id }, data: { ...(body.name ? { name: body.name } : {}), ...(body.description !== undefined ? { description: body.description } : {}), ...(body.permissions ? { permissions: body.permissions } : {}) } });
    hub.publish(m.companyId, "members");
    return roleView(r);
  });

  app.delete<{ Params: { id: string } }>("/roles/:id", auth, async (req) => {
    const m = await requireMember(db, req);
    assert(can.manageTeam(m.roles), "Only an owner or admin can delete roles.");
    const role = await db.orgRole.findUnique({ where: { id: req.params.id } });
    if (!role || role.companyId !== m.companyId) throw notFound("Role not found.");
    if (role.builtIn) throw forbidden("Built-in roles can be renamed or re-permissioned, but not deleted.");
    const using = await db.projectMember.count({ where: { companyId: m.companyId, roles: { has: role.key } } });
    if (using) throw conflict(`${using} ${using === 1 ? "person holds" : "people hold"} this role on a project — remove it from them first.`);
    await db.orgRole.delete({ where: { id: role.id } });
    hub.publish(m.companyId, "members");
    return { deleted: true };
  });

  // ── Team ─────────────────────────────────────────────────────────────────────────────────
  app.get("/members", auth, async (req) => {
    const m = await requireMember(db, req);
    const rows = await db.membership.findMany({ where: { companyId: m.companyId }, include: { user: true }, orderBy: { createdAt: "asc" } });
    const assignments = await db.projectMember.findMany({ where: { companyId: m.companyId }, select: { userId: true, projectId: true, roles: true } });
    return rows.map((r) => ({
      id: r.userId,
      name: r.user.name,
      email: r.user.email,
      photo: r.user.photo,
      roles: r.roles,
      projects: assignments.filter((a) => a.userId === r.userId).map((a) => ({ projectId: a.projectId, roles: a.roles })),
      joinedAt: r.createdAt.getTime(),
    }));
  });

  app.patch<{ Params: { id: string } }>("/members/:id", auth, async (req) => {
    const m = await requireMember(db, req);
    assert(can.manageTeam(m.roles), "Only an owner or admin can change roles.");
    const { roles } = z.object({ roles: rolesSchema }).parse(req.body);
    const target = await db.membership.findUnique({ where: { userId: req.params.id } });
    if (!target || target.companyId !== m.companyId) throw notFound("That person isn't in your company.");
    if (target.roles.includes("owner")) throw forbidden("The owner's roles can't be changed.");
    await db.membership.update({ where: { userId: req.params.id }, data: { roles } });
    hub.publish(m.companyId, "members");
    return { id: req.params.id, roles };
  });

  app.delete<{ Params: { id: string } }>("/members/:id", auth, async (req) => {
    const m = await requireMember(db, req);
    assert(can.manageTeam(m.roles), "Only an owner or admin can remove people.");
    const target = await db.membership.findUnique({ where: { userId: req.params.id } });
    if (!target || target.companyId !== m.companyId) throw notFound("That person isn't in your company.");
    if (target.roles.includes("owner")) throw forbidden("The owner can't be removed.");
    // Their MTOs stay with the company (admins still see them).
    await db.$transaction([
      db.projectMember.deleteMany({ where: { userId: req.params.id, companyId: m.companyId } }),
      db.membership.delete({ where: { userId: req.params.id } }),
    ]);
    hub.publish(m.companyId, "members");
    return { removed: true };
  });

  app.get("/invites", auth, async (req) => {
    const m = await requireMember(db, req);
    assert(can.manageTeam(m.roles));
    const rows = await db.invite.findMany({ where: { companyId: m.companyId }, orderBy: { createdAt: "desc" } });
    return rows.map((i) => ({ id: i.id, email: i.email, name: i.name, roles: i.roles, projects: i.projects, createdAt: i.createdAt.getTime() }));
  });

  app.post("/invites", auth, async (req) => {
    const m = await requireMember(db, req);
    const body = z
      .object({ email: z.string().trim().toLowerCase().email("Enter a valid email address."), name: z.string().trim().max(120).optional().default(""), roles: rolesSchema.optional().default([]), projects: z.array(z.object({ projectId: z.string().min(1), roles: z.array(z.string().min(1).max(60)).min(1) })).max(100).optional().default([]) })
      .parse(req.body);
    // Owner/admin can invite anyone. A project's own Project Manager can add people to that
    // project (project roles only — no organisation role).
    const teamManager = body.projects.length > 0 && !body.roles.length && body.projects.every((p) => hasPerm(m, p.projectId, "project.team"));
    assert(can.manageTeam(m.roles) || teamManager, "Your role doesn't allow inviting people.");
    const knownRoles = new Set((await db.orgRole.findMany({ where: { companyId: m.companyId }, select: { key: true } })).map((r) => r.key));
    for (const p of body.projects) for (const r of p.roles) if (!knownRoles.has(r)) throw badRequest(`There's no role "${r}" in this company.`);
    const existingUser = await db.user.findUnique({ where: { email: body.email }, include: { membership: true } });
    if (existingUser?.membership) {
      throw conflict(existingUser.membership.companyId === m.companyId ? "They're already in your team." : "That email already belongs to another company.");
    }
    // Inviting the same person again adds to what they were already offered rather than replacing it.
    const previous = await db.invite.findUnique({ where: { companyId_email: { companyId: m.companyId, email: body.email } } });
    const earlier = ((Array.isArray(previous?.projects) ? previous.projects : []) as { projectId: string; roles: Role[] }[]).filter((p) => !body.projects.some((n) => n.projectId === p.projectId));
    body.projects = [...earlier, ...body.projects] as typeof body.projects;
    const inv = await db.invite.upsert({
      where: { companyId_email: { companyId: m.companyId, email: body.email } },
      create: { companyId: m.companyId, email: body.email, name: body.name, roles: body.roles, projects: body.projects, invitedById: m.userId },
      update: { name: body.name, roles: body.roles, projects: body.projects },
    });
    const company = await db.company.findUniqueOrThrow({ where: { id: m.companyId }, select: { name: true } });
    let emailed = false;
    if (mailer.enabled) {
      try {
        await mailer.send(
          body.email,
          `${m.name} added you to ${company.name} on XMTO`,
          `Hi ${body.name || "there"},\n\n${m.name} has added you to ${company.name} on XMTO as ${roleNames(body.roles)}. Your project assignments come next — the project manager will add you to a project.\n\n1. Install XMTO – MEP Material Take-off.\n2. Sign in with this email address (${body.email}).\n3. Enter the code we email you — you'll join ${company.name} automatically.\n\n— XMTO · A XOITT Transformation product · https://xoitt.com`
        );
        emailed = true;
      } catch (e) {
        req.log.warn({ err: e }, "invite email failed");
      }
    }
    hub.publish(m.companyId, "members");
    return { id: inv.id, email: inv.email, name: inv.name, roles: inv.roles, projects: inv.projects, createdAt: inv.createdAt.getTime(), emailed };
  });

  app.delete<{ Params: { email: string } }>("/invites/:email", auth, async (req) => {
    const m = await requireMember(db, req);
    assert(can.manageTeam(m.roles));
    const addr = normaliseEmail(decodeURIComponent(req.params.email));
    if (!addr) throw badRequest("Email missing.");
    await db.invite.deleteMany({ where: { companyId: m.companyId, email: addr } });
    hub.publish(m.companyId, "members");
    return { revoked: true };
  });
}
