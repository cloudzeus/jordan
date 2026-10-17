-- AlterTable
ALTER TABLE "ContainerReservation" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedById" TEXT,
ADD COLUMN     "decisionNote" TEXT,
ADD COLUMN     "partnerId" TEXT,
ALTER COLUMN "trdr" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ContainerReservation_partnerId_idx" ON "ContainerReservation"("partnerId");

