// The MTO (material take-off / material request) workflow.
// See XMTO_BUILD_BRIEF.md section 5 for the full table this file encodes.
//
// Every move needs one permission (see lib/permissions.ts). Which people hold it is up to the
// company: roles are defined per organisation and handed out per project.
import type { Permission } from "./permissions.js";

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
  perm: Permission; // the permission that allows this move
  commentRequired?: boolean;
  requireOwnMto?: boolean; // the caller must have created the MTO, unless they're owner/admin
}

// Full workflow: approval loop, procurement, logistics, cancel and close.
export const TRANSITIONS: TransitionRule[] = [
  // Approval loop
  { from: "DRAFT",              to: "SUBMITTED",         perm: "mto.submit", requireOwnMto: true },
  { from: "SUBMITTED",          to: "APPROVED",          perm: "mto.approve" },
  { from: "SUBMITTED",          to: "REJECTED",          perm: "mto.approve", commentRequired: true },
  { from: "REJECTED",           to: "SUBMITTED",         perm: "mto.submit", requireOwnMto: true },
  { from: "APPROVED",           to: "BUDGET_OK",         perm: "mto.budget" },
  { from: "APPROVED",           to: "SENT_BACK",         perm: "mto.budget", commentRequired: true },
  { from: "SENT_BACK",          to: "APPROVED",          perm: "mto.approve" },
  { from: "SENT_BACK",          to: "REJECTED",          perm: "mto.approve", commentRequired: true },
  // Procurement, logistics
  { from: "BUDGET_OK",          to: "READY_TO_DISPATCH", perm: "mto.procure" },
  { from: "READY_TO_DISPATCH",  to: "DELIVERED",         perm: "mto.deliver" },
  { from: "READY_TO_DISPATCH",  to: "DISPATCHED",        perm: "mto.dispatch" },
  { from: "DISPATCHED",         to: "DELIVERED",         perm: "mto.deliver" },
  // Cancel (stock is returned)
  { from: "APPROVED",           to: "CANCELLED",         perm: "mto.cancel", commentRequired: true },
  { from: "BUDGET_OK",          to: "CANCELLED",         perm: "mto.cancel", commentRequired: true },
  { from: "SENT_BACK",          to: "CANCELLED",         perm: "mto.cancel", commentRequired: true },
  { from: "READY_TO_DISPATCH",  to: "CANCELLED",         perm: "mto.cancel", commentRequired: true },
  { from: "DISPATCHED",         to: "CANCELLED",         perm: "mto.cancel", commentRequired: true },
  // Closing an MTO records its unused material as returned (done in the transition).
  { from: "DELIVERED",          to: "CLOSED",            perm: "mto.close" },
  { from: "IN_USE",             to: "CLOSED",            perm: "mto.close" },
  { from: "DELIVERED",          to: "CANCELLED",         perm: "mto.cancel", commentRequired: true },
  { from: "IN_USE",             to: "CANCELLED",         perm: "mto.cancel", commentRequired: true },
];

export function findTransition(from: string, to: string): TransitionRule | undefined {
  return TRANSITIONS.find((r) => r.from === from && r.to === to);
}

export function canPerform(perms: ReadonlySet<string>, rule: TransitionRule): boolean {
  return perms.has(rule.perm);
}

// Which statuses are "waiting" on someone holding a permission (used by the Inbox).
// Rejected isn't listed here — it waits on the MTO's own creator, handled separately.
const WAITING_ON: Partial<Record<MtoStatus, Permission>> = {
  SUBMITTED:         "mto.approve",
  APPROVED:          "mto.budget",
  SENT_BACK:         "mto.approve",
  BUDGET_OK:         "mto.procure",
  READY_TO_DISPATCH: "mto.dispatch",
};

export function statusesWaitingOnPerms(perms: ReadonlySet<string>): MtoStatus[] {
  return (Object.keys(WAITING_ON) as MtoStatus[]).filter((status) => perms.has(WAITING_ON[status]!));
}

export const STATUSES_WAITING_ON_CREATOR: MtoStatus[] = ["REJECTED"];
