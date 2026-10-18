

-- CreateTable
CREATE TABLE "ItemGroup" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "sodtype" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "sohCode" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" INTEGER,
    "softoneId" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemGroupAssignment" (
    "id" SERIAL NOT NULL,
    "mtrl" INTEGER NOT NULL,
    "sodtype" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "groupId" INTEGER,
    "basis" TEXT NOT NULL,
    "rule" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "looksLikeService" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemGroupAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemGroup_sodtype_isActive_level_order_idx" ON "ItemGroup"("sodtype", "isActive", "level", "order");

-- CreateIndex
CREATE INDEX "ItemGroup_parentId_idx" ON "ItemGroup"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemGroup_key_sodtype_key" ON "ItemGroup"("key", "sodtype");

-- CreateIndex
CREATE UNIQUE INDEX "ItemGroupAssignment_mtrl_key" ON "ItemGroupAssignment"("mtrl");

-- CreateIndex
CREATE INDEX "ItemGroupAssignment_groupId_idx" ON "ItemGroupAssignment"("groupId");

-- CreateIndex
CREATE INDEX "ItemGroupAssignment_sodtype_status_idx" ON "ItemGroupAssignment"("sodtype", "status");

-- AddForeignKey
ALTER TABLE "ItemGroup" ADD CONSTRAINT "ItemGroup_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ItemGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemGroupAssignment" ADD CONSTRAINT "ItemGroupAssignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ItemGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

