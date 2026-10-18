-- CreateTable
CREATE TABLE "EntityFolder" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "basePath" TEXT NOT NULL,
    "subfolders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityFile" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "subfolder" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "ext" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "notes" TEXT,
    "uploadedById" TEXT,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EntityFolder_basePath_key" ON "EntityFolder"("basePath");

-- CreateIndex
CREATE UNIQUE INDEX "EntityFolder_entityType_entityId_key" ON "EntityFolder"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityFile_storageKey_key" ON "EntityFile"("storageKey");

-- CreateIndex
CREATE INDEX "EntityFile_folderId_subfolder_idx" ON "EntityFile"("folderId", "subfolder");

-- AddForeignKey
ALTER TABLE "EntityFile" ADD CONSTRAINT "EntityFile_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "EntityFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

