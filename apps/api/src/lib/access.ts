import type { FastifyRequest } from "fastify";

import type { Db, Role } from "../db.js";
import { forbidden, unauthorized } from "./errors.js";
import { ALL_PERMISSIONS, type Permission } from "./permissions.js";

export interface Member {
  userId: string;
  email: string;
  name: string;
  companyId: string;
  // Organisation-level roles: owner and/or admin (empty for everyone else).
  roles: Role[];
  // Role keys held on each project, keyed by project id.
  projectRoles: Record<string, string[]>;
  // What each company role (OrgRole.key) allows.
  rolePerms: Record<string, string[]>;
}

// Who can do what at organisation level. Owner and admin only — project work is by permission.
export const can = {
  manageTeam: (roles: Role[]) => roles.includes("owner") || roles.includes("admin"),
  manageLibrary: (roles: Role[]) => roles.includes("owner") || roles.includes("admin"),
};

export const isOrgAdmin = (m: Pick<Member, "roles">) => m.roles.includes("owner") || m.roles.includes("admin");

// Everything this person may do on one project: owner/admin hold every permission; anyone else
// gets the union of the permissions of the roles they hold there.
export function permsIn(m: Pick<Member, "roles" | "projectRoles" | "rolePerms">, projectId: string): Set<string> {
  if (isOrgAdmin(m)) return new Set<string>(ALL_PERMISSIONS);
  const out = new Set<string>();
  for (const key of m.projectRoles[projectId] ?? []) for (const p of m.rolePerms[key] ?? []) out.add(p);
  return out;
}

export const hasPerm = (m: Pick<Member, "roles" | "projectRoles" | "rolePerms">, projectId: string, perm: Permission) => permsIn(m, projectId).has(perm);

// Every project this person is on (owner/admin are on all of them — callers handle that case).
export const projectIdsOf = (m: Pick<Member, "projectRoles">) => Object.keys(m.projectRoles);

export function userId(req: FastifyRequest): string {
  const sub = (req.user as { sub?: string } | undefined)?.sub;
  if (!sub) throw unauthorized();
  return sub;
}

// Loads the signed-in person's company membership. Every company-scoped route goes through here,
// so a request can never reach another company's rows.
export async function requireMember(db: Db, req: FastifyRequest): Promise<Member> {
  const id = userId(req);
  const m = await db.membership.findUnique({ where: { userId: id }, include: { user: true } });
  if (!m) throw forbidden("You're not part of a company yet.");
  const [assignments, roleRows] = await Promise.all([
    db.projectMember.findMany({ where: { userId: id, companyId: m.companyId }, select: { projectId: true, roles: true } }),
    db.orgRole.findMany({ where: { companyId: m.companyId }, select: { key: true, permissions: true } }),
  ]);
  const projectRoles: Record<string, string[]> = {};
  for (const a of assignments) projectRoles[a.projectId] = a.roles;
  const rolePerms: Record<string, string[]> = {};
  for (const r of roleRows) rolePerms[r.key] = r.permissions;
  return { userId: id, email: m.user.email, name: m.user.name, companyId: m.companyId, roles: m.roles, projectRoles, rolePerms };
}

export function assert(ok: boolean, msg?: string) {
  if (!ok) throw forbidden(msg);
}
