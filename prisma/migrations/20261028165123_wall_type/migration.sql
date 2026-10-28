-- CreateEnum
CREATE TYPE "WallTypeCategory" AS ENUM ('BEARING', 'MASONRY', 'DRYWALL', 'GLASS', 'INDICATIVE');

-- CreateEnum
CREATE TYPE "WallMeasureFaces" AS ENUM ('none', 'one', 'both');

-- CreateTable
CREATE TABLE "WallType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "WallTypeCategory" NOT NULL,
    "thicknessM" DOUBLE PRECISION NOT NULL,
    "bottomM" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "topM" DOUBLE PRECISION,
    "color" TEXT NOT NULL DEFAULT '#94a3b8',
    "pattern" TEXT,
    "coreRecipeId" TEXT,
    "faceRecipeId" TEXT,
    "lengthItemMtrl" INTEGER,
    "measureFaces" "WallMeasureFaces" NOT NULL DEFAULT 'both',
    "attenuationDb" DOUBLE PRECISION,
    "cadLayerHints" TEXT[],
    "hotkey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WallType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WallType_code_key" ON "WallType"("code");

-- CreateIndex
CREATE INDEX "WallType_active_sortOrder_idx" ON "WallType"("active", "sortOrder");
