-- Χρονοδιάγραμμα προσφοράς (εργασίες πριν την αποδοχή) + σημειώσεις / ειδικές οδηγίες
CREATE TABLE IF NOT EXISTS "ContractTask" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationValue" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "durationUnit" TEXT NOT NULL DEFAULT 'DAYS',
    "startDate" DATE,
    "dependsOn" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "roomId" TEXT,
    "customerVisible" BOOLEAN NOT NULL DEFAULT true,
    "photoFileIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "projectTaskId" TEXT,
    CONSTRAINT "ContractTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContractTask_contractId_sortOrder_idx" ON "ContractTask"("contractId", "sortOrder");
DO $$ BEGIN
  ALTER TABLE "ContractTask" ADD CONSTRAINT "ContractTask_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ContractNote" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL DEFAULT 'CONTRACT',
    "targetId" TEXT,
    "targetLabel" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'NOTE',
    "body" TEXT NOT NULL,
    "shareWith" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "photoFileIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "taskId" TEXT,
    "authorKind" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContractNote_contractId_createdAt_idx" ON "ContractNote"("contractId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "ContractNote" ADD CONSTRAINT "ContractNote_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
