-- CreateTable
CREATE TABLE "SoftoneClassification" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "sodtype" INTEGER NOT NULL,
    "code" INTEGER NOT NULL,
    "shortCode" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoftoneClassification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SoftoneClassification_kind_sodtype_idx" ON "SoftoneClassification"("kind", "sodtype");

-- CreateIndex
CREATE UNIQUE INDEX "SoftoneClassification_kind_sodtype_code_key" ON "SoftoneClassification"("kind", "sodtype", "code");
