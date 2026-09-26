import type { FastifyRequest } from "fastify";

import type { Db, Role } from "../db.js";
import { forbidden, unauthorized } from "./errors.js";

export interface Member {
  userId: string;
  email: string;
  name: string;
  companyId: string;
  role: Role;
}

// Who can do what. Kept in one place so the rules are easy to read and change.
export const can = {
  manageTeam: (r: Role) => r === "owner" || r === "admin",
  manageLibrary: (r: Role) => r === "owner" || r === "admin",
  editEstimates: (r: Role) => r !== "viewer",
  seeAllEstimates: (r: Role) => r !== "estimator",
  // Statuses only an owner/admin may move an estimate into.
  approve: (r: Role) => r === "owner" || r === "admin",
};

export const ADMIN_ONLY_STATUSES = new Set(["Approved", "Rejected", "Completed"]);

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
  return { userId: id, email: m.user.email, name: m.user.name, companyId: m.companyId, role: m.role };
}

export function assert(ok: boolean, msg?: string) {
  if (!ok) throw forbidden(msg);
}
