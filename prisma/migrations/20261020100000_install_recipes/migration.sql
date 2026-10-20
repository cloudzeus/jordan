-- CreateEnum
CREATE TYPE "RecipeMaterialKind" AS ENUM ('TILE', 'STONE', 'CEMENT_MORTAR');

-- CreateTable
CREATE TABLE "InstallRecipe" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "RecipeMaterialKind" NOT NULL,
    "description" TEXT,
    "mtrl" INTEGER,
    "mtrlCode" TEXT,
    "mtrlName" TEXT,
    "mtrlUnit" TEXT,
    "materialPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wastePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborCostPerSqm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "copiedFromId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallRecipeLine" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "mtrl" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "qtyPerSqm" DOUBLE PRECISION NOT NULL,
    "wastePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InstallRecipeLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InstallRecipe_kind_name_idx" ON "InstallRecipe"("kind", "name");

-- CreateIndex
CREATE INDEX "InstallRecipe_mtrl_idx" ON "InstallRecipe"("mtrl");

-- CreateIndex
CREATE INDEX "InstallRecipeLine_recipeId_sortOrder_idx" ON "InstallRecipeLine"("recipeId", "sortOrder");

-- AddForeignKey
ALTER TABLE "InstallRecipeLine" ADD CONSTRAINT "InstallRecipeLine_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "InstallRecipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
