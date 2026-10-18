


-- CreateTable
CREATE TABLE "SupplierProduct" (
    "id" SERIAL NOT NULL,
    "trdr" INTEGER NOT NULL,
    "mtrl" INTEGER NOT NULL,
    "docs" INTEGER NOT NULL DEFAULT 0,
    "invoiceQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "invoiceValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastCost" DOUBLE PRECISION,
    "firstDate" TIMESTAMP(3),
    "lastDate" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierProduct_trdr_invoiceValue_idx" ON "SupplierProduct"("trdr", "invoiceValue" DESC);

-- CreateIndex
CREATE INDEX "SupplierProduct_mtrl_idx" ON "SupplierProduct"("mtrl");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierProduct_trdr_mtrl_key" ON "SupplierProduct"("trdr", "mtrl");

-- CreateIndex
CREATE INDEX "TraderClass_sodtype_isActive_level_order_idx" ON "TraderClass"("sodtype", "isActive", "level", "order");


-- DropIndex (αντικαταστάθηκε από τον σύνθετο δείκτη sodtype, isActive, level, order)
DROP INDEX IF EXISTS "TraderClass_sodtype_level_idx";
