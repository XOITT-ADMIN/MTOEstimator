import type { FastifyRequest } from "fastify";

import type { Db, Role } from "../db.js";
import { forbidden, unauthorized } from "./errors.js";

export interface Member {
  userId: string;
  email: string;
  name: string;
  companyId: string;
  roles: Role[];
}

const ONLY_OWN_ROLE: Role = "site_supervisor";

// Who can do what. Kept in one place so the rules are easy to read and change.
export const can = {
  manageTeam: (roles: Role[]) => roles.includes("owner") || roles.includes("admin"),
  manageLibrary: (roles: Role[]) => roles.includes("owner") || roles.includes("admin"),
  editEstimates: (roles: Role[]) => roles.length > 0 && roles.some((r) => r !== "viewer"),
  // A person whose only role is Site Supervisor sees just their own MTOs; anyone holding another
  // role too (PM, Finance, Procurement, Logistics, Admin, Owner) or Viewer sees the whole company.
  seeAllEstimates: (roles: Role[]) => roles.some((r) => r !== ONLY_OWN_ROLE),
};

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
  return { userId: id, email: m.user.email, name: m.user.name, companyId: m.companyId, roles: m.roles };
}

export function assert(ok: boolean, msg?: string) {
  if (!ok) throw forbidden(msg);
}
