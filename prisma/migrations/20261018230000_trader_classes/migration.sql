

-- CreateTable
CREATE TABLE "TraderClass" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "sodtype" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" INTEGER,
    "softoneField" TEXT NOT NULL,
    "softoneId" INTEGER,
    "kadPrefixes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TraderClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraderClassAssignment" (
    "id" SERIAL NOT NULL,
    "trdr" INTEGER NOT NULL,
    "sodtype" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "afm" TEXT,
    "afmKind" TEXT NOT NULL,
    "countryIso" TEXT,
    "aadeName" TEXT,
    "aadeCheckedAt" TIMESTAMP(3),
    "primaryKad" TEXT,
    "primaryKadDescr" TEXT,
    "activities" JSONB,
    "purchasesHint" JSONB,
    "leafId" INTEGER,
    "pathKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "basis" TEXT NOT NULL,
    "rule" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TraderClassAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TraderClass_sodtype_level_idx" ON "TraderClass"("sodtype", "level");

-- CreateIndex
CREATE INDEX "TraderClass_parentId_idx" ON "TraderClass"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "TraderClass_key_sodtype_key" ON "TraderClass"("key", "sodtype");

-- CreateIndex
CREATE UNIQUE INDEX "TraderClassAssignment_trdr_key" ON "TraderClassAssignment"("trdr");

-- CreateIndex
CREATE INDEX "TraderClassAssignment_sodtype_idx" ON "TraderClassAssignment"("sodtype");

-- CreateIndex
CREATE INDEX "TraderClassAssignment_leafId_idx" ON "TraderClassAssignment"("leafId");

-- CreateIndex
CREATE INDEX "TraderClassAssignment_needsReview_idx" ON "TraderClassAssignment"("needsReview");

-- AddForeignKey
ALTER TABLE "TraderClass" ADD CONSTRAINT "TraderClass_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TraderClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraderClassAssignment" ADD CONSTRAINT "TraderClassAssignment_leafId_fkey" FOREIGN KEY ("leafId") REFERENCES "TraderClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

