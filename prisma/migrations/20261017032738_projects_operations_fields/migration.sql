-- AlterTable
ALTER TABLE "SoftoneProject" ADD COLUMN     "actStatus" INTEGER,
ADD COLUMN     "closeDate" TIMESTAMP(3),
ADD COLUMN     "crdDate" TIMESTAMP(3),
ADD COLUMN     "finalDate" TIMESTAMP(3),
ADD COLUMN     "fromDate" TIMESTAMP(3),
ADD COLUMN     "remarks" TEXT,
ADD COLUMN     "trdrSu" INTEGER;

-- CreateIndex
CREATE INDEX "SoftoneProject_actStatus_idx" ON "SoftoneProject"("actStatus");
