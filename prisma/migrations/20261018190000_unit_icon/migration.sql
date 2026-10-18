-- AlterTable
ALTER TABLE "SoftoneUnit" ADD COLUMN     "iconMediaId" TEXT;

-- CreateIndex
CREATE INDEX "SoftoneUnit_iconMediaId_idx" ON "SoftoneUnit"("iconMediaId");

-- AddForeignKey
ALTER TABLE "SoftoneUnit" ADD CONSTRAINT "SoftoneUnit_iconMediaId_fkey" FOREIGN KEY ("iconMediaId") REFERENCES "MediaFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
