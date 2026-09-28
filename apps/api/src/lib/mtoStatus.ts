// The MTO (material take-off / material request) workflow — Sept 2026 rebuild.
// See XMTO_BUILD_BRIEF.md section 5 for the full table this file encodes.
//
// Phase 1 wires the approval loop only (Draft → Submitted → Approved/Rejected → Budget OK /
// Sent back). Ready to dispatch, Dispatched, Delivered, In use, Closed and Cancelled exist as
// values so History/inbox code and the schema are ready for them, but nothing can reach them
// yet — later phases (procurement, logistics, site use) add the transitions that do.
import type { Role } from "../db.js";

export const MTO_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "BUDGET_OK",
  "SENT_BACK",
  "READY_TO_DISPATCH",
  "DISPATCHED",
  "DELIVERED",
  "IN_USE",
  "CLOSED",
  "CANCELLED",
] as const;

export type MtoStatus = (typeof MTO_STATUSES)[number];

export function isMtoStatus(v: unknown): v is MtoStatus {
  return typeof v === "string" && (MTO_STATUSES as readonly string[]).includes(v);
}

export interface TransitionRule {
  from: MtoStatus;
  to: MtoStatus;
  roles: Role[]; // any one of these roles (after admin/owner expansion) allows the move
  commentRequired?: boolean;
  requireOwnMto?: boolean; // the caller must have created the MTO, unless they're owner/admin
}

// Phase 1's wired moves. (Cancel, and everything from Budget OK onward, is Phase 3/4/5.)
export const TRANSITIONS: TransitionRule[] = [
  { from: "DRAFT", to: "SUBMITTED", roles: ["site_supervisor"], requireOwnMto: true },
  { from: "SUBMITTED", to: "APPROVED", roles: ["project_manager"] },
  { from: "SUBMITTED", to: "REJECTED", roles: ["project_manager"], commentRequired: true },
  { from: "REJECTED", to: "SUBMITTED", roles: ["site_supervisor"], requireOwnMto: true },
  { from: "APPROVED", to: "BUDGET_OK", roles: ["finance"] },
  { from: "APPROVED", to: "SENT_BACK", roles: ["finance"], commentRequired: true },
  { from: "SENT_BACK", to: "APPROVED", roles: ["project_manager"] },
  { from: "SENT_BACK", to: "REJECTED", roles: ["project_manager"], commentRequired: true },
];

// A member's roles, expanded the way the brief's role table describes: Owner can do anything;
// Admin can do anything a Project Manager can do (on top of their own admin-only actions).
export function effectiveRoles(roles: Role[]): Set<Role> {
  const set = new Set(roles);
  if (set.has("owner")) {
    return new Set<Role>(["owner", "admin", "project_manager", "finance", "procurement", "logistics", "site_supervisor", "viewer"]);
  }
  if (set.has("admin")) set.add("project_manager");
  return set;
}

export function findTransition(from: string, to: string): TransitionRule | undefined {
  return TRANSITIONS.find((r) => r.from === from && r.to === to);
}

export function canPerform(memberRoles: Role[], rule: TransitionRule): boolean {
  const eff = effectiveRoles(memberRoles);
  return rule.roles.some((r) => eff.has(r));
}

// Which statuses are "waiting" on at least one of these roles to act (used by the Inbox).
// Rejected isn't listed here — it waits on the MTO's own creator, handled separately.
const WAITING_ON: Partial<Record<MtoStatus, Role[]>> = {
  SUBMITTED: ["project_manager"],
  APPROVED: ["finance"],
  SENT_BACK: ["project_manager"],
};

export function statusesWaitingOnRoles(roles: Role[]): MtoStatus[] {
  const eff = effectiveRoles(roles);
  return (Object.keys(WAITING_ON) as MtoStatus[]).filter((status) => WAITING_ON[status]!.some((r) => eff.has(r)));
}

export const STATUSES_WAITING_ON_CREATOR: MtoStatus[] = ["REJECTED"];
