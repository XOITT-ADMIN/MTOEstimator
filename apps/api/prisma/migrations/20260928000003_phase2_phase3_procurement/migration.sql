-- Phase 2 & 3: procurement columns on EstimateLine, StockMovement ledger, Dispatch model.
-- Safe to run on the live Neon database: every new column has a default or is nullable.

-- EstimateLine: track issued and purchased quantities per line
ALTER TABLE "EstimateLine"
  ADD COLUMN IF NOT EXISTS "issuedQty"    DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "purchasedQty" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- MovementType enum
DO $$ BEGIN
  CREATE TYPE "MovementType" AS ENUM ('RECEIPT', 'ISSUE', 'RETURN', 'ADJUST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- StockMovement ledger
CREATE TABLE IF NOT EXISTS "StockMovement" (
  "id"          TEXT         NOT NULL,
  "companyId"   TEXT         NOT NULL,
  "stockLineId" TEXT         NOT NULL,
  "type"        "MovementType" NOT NULL,
  "qty"         DECIMAL(14,2) NOT NULL,
  "estimateId"  TEXT,
  "projectId"   TEXT,
  "reason"      TEXT,
  "createdById" TEXT         NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StockMovement_companyId_stockLineId_createdAt_idx"
  ON "StockMovement"("companyId", "stockLineId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockMovement_companyId_estimateId_idx"
  ON "StockMovement"("companyId", "estimateId");
ALTER TABLE "StockMovement"
  DROP CONSTRAINT IF EXISTS "StockMovement_companyId_fkey",
  ADD CONSTRAINT "StockMovement_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- Dispatch table (Phase 4 fills it; we create it now so schema is coherent)
CREATE TABLE IF NOT EXISTS "Dispatch" (
  "id"           TEXT         NOT NULL,
  "companyId"    TEXT         NOT NULL,
  "estimateId"   TEXT         NOT NULL,
  "loadingCheck" BOOLEAN      NOT NULL DEFAULT false,
  "loadingCost"  DECIMAL(14,2) NOT NULL DEFAULT 0,
  "vehicle"      TEXT,
  "driver"       TEXT,
  "notes"        TEXT,
  "dispatchedAt" TIMESTAMP(3),
  "deliveredAt"  TIMESTAMP(3),
  "createdById"  TEXT         NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Dispatch_companyId_estimateId_idx"
  ON "Dispatch"("companyId", "estimateId");
ALTER TABLE "Dispatch"
  DROP CONSTRAINT IF EXISTS "Dispatch_companyId_estimateId_fkey",
  ADD CONSTRAINT "Dispatch_companyId_estimateId_fkey"
    FOREIGN KEY ("companyId", "estimateId") REFERENCES "Estimate"("companyId", "id") ON DELETE CASCADE;
