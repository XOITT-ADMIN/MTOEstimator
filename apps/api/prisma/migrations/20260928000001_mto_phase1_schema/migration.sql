-- Phase 1 (MTO workflow) — step 1 of 2: purely additive changes, safe to run while the old
-- API code is still live. Nothing here is read by old code, and nothing old code reads is
-- removed yet. Step 2 (20260928000002_mto_phase1_backfill) fills in the new columns and then
-- drops what Phase 1 retires.

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('open', 'closed');

-- AlterEnum: add the five new roles. Each must be its own statement outside of any use of the
-- value (Postgres forbids using a brand-new enum value in the same transaction that added it),
-- which is exactly why the backfill that assigns these roles lives in the next migration.
ALTER TYPE "Role" ADD VALUE 'site_supervisor';
ALTER TYPE "Role" ADD VALUE 'project_manager';
ALTER TYPE "Role" ADD VALUE 'finance';
ALTER TYPE "Role" ADD VALUE 'procurement';
ALTER TYPE "Role" ADD VALUE 'logistics';

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "siteName" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'open',
    "createdById" TEXT NOT NULL,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MtoEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL DEFAULT '',
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MtoEvent_pkey" PRIMARY KEY ("id")
);

-- AlterTable: new nullable/defaulted columns only — no drops, no NOT NULL yet.
ALTER TABLE "Membership" ADD COLUMN "roles" "Role"[] NOT NULL DEFAULT '{}';
ALTER TABLE "Invite" ADD COLUMN "roles" "Role"[] NOT NULL DEFAULT '{}';
ALTER TABLE "Estimate" ADD COLUMN "projectId" TEXT,
    ADD COLUMN "submittedAt" TIMESTAMP(3),
    ADD COLUMN "closedAt" TIMESTAMP(3);
ALTER TABLE "Estimate" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- CreateIndex
CREATE INDEX "Project_companyId_status_idx" ON "Project"("companyId", "status");
CREATE UNIQUE INDEX "Project_companyId_name_key" ON "Project"("companyId", "name");
CREATE INDEX "MtoEvent_companyId_estimateId_createdAt_idx" ON "MtoEvent"("companyId", "estimateId", "createdAt");
CREATE INDEX "Estimate_companyId_projectId_idx" ON "Estimate"("companyId", "projectId");
CREATE INDEX "Estimate_companyId_status_idx" ON "Estimate"("companyId", "status");

-- AddForeignKey (projectId is still nullable, so existing rows with NULL are unaffected)
ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MtoEvent" ADD CONSTRAINT "MtoEvent_companyId_estimateId_fkey" FOREIGN KEY ("companyId", "estimateId") REFERENCES "Estimate"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
