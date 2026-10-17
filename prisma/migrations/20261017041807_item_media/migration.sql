-- CreateEnum
CREATE TYPE "ItemMediaKind" AS ENUM ('IMAGE', 'VIDEO', 'PANORAMA');

-- CreateTable
CREATE TABLE "ItemMedia" (
    "id" TEXT NOT NULL,
    "mtrl" INTEGER NOT NULL,
    "kind" "ItemMediaKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "thumbKey" TEXT,
    "thumbUrl" TEXT,
    "originalKey" TEXT,
    "originalUrl" TEXT,
    "originalWidth" INTEGER,
    "originalHeight" INTEGER,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "transform" JSONB,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemMedia_storageKey_key" ON "ItemMedia"("storageKey");

-- CreateIndex
CREATE INDEX "ItemMedia_mtrl_kind_order_idx" ON "ItemMedia"("mtrl", "kind", "order");
