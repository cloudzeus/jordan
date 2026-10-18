-- AlterTable
ALTER TABLE "User" ADD COLUMN     "softoneUserId" INTEGER,
ADD COLUMN     "softoneUserName" TEXT;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "softoneAction" INTEGER,
ADD COLUMN     "softoneActionCode" TEXT,
ADD COLUMN     "softoneError" TEXT,
ADD COLUMN     "softoneSync" TEXT;

-- CreateIndex
CREATE INDEX "Appointment_assignedToId_idx" ON "Appointment"("assignedToId");

