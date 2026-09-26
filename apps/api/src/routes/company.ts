import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { assert, can, requireMember, userId } from "../lib/access.js";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../lib/errors.js";
import { normaliseEmail } from "../lib/otp.js";
import type { Deps } from "../app.js";

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
    notificationEmail: z.string().max(160),
    termsAndConditions: z.string().max(5000),
  })
  .partial();

const inviteRole = z.enum(["admin", "estimator", "viewer"]);

function companyView(c: { id: string; name: string; profile: unknown; stockPolicy: string; createdAt: Date }, ownerUid: string | null) {
  return { id: c.id, name: c.name, profile: { ...(c.profile as object), name: c.name }, stockPolicy: c.stockPolicy, ownerUid, createdAt: c.createdAt.getTime() };
}

export async function companyRoutes(app: FastifyInstance, { db, hub, mailer }: Deps) {
  const auth = { onRequest: [app.authenticate] };

  async function ownerOf(companyId: string) {
    const o = await db.membership.findFirst({ where: { companyId, role: "owner" }, select: { userId: true } });
    return o?.userId ?? null;
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
          const created = await tx.membership.create({ data: { companyId: invite.companyId, userId: id, role: invite.role }, include: { company: true } });
          await tx.invite.deleteMany({ where: { email: user.email } });
          if (invite.name && !user.name) await tx.user.update({ where: { id }, data: { name: invite.name } });
          return created;
        });
        hub.publish(invite.companyId, "members");
      }
    }
    return {
      user: { id: user.id, uid: user.id, email: user.email, name: user.name, photo: user.photo, provider: user.provider },
      membership: m ? { companyId: m.companyId, role: m.role } : null,
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
        members: { create: { userId: id, role: "owner" } },
      },
    });
    return { company: companyView(company, id), membership: { companyId: company.id, role: "owner" } };
  });

  app.get("/company", auth, async (req) => {
    const m = await requireMember(db, req);
    const c = await db.company.findUniqueOrThrow({ where: { id: m.companyId } });
    return companyView(c, await ownerOf(c.id));
  });

  app.patch("/company", auth, async (req) => {
    const m = await requireMember(db, req);
    assert(can.manageTeam(m.role), "Only an owner or admin can change the company profile.");
    const body = z.object({ profile: profileSchema.optional(), stockPolicy: z.enum(["block", "warn"]).optional() }).parse(req.body);
    const c = await db.company.findUniqueOrThrow({ where: { id: m.companyId } });
    const profile = { ...(c.profile as object), ...(body.profile ?? {}) } as Record<string, unknown>;
    const updated = await db.company.update({
      where: { id: m.companyId },
      data: { profile: profile as object, name: (body.profile?.name as string) || c.name, stockPolicy: body.stockPolicy ?? c.stockPolicy },
    });
    hub.publish(m.companyId, "company");
    return companyView(updated, await ownerOf(updated.id));
  });

  // ── Team ─────────────────────────────────────────────────────────────────────────────────
  app.get("/members", auth, async (req) => {
    const m = await requireMember(db, req);
    const rows = await db.membership.findMany({ where: { companyId: m.companyId }, include: { user: true }, orderBy: { createdAt: "asc" } });
    return rows.map((r) => ({ id: r.userId, name: r.user.name, email: r.user.email, photo: r.user.photo, role: r.role, joinedAt: r.createdAt.getTime() }));
  });

  app.patch<{ Params: { id: string } }>("/members/:id", auth, async (req) => {
    const m = await requireMember(db, req);
    assert(can.manageTeam(m.role), "Only an owner or admin can change roles.");
    const { role } = z.object({ role: inviteRole }).parse(req.body);
    const target = await db.membership.findUnique({ where: { userId: req.params.id } });
    if (!target || target.companyId !== m.companyId) throw notFound("That person isn't in your company.");
    if (target.role === "owner") throw forbidden("The owner's role can't be changed.");
    await db.membership.update({ where: { userId: req.params.id }, data: { role } });
    hub.publish(m.companyId, "members");
    return { id: req.params.id, role };
  });

  app.delete<{ Params: { id: string } }>("/members/:id", auth, async (req) => {
    const m = await requireMember(db, req);
    assert(can.manageTeam(m.role), "Only an owner or admin can remove people.");
    const target = await db.membership.findUnique({ where: { userId: req.params.id } });
    if (!target || target.companyId !== m.companyId) throw notFound("That person isn't in your company.");
    if (target.role === "owner") throw forbidden("The owner can't be removed.");
    // Their estimates stay with the company (admins still see them).
    await db.membership.delete({ where: { userId: req.params.id } });
    hub.publish(m.companyId, "members");
    return { removed: true };
  });

  app.get("/invites", auth, async (req) => {
    const m = await requireMember(db, req);
    assert(can.manageTeam(m.role));
    const rows = await db.invite.findMany({ where: { companyId: m.companyId }, orderBy: { createdAt: "desc" } });
    return rows.map((i) => ({ id: i.id, email: i.email, name: i.name, role: i.role, createdAt: i.createdAt.getTime() }));
  });

  app.post("/invites", auth, async (req) => {
    const m = await requireMember(db, req);
    assert(can.manageTeam(m.role), "Only an owner or admin can invite people.");
    const body = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address."), name: z.string().trim().max(120).optional().default(""), role: inviteRole.default("estimator") }).parse(req.body);
    const existingUser = await db.user.findUnique({ where: { email: body.email }, include: { membership: true } });
    if (existingUser?.membership) {
      throw conflict(existingUser.membership.companyId === m.companyId ? "They're already in your team." : "That email already belongs to another company.");
    }
    const inv = await db.invite.upsert({
      where: { companyId_email: { companyId: m.companyId, email: body.email } },
      create: { companyId: m.companyId, email: body.email, name: body.name, role: body.role, invitedById: m.userId },
      update: { name: body.name, role: body.role },
    });
    const company = await db.company.findUniqueOrThrow({ where: { id: m.companyId }, select: { name: true } });
    let emailed = false;
    if (mailer.enabled) {
      try {
        const roleName = { admin: "an admin", estimator: "a field engineer", viewer: "a viewer" }[body.role] ?? body.role;
        await mailer.send(
          body.email,
          `${m.name} added you to ${company.name} on XMTO`,
          `Hi ${body.name || "there"},\n\n${m.name} has added you to ${company.name} on XMTO as ${roleName}.\n\n1. Install XMTO – MEP Material Take-off.\n2. Sign in with this email address (${body.email}).\n3. Enter the code we email you — you'll join ${company.name} automatically.\n\n— XMTO · A XOITT Transformation product · https://xoitt.com`
        );
        emailed = true;
      } catch (e) {
        req.log.warn({ err: e }, "invite email failed");
      }
    }
    hub.publish(m.companyId, "members");
    return { id: inv.id, email: inv.email, name: inv.name, role: inv.role, createdAt: inv.createdAt.getTime(), emailed };
  });

  app.delete<{ Params: { email: string } }>("/invites/:email", auth, async (req) => {
    const m = await requireMember(db, req);
    assert(can.manageTeam(m.role));
    const addr = normaliseEmail(decodeURIComponent(req.params.email));
    if (!addr) throw badRequest("Email missing.");
    await db.invite.deleteMany({ where: { companyId: m.companyId, email: addr } });
    hub.publish(m.companyId, "members");
    return { revoked: true };
  });
}
