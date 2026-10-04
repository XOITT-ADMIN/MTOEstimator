import type { Db } from "../db.js";

// Permissions are the unit the API checks. A role is just a named bundle of them, defined per
// company (Settings › Roles & permissions) and handed to people per project. Owner and admin sit
// outside this: they're organisation-wide and hold every permission.
export const PERMISSIONS = [
  // MTO
  { key: "mto.edit", group: "MTOs", label: "Create and edit MTOs", hint: "Drafts and rejected MTOs" },
  { key: "mto.view_all", group: "MTOs", label: "See everyone's MTOs", hint: "Off = only the MTOs they created" },
  { key: "mto.submit", group: "MTOs", label: "Submit MTOs", hint: "Submit and resubmit their own MTOs" },
  { key: "mto.approve", group: "MTOs", label: "Approve or reject MTOs", hint: "Also re-approve after Finance sends one back" },
  { key: "mto.budget", group: "MTOs", label: "Budget check", hint: "Mark Budget OK, or send back" },
  { key: "mto.procure", group: "MTOs", label: "Procurement", hint: "Allocate stock, buy, mark ready to dispatch" },
  { key: "mto.dispatch", group: "MTOs", label: "Dispatch", hint: "Create and mark dispatches" },
  { key: "mto.deliver", group: "MTOs", label: "Mark delivered", hint: "Confirm material reached site" },
  { key: "mto.cancel", group: "MTOs", label: "Cancel MTOs", hint: "Cancelled MTOs return their stock" },
  { key: "mto.close", group: "MTOs", label: "Close MTOs", hint: "Leftover material goes back to stock" },
  // Stock
  { key: "stock.in", group: "Stock", label: "Stock in purchases", hint: "Receive bought material into stock" },
  { key: "stock.adjust", group: "Stock", label: "Adjust stock", hint: "Manual corrections, with a reason" },
  // Site
  { key: "site.use", group: "Site", label: "Record daily use", hint: "Used and wasted material on site" },
  // Project
  { key: "project.edit", group: "Project", label: "Edit and close the project", hint: "Rename, notification email, close" },
  { key: "project.team", group: "Project", label: "Manage the project team", hint: "Add people and set their roles on the project" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];
export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((p) => p.key);
export const isPermission = (v: unknown): v is Permission => typeof v === "string" && (ALL_PERMISSIONS as string[]).includes(v);

// The roles every company starts with. Their names and permissions can be changed; they can't be
// deleted, so there is always someone able to approve, buy and dispatch.
export const DEFAULT_ROLES: { key: string; name: string; description: string; permissions: Permission[] }[] = [
  { key: "site_supervisor", name: "Site Supervisor", description: "Field engineer: raises and submits MTOs, records site use", permissions: ["mto.edit", "mto.submit", "mto.deliver", "site.use"] },
  { key: "project_manager", name: "Project Manager", description: "Approves MTOs and runs the project", permissions: ["mto.edit", "mto.view_all", "mto.approve", "mto.cancel", "mto.close", "site.use", "project.edit", "project.team"] },
  { key: "finance", name: "Finance", description: "Checks the budget on approved MTOs", permissions: ["mto.edit", "mto.view_all", "mto.budget"] },
  { key: "procurement", name: "Procurement", description: "Allocates stock, buys and stocks in purchases", permissions: ["mto.edit", "mto.view_all", "mto.procure", "stock.in", "stock.adjust"] },
  { key: "logistics", name: "Logistics", description: "Loading, dispatch and delivery", permissions: ["mto.edit", "mto.view_all", "mto.dispatch", "mto.deliver"] },
  { key: "viewer", name: "Viewer", description: "Read-only", permissions: ["mto.view_all"] },
];

type RoleDb = Pick<Db, "orgRole">;

export async function ensureDefaultRoles(db: RoleDb, companyId: string) {
  await db.orgRole.createMany({
    data: DEFAULT_ROLES.map((r) => ({ companyId, key: r.key, name: r.name, description: r.description, permissions: r.permissions, builtIn: true })),
    skipDuplicates: true,
  });
}

export function roleView(r: { id: string; key: string; name: string; description: string; permissions: string[]; builtIn: boolean }, inUse = 0) {
  return { id: r.id, key: r.key, name: r.name, description: r.description, permissions: r.permissions, builtIn: r.builtIn, inUse };
}
