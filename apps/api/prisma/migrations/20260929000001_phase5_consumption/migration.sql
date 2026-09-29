-- Phase 5: site consumption log and project close with stock return

DO $$ BEGIN
  CREATE TYPE "ConsumptionKind" AS ENUM ('USED', 'WASTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ConsumptionEntry" (
  "id"          TEXT NOT NULL,
  "companyId"   TEXT NOT NULL,
  "projectId"   TEXT NOT NULL,
  "stockKey"    TEXT NOT NULL,
  "qty"         DECIMAL(14,2) NOT NULL,
  "kind"        "ConsumptionKind" NOT NULL,
  "entryDate"   TIMESTAMP(3) NOT NULL,
  "note"        TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumptionEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ConsumptionEntry_companyId_projectId_entryDate_idx"
  ON "ConsumptionEntry"("companyId", "projectId", "entryDate");

CREATE INDEX IF NOT EXISTS "ConsumptionEntry_companyId_projectId_stockKey_idx"
  ON "ConsumptionEntry"("companyId", "projectId", "stockKey");

ALTER TABLE "ConsumptionEntry"
  ADD CONSTRAINT "ConsumptionEntry_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
