
-- AlterTable
ALTER TABLE "SoftoneMirrorState" ADD COLUMN     "everyMin" INTEGER,
ADD COLUMN     "progress" JSONB,
ADD COLUMN     "watermarkIns" TEXT;

-- AlterTable
ALTER TABLE "SoftoneMyData" ADD COLUMN     "data" JSONB,
ADD COLUMN     "insRaw" TEXT,
ALTER COLUMN "soid" DROP NOT NULL,
ALTER COLUMN "sosource" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SoftoneRecord" (
    "table" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "parent" INTEGER,
    "updRaw" TEXT,
    "insRaw" TEXT,
    "data" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoftoneRecord_pkey" PRIMARY KEY ("table","id")
);

-- CreateIndex
CREATE INDEX "SoftoneRecord_table_parent_idx" ON "SoftoneRecord"("table", "parent");

