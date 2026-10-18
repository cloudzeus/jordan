-- AlterTable
ALTER TABLE "SoftoneMirrorState" ADD COLUMN     "lastChanged" INTEGER,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lastMs" INTEGER,
ADD COLUMN     "lastOkAt" TIMESTAMP(3),
ADD COLUMN     "lastRunAt" TIMESTAMP(3),
ADD COLUMN     "reconciledAt" TIMESTAMP(3),
ADD COLUMN     "watermark" TEXT;

-- AlterTable
ALTER TABLE "SoftoneTrader" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "SoftoneSyncLease" (
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SoftoneSyncLease_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "SoftoneFindoc" (
    "findoc" INTEGER NOT NULL,
    "fincode" TEXT NOT NULL,
    "trnDate" TIMESTAMP(3),
    "series" TEXT NOT NULL,
    "sosource" INTEGER NOT NULL,
    "trdr" INTEGER,
    "prjc" INTEGER,
    "net" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "disc1Prc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "disc1Val" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isCancel" INTEGER NOT NULL DEFAULT 0,
    "comments" TEXT,
    "comments1" TEXT,
    "remarks" TEXT,
    "insDate" TIMESTAMP(3),
    "updRaw" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoftoneFindoc_pkey" PRIMARY KEY ("findoc")
);

-- CreateTable
CREATE TABLE "SoftoneMtrLine" (
    "findoc" INTEGER NOT NULL,
    "mtrlines" INTEGER NOT NULL,
    "lineNum" INTEGER,
    "mtrl" INTEGER,
    "qty1" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mtrUnit" TEXT,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "disc1Prc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "disc2Prc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "disc1Val" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lineVal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netLineVal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vat" TEXT,
    "vatAmnt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "comments" TEXT,
    "comments1" TEXT,
    "prjc" INTEGER,
    "sodtype" INTEGER,
    "findocs" INTEGER,

    CONSTRAINT "SoftoneMtrLine_pkey" PRIMARY KEY ("findoc","mtrlines")
);

-- CreateTable
CREATE TABLE "SoftoneTrdLine" (
    "findoc" INTEGER NOT NULL,
    "trdtlines" INTEGER NOT NULL,
    "trdr" INTEGER,
    "lineNum" INTEGER,
    "lineVal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prjc" INTEGER,

    CONSTRAINT "SoftoneTrdLine_pkey" PRIMARY KEY ("findoc","trdtlines")
);

-- CreateTable
CREATE TABLE "SoftoneMyData" (
    "id" INTEGER NOT NULL,
    "soid" INTEGER NOT NULL,
    "sosource" INTEGER NOT NULL,
    "mark" TEXT,
    "qrUrl" TEXT,
    "invoiceUrl" TEXT,
    "isCancel" INTEGER NOT NULL DEFAULT 0,
    "updRaw" TEXT,

    CONSTRAINT "SoftoneMyData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftoneTrdBalance" (
    "id" SERIAL NOT NULL,
    "trdr" INTEGER NOT NULL,
    "fiscPrd" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "SoftoneTrdBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SoftoneFindoc_trdr_idx" ON "SoftoneFindoc"("trdr");

-- CreateIndex
CREATE INDEX "SoftoneFindoc_prjc_idx" ON "SoftoneFindoc"("prjc");

-- CreateIndex
CREATE INDEX "SoftoneFindoc_sosource_trnDate_idx" ON "SoftoneFindoc"("sosource", "trnDate");

-- CreateIndex
CREATE INDEX "SoftoneMtrLine_mtrl_idx" ON "SoftoneMtrLine"("mtrl");

-- CreateIndex
CREATE INDEX "SoftoneMtrLine_prjc_idx" ON "SoftoneMtrLine"("prjc");

-- CreateIndex
CREATE INDEX "SoftoneMtrLine_findocs_idx" ON "SoftoneMtrLine"("findocs");

-- CreateIndex
CREATE INDEX "SoftoneTrdLine_trdr_idx" ON "SoftoneTrdLine"("trdr");

-- CreateIndex
CREATE INDEX "SoftoneMyData_soid_idx" ON "SoftoneMyData"("soid");

-- CreateIndex
CREATE INDEX "SoftoneTrdBalance_trdr_idx" ON "SoftoneTrdBalance"("trdr");

