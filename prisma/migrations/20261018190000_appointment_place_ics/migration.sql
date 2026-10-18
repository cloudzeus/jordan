-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "icsSequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "place" TEXT NOT NULL DEFAULT 'atelier';

