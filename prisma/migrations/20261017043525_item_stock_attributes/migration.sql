-- CreateTable
CREATE TABLE "SoftoneStock" (
    "mtrl" INTEGER NOT NULL,
    "whouse" TEXT NOT NULL,
    "fiscPrd" INTEGER NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoftoneStock_pkey" PRIMARY KEY ("mtrl","whouse")
);

-- CreateTable
CREATE TABLE "ItemAttribute" (
    "id" TEXT NOT NULL,
    "mtrl" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SoftoneStock_whouse_idx" ON "SoftoneStock"("whouse");

-- CreateIndex
CREATE INDEX "ItemAttribute_mtrl_order_idx" ON "ItemAttribute"("mtrl", "order");
