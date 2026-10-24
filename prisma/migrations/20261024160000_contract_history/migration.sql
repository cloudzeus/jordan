-- Ερωτήσεις / αιτήματα αλλαγής πελάτη σε νήμα, με την έκδοση προσφοράς, και ιστορικό συμβάντων προσφοράς.
ALTER TABLE "ContractNote" ADD COLUMN IF NOT EXISTS "replyToId" TEXT;
ALTER TABLE "ContractNote" ADD COLUMN IF NOT EXISTS "revision" INTEGER;
CREATE INDEX IF NOT EXISTS "ContractNote_replyToId_idx" ON "ContractNote"("replyToId");

CREATE TABLE IF NOT EXISTS "ContractEvent" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "summary" TEXT NOT NULL,
    "customer" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContractEvent_contractId_createdAt_idx" ON "ContractEvent"("contractId", "createdAt");
ALTER TABLE "ContractEvent" ADD CONSTRAINT "ContractEvent_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
