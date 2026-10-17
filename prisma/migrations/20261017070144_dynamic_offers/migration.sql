-- AlterEnum
ALTER TYPE "ContainerOfferStatus" ADD VALUE 'SCHEDULED';

-- AlterTable
ALTER TABLE "ContainerOffer" ADD COLUMN     "notifiedLevel" INTEGER,
ADD COLUMN     "publishAt" TIMESTAMP(3),
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "snapshotUrl" TEXT;

-- CreateTable
CREATE TABLE "OfferRecipient" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferEmail" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfferRecipient_offerId_idx" ON "OfferRecipient"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferRecipient_offerId_kind_refId_key" ON "OfferRecipient"("offerId", "kind", "refId");

-- CreateIndex
CREATE INDEX "OfferEmail_offerId_idx" ON "OfferEmail"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferEmail_recipientId_kind_level_key" ON "OfferEmail"("recipientId", "kind", "level");

-- AddForeignKey
ALTER TABLE "OfferRecipient" ADD CONSTRAINT "OfferRecipient_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ContainerOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferEmail" ADD CONSTRAINT "OfferEmail_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ContainerOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferEmail" ADD CONSTRAINT "OfferEmail_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "OfferRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
