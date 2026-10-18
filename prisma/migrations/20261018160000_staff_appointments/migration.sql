-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "customerContactId" TEXT,
ADD COLUMN     "partnerContactId" TEXT,
ADD COLUMN     "partnerId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'website',
ADD COLUMN     "trdr" INTEGER,
ALTER COLUMN "leadId" DROP NOT NULL,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Appointment_trdr_idx" ON "Appointment"("trdr");

