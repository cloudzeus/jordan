-- CreateEnum
CREATE TYPE "ContainerOfferStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ContainerOffer" (
    "id" TEXT NOT NULL,
    "mtrl" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "status" "ContainerOfferStatus" NOT NULL DEFAULT 'DRAFT',
    "sqmPerContainer" DOUBLE PRECISION NOT NULL,
    "sqmPerPallet" DOUBLE PRECISION NOT NULL,
    "minOrder" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "baseUnit" TEXT,
    "closesAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContainerOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerOfferTier" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "fromPallets" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ContainerOfferTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerReservation" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "trdr" INTEGER NOT NULL,
    "pallets" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContainerReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContainerOffer_mtrl_idx" ON "ContainerOffer"("mtrl");

-- CreateIndex
CREATE INDEX "ContainerOffer_status_idx" ON "ContainerOffer"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ContainerOfferTier_offerId_level_key" ON "ContainerOfferTier"("offerId", "level");

-- CreateIndex
CREATE INDEX "ContainerReservation_offerId_idx" ON "ContainerReservation"("offerId");

-- CreateIndex
CREATE INDEX "ContainerReservation_trdr_idx" ON "ContainerReservation"("trdr");

-- AddForeignKey
ALTER TABLE "ContainerOfferTier" ADD CONSTRAINT "ContainerOfferTier_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ContainerOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerReservation" ADD CONSTRAINT "ContainerReservation_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ContainerOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
