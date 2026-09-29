// Mirrors apps/api/src/lib/mtoStatus.ts exactly — the client-side copy of the workflow rules, so
// the Action Bar can show the right buttons without a round trip. The server is still the
// authority: every transition is re-checked there, and a stale/forbidden move comes back as an
// error the UI just surfaces (see XMTO_BUILD_BRIEF.md section 5).

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
];

// Full workflow: approval (Phase 1), procurement (Phase 3), logistics + cancel (Phase 4).
export const TRANSITIONS = [
  // Approval loop
  { from: "DRAFT",             to: "SUBMITTED",        roles: ["site_supervisor"], requireOwnMto: true, label: "Submit" },
  { from: "SUBMITTED",         to: "APPROVED",         roles: ["project_manager"], label: "Approve" },
  { from: "SUBMITTED",         to: "REJECTED",         roles: ["project_manager"], commentRequired: true, label: "Reject", tone: "danger" },
  { from: "REJECTED",          to: "SUBMITTED",        roles: ["site_supervisor"], requireOwnMto: true, label: "Resubmit" },
  { from: "APPROVED",          to: "BUDGET_OK",        roles: ["finance"], label: "Mark budget OK" },
  { from: "APPROVED",          to: "SENT_BACK",        roles: ["finance"], commentRequired: true, label: "Send back", tone: "danger" },
  { from: "SENT_BACK",         to: "APPROVED",         roles: ["project_manager"], label: "Re-approve" },
  { from: "SENT_BACK",         to: "REJECTED",         roles: ["project_manager"], commentRequired: true, label: "Reject", tone: "danger" },
  // Phase 3: procurement
  { from: "BUDGET_OK",         to: "READY_TO_DISPATCH",roles: ["procurement"], label: "Mark ready to dispatch" },
  // Phase 4: logistics
  { from: "READY_TO_DISPATCH", to: "DISPATCHED",       roles: ["logistics"], label: "Mark dispatched" },
  { from: "DISPATCHED",        to: "DELIVERED",        roles: ["logistics", "site_supervisor"], label: "Mark delivered" },
  // Phase 4: cancel (PM or Admin; comment required)
  { from: "APPROVED",          to: "CANCELLED",        roles: ["project_manager"], commentRequired: true, label: "Cancel", tone: "danger" },
  { from: "BUDGET_OK",         to: "CANCELLED",        roles: ["project_manager"], commentRequired: true, label: "Cancel", tone: "danger" },
  { from: "SENT_BACK",         to: "CANCELLED",        roles: ["project_manager"], commentRequired: true, label: "Cancel", tone: "danger" },
  { from: "READY_TO_DISPATCH", to: "CANCELLED",        roles: ["project_manager"], commentRequired: true, label: "Cancel", tone: "danger" },
  { from: "DISPATCHED",        to: "CANCELLED",        roles: ["project_manager"], commentRequired: true, label: "Cancel", tone: "danger" },
  { from: "DELIVERED",         to: "CANCELLED",        roles: ["project_manager"], commentRequired: true, label: "Cancel", tone: "danger" },
  { from: "IN_USE",            to: "CANCELLED",        roles: ["project_manager"], commentRequired: true, label: "Cancel", tone: "danger" },
];

// A member's roles, expanded the way the brief's role table describes: Owner can do anything;
// Admin can do anything a Project Manager can do (on top of their own admin-only actions).
export function effectiveRoles(roles) {
  const set = new Set(roles || []);
  if (set.has("owner")) {
    return new Set(["owner", "admin", "project_manager", "finance", "procurement", "logistics", "site_supervisor", "viewer"]);
  }
  if (set.has("admin")) set.add("project_manager");
  return set;
}

export function findTransition(from, to) {
  return TRANSITIONS.find((r) => r.from === from && r.to === to);
}

export function canPerform(memberRoles, rule) {
  const eff = effectiveRoles(memberRoles);
  return rule.roles.some((r) => eff.has(r));
}

// Which statuses are "waiting" on at least one of these roles to act (used by the Inbox).
// Rejected isn't listed here — it waits on the MTO's own creator, handled separately.
const WAITING_ON = {
  SUBMITTED:         ["project_manager"],
  APPROVED:          ["finance"],
  SENT_BACK:         ["project_manager"],
  BUDGET_OK:         ["procurement"],       // Phase 3
  READY_TO_DISPATCH: ["logistics"],         // Phase 4
};

export function statusesWaitingOnRoles(roles) {
  const eff = effectiveRoles(roles);
  return Object.keys(WAITING_ON).filter((status) => WAITING_ON[status].some((r) => eff.has(r)));
}

export const STATUSES_WAITING_ON_CREATOR = ["REJECTED"];

// Every move this member could attempt from `status`, given whether they created the MTO.
// The Action Bar renders one button per entry; the server has the final say.
export function availableTransitions(status, roles, { isOwnMto } = {}) {
  return TRANSITIONS.filter((r) => r.from === status && canPerform(roles, r) && (!r.requireOwnMto || isOwnMto)).map((r) => ({
    to: r.to,
    label: r.label,
    tone: r.tone || "primary",
    commentRequired: !!r.commentRequired,
  }));
}
