-- CreateTable
CREATE TABLE "OrderRequest" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "trdr" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "prjc" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "customerRef" TEXT,
    "deliveryAddress" TEXT,
    "deliveryDate" TIMESTAMP(3),
    "notes" TEXT,
    "staffNote" TEXT,
    "softoneFincode" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderRequestLine" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "mtrl" INTEGER NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "qty" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderRequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderRequest_number_key" ON "OrderRequest"("number");

-- CreateIndex
CREATE INDEX "OrderRequest_trdr_idx" ON "OrderRequest"("trdr");

-- CreateIndex
CREATE INDEX "OrderRequest_status_idx" ON "OrderRequest"("status");

-- CreateIndex
CREATE INDEX "OrderRequestLine_requestId_idx" ON "OrderRequestLine"("requestId");

-- AddForeignKey
ALTER TABLE "OrderRequestLine" ADD CONSTRAINT "OrderRequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OrderRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

