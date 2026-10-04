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
  { from: "DRAFT",             to: "SUBMITTED",        perm: "mto.submit", requireOwnMto: true, label: "Submit" },
  { from: "SUBMITTED",         to: "APPROVED",         perm: "mto.approve", label: "Approve" },
  { from: "SUBMITTED",         to: "REJECTED",         perm: "mto.approve", commentRequired: true, label: "Reject", tone: "danger" },
  { from: "REJECTED",          to: "SUBMITTED",        perm: "mto.submit", requireOwnMto: true, label: "Resubmit" },
  { from: "APPROVED",          to: "BUDGET_OK",        perm: "mto.budget", label: "Mark budget OK" },
  { from: "APPROVED",          to: "SENT_BACK",        perm: "mto.budget", commentRequired: true, label: "Send back", tone: "danger" },
  { from: "SENT_BACK",         to: "APPROVED",         perm: "mto.approve", label: "Re-approve" },
  { from: "SENT_BACK",         to: "REJECTED",         perm: "mto.approve", commentRequired: true, label: "Reject", tone: "danger" },
  // Phase 3: procurement
  { from: "BUDGET_OK",         to: "READY_TO_DISPATCH",perm: "mto.procure", label: "Mark ready to dispatch" },
  // Phase 4: logistics
  // Dispatch details aren't tracked — it goes straight to delivered. (The server still accepts
  // READY_TO_DISPATCH → DISPATCHED for MTOs that were already moved that way.)
  { from: "READY_TO_DISPATCH", to: "DELIVERED",        perm: "mto.deliver", label: "Mark delivered" },
  { from: "DISPATCHED",        to: "DELIVERED",        perm: "mto.deliver", label: "Mark delivered" },
  // Phase 4: cancel (PM or Admin; comment required)
  { from: "APPROVED",          to: "CANCELLED",        perm: "mto.cancel", commentRequired: true, label: "Cancel", tone: "danger" },
  { from: "BUDGET_OK",         to: "CANCELLED",        perm: "mto.cancel", commentRequired: true, label: "Cancel", tone: "danger" },
  { from: "SENT_BACK",         to: "CANCELLED",        perm: "mto.cancel", commentRequired: true, label: "Cancel", tone: "danger" },
  { from: "READY_TO_DISPATCH", to: "CANCELLED",        perm: "mto.cancel", commentRequired: true, label: "Cancel", tone: "danger" },
  { from: "DISPATCHED",        to: "CANCELLED",        perm: "mto.cancel", commentRequired: true, label: "Cancel", tone: "danger" },
  // Closing an MTO records its unused material as returned automatically.
  { from: "DELIVERED",         to: "CLOSED",           perm: "mto.close", label: "Close MTO" },
  { from: "IN_USE",            to: "CLOSED",           perm: "mto.close", label: "Close MTO" },
  { from: "DELIVERED",         to: "CANCELLED",        perm: "mto.cancel", commentRequired: true, label: "Cancel", tone: "danger" },
  { from: "IN_USE",            to: "CANCELLED",        perm: "mto.cancel", commentRequired: true, label: "Cancel", tone: "danger" },
];

export function findTransition(from, to) {
  return TRANSITIONS.find((r) => r.from === from && r.to === to);
}

// `perms` is anything with has(permission) — see permsFor() in CompanyContext.
export function canPerform(perms, rule) {
  return perms.has(rule.perm);
}

// Which statuses are "waiting" on someone holding a permission (used by the Inbox).
// Rejected isn't listed here — it waits on the MTO's own creator, handled separately.
const WAITING_ON = {
  SUBMITTED:         "mto.approve",
  APPROVED:          "mto.budget",
  SENT_BACK:         "mto.approve",
  BUDGET_OK:         "mto.procure",
  READY_TO_DISPATCH: "mto.dispatch",
};

export function statusesWaitingOnPerms(perms) {
  return Object.keys(WAITING_ON).filter((status) => perms.has(WAITING_ON[status]));
}

export const STATUSES_WAITING_ON_CREATOR = ["REJECTED"];

// Every move this member could attempt from `status`, given whether they created the MTO.
// The Action Bar renders one button per entry; the server has the final say.
export function availableTransitions(status, perms, { isOwnMto } = {}) {
  return TRANSITIONS.filter((r) => r.from === status && canPerform(perms, r) && (!r.requireOwnMto || isOwnMto)).map((r) => ({
    to: r.to,
    label: r.label,
    tone: r.tone || "primary",
    commentRequired: !!r.commentRequired,
  }));
}
