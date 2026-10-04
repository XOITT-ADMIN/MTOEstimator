-- Custom roles + permissions (Settings › Roles & permissions).
-- Roles stop being a fixed enum: each company defines its own (OrgRole) and people hold them per
-- project (ProjectMember.roles now stores OrgRole.key values). The Role enum shrinks to the two
-- organisation-wide roles, owner and admin.

-- CreateTable
CREATE TABLE "OrgRole" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "permissions" TEXT[],
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgRole_companyId_key_key" ON "OrgRole"("companyId", "key");

-- AddForeignKey
ALTER TABLE "OrgRole" ADD CONSTRAINT "OrgRole_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Project roles become free-form keys.
ALTER TABLE "ProjectMember" ALTER COLUMN "roles" TYPE TEXT[] USING "roles"::text[];

-- Shrink the Role enum to owner / admin (anything else on Membership/Invite was a project role).
UPDATE "Membership" SET "roles" = ARRAY(SELECT r FROM unnest("roles") AS r WHERE r::text IN ('owner', 'admin'));
UPDATE "Invite" SET "roles" = ARRAY(SELECT r FROM unnest("roles") AS r WHERE r::text IN ('owner', 'admin'));
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('owner', 'admin');
ALTER TABLE "Membership" ALTER COLUMN "roles" DROP DEFAULT;
ALTER TABLE "Membership" ALTER COLUMN "roles" TYPE "Role"[] USING ("roles"::text[]::"Role"[]);
ALTER TABLE "Membership" ALTER COLUMN "roles" SET DEFAULT ARRAY[]::"Role"[];
ALTER TABLE "Invite" ALTER COLUMN "roles" DROP DEFAULT;
ALTER TABLE "Invite" ALTER COLUMN "roles" TYPE "Role"[] USING ("roles"::text[]::"Role"[]);
ALTER TABLE "Invite" ALTER COLUMN "roles" SET DEFAULT ARRAY[]::"Role"[];
DROP TYPE "Role_old";

-- Give every existing company the built-in roles.
INSERT INTO "OrgRole" ("id", "companyId", "key", "name", "description", "permissions", "builtIn")
SELECT 'role_' || md5(c."id" || d."key"), c."id", d."key", d."name", d."description", d."permissions", true
FROM "Company" c
CROSS JOIN (VALUES
  ('site_supervisor', 'Site Supervisor', 'Field engineer: raises and submits MTOs, records site use', ARRAY['mto.edit','mto.submit','mto.deliver','site.use']),
  ('project_manager', 'Project Manager', 'Approves MTOs and runs the project', ARRAY['mto.edit','mto.view_all','mto.approve','mto.cancel','mto.close','site.use','project.edit','project.team']),
  ('finance', 'Finance', 'Checks the budget on approved MTOs', ARRAY['mto.edit','mto.view_all','mto.budget']),
  ('procurement', 'Procurement', 'Allocates stock, buys and stocks in purchases', ARRAY['mto.edit','mto.view_all','mto.procure','stock.in','stock.adjust']),
  ('logistics', 'Logistics', 'Loading, dispatch and delivery', ARRAY['mto.edit','mto.view_all','mto.dispatch','mto.deliver']),
  ('viewer', 'Viewer', 'Read-only', ARRAY['mto.view_all'])
) AS d("key", "name", "description", "permissions")
ON CONFLICT DO NOTHING;
