-- Phase 1 (MTO workflow) — step 2 of 2: backfill data into the columns step 1 added, then
-- retire what Phase 1 removes (Company.stockPolicy, the old single Membership/Invite role).
-- Safe to run only after step 1 has fully committed (it uses the Role values step 1 added).

-- 1) Roles: everyone keeps their old single role, just as a one-item list. The old
--    "estimator" role becomes "site_supervisor" (Section 3 of the brief).
UPDATE "Membership"
SET "roles" = ARRAY[(CASE "role" WHEN 'estimator' THEN 'site_supervisor' ELSE "role"::text END)::"Role"];

UPDATE "Invite"
SET "roles" = ARRAY[(CASE "role" WHEN 'estimator' THEN 'site_supervisor' ELSE "role"::text END)::"Role"];

-- 2) Projects: one per distinct project name per company (Estimate.name was the free-text
--    "Project" field). A blank name becomes "Untitled project". Every estimate — including
--    soft-deleted ones — is grouped, so every row has a project to attach to below.
--    A project is CLOSED only when every one of its (non-deleted) estimates was already
--    finished under the old quotation flow (Ready or Sent); otherwise it starts OPEN.
WITH names AS (
  SELECT
    "companyId",
    COALESCE(NULLIF(TRIM("name"), ''), 'Untitled project') AS project_name,
    MIN("createdById") AS created_by,
    MIN("createdAt") AS first_created,
    BOOL_AND("deletedAt" IS NOT NULL OR "status" IN ('Ready', 'Sent')) AS all_finished,
    COUNT(*) FILTER (WHERE "deletedAt" IS NULL) AS active_count
  FROM "Estimate"
  GROUP BY "companyId", COALESCE(NULLIF(TRIM("name"), ''), 'Untitled project')
)
INSERT INTO "Project" ("id", "companyId", "name", "status", "createdById", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  "companyId",
  project_name,
  CASE WHEN active_count > 0 AND all_finished THEN 'closed' ELSE 'open' END::"ProjectStatus",
  created_by,
  first_created,
  first_created
FROM names;

-- 3) Point every estimate at its project.
UPDATE "Estimate" e
SET "projectId" = p."id"
FROM "Project" p
WHERE p."companyId" = e."companyId"
  AND p."name" = COALESCE(NULLIF(TRIM(e."name"), ''), 'Untitled project');

ALTER TABLE "Estimate" ALTER COLUMN "projectId" SET NOT NULL;

-- 4) Status: DRAFT and REJECTED carry over as-is (spelled in upper case from here on); anything
--    further along under the old client-quotation flow (Ready, Sent, Approved, Completed) had
--    no further step in the new internal workflow, so it becomes CLOSED — a finished, read-only
--    historical record. Also renumber EST-0001 → MTO-0001 (same digits) and add "projectId" to
--    the JSON document, which is what the app actually renders.
UPDATE "Estimate"
SET
  "status" = CASE "status" WHEN 'Draft' THEN 'DRAFT' WHEN 'Rejected' THEN 'REJECTED' ELSE 'CLOSED' END,
  "estimateNumber" = REGEXP_REPLACE("estimateNumber", '^EST-', 'MTO-'),
  "data" = jsonb_set(
    jsonb_set(
      jsonb_set("data"::jsonb, '{status}', to_jsonb(CASE "status" WHEN 'Draft' THEN 'DRAFT' WHEN 'Rejected' THEN 'REJECTED' ELSE 'CLOSED' END)),
      '{estimateNumber}', to_jsonb(REGEXP_REPLACE("estimateNumber", '^EST-', 'MTO-'))
    ),
    '{projectId}', to_jsonb("projectId")
  );

-- 5) Drop what Phase 1 retires now that everything has been migrated off it.
ALTER TABLE "Membership" ALTER COLUMN "roles" SET DEFAULT ARRAY['site_supervisor']::"Role"[];
ALTER TABLE "Membership" DROP COLUMN "role";
ALTER TABLE "Invite" ALTER COLUMN "roles" SET DEFAULT ARRAY['site_supervisor']::"Role"[];
ALTER TABLE "Invite" DROP COLUMN "role";
ALTER TABLE "Company" DROP COLUMN "stockPolicy";
