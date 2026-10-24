-- Εκδόσεις προσφοράς + απόδειξη παράδοσης milestone
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ContractDocument" ADD COLUMN IF NOT EXISTS "revision" INTEGER;
ALTER TABLE "ContractMilestone" ADD COLUMN IF NOT EXISTS "deliveryNote" TEXT;
ALTER TABLE "ContractMilestone" ADD COLUMN IF NOT EXISTS "deliveredById" TEXT;
ALTER TABLE "ContractMilestone" ADD COLUMN IF NOT EXISTS "proofFileIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS "ContractRevision" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "snapshot" JSONB NOT NULL,
    "net" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lineCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractRevision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ContractRevision_contractId_revision_key" ON "ContractRevision"("contractId", "revision");
DO $$ BEGIN
  ALTER TABLE "ContractRevision" ADD CONSTRAINT "ContractRevision_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
