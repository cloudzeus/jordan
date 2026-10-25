-- Δυνητικοί πελάτες (μόνο στην εφαρμογή μέχρι την αποδοχή της προσφοράς)
-- AlterTable
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "prospectId" INTEGER;

-- AlterTable
ALTER TABLE "FloorPlan" ADD COLUMN IF NOT EXISTS "prospectId" INTEGER;

-- CreateTable
CREATE TABLE "Prospect" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "afm" TEXT,
    "doy" TEXT,
    "profession" TEXT,
    "address" TEXT,
    "zip" TEXT,
    "city" TEXT,
    "notes" TEXT,
    "leadId" TEXT,
    "trdr" INTEGER,
    "convertedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Prospect_name_idx" ON "Prospect"("name");

-- CreateIndex
CREATE INDEX "Prospect_trdr_idx" ON "Prospect"("trdr");

-- CreateIndex
CREATE INDEX "Contract_prospectId_idx" ON "Contract"("prospectId");

-- CreateIndex
CREATE INDEX "FloorPlan_prospectId_updatedAt_idx" ON "FloorPlan"("prospectId", "updatedAt");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE;
