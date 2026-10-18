-- Οδηγίες εγκατάστασης: «Αρχεία» είδους (DOCUMENT), δείγματα εγκατάστασης, ηχογραφήσεις, οδηγοί.
ALTER TYPE "ItemMediaKind" ADD VALUE 'DOCUMENT';

ALTER TABLE "ItemMedia" ADD COLUMN "isInstallSample" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sampleFrames" JSONB;

CREATE TABLE "ItemInstallNote" (
    "id" TEXT NOT NULL,
    "mtrl" INTEGER NOT NULL,
    "audioKey" TEXT,
    "audioUrl" TEXT,
    "durationSec" DOUBLE PRECISION,
    "transcript" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ItemInstallNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ItemInstallNote_mtrl_order_idx" ON "ItemInstallNote"("mtrl", "order");

CREATE TABLE "ItemInstallGuide" (
    "id" TEXT NOT NULL,
    "mtrl" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "profile" TEXT NOT NULL,
    "category" TEXT,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "pdfMediaId" TEXT,
    "pdfUrl" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ItemInstallGuide_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ItemInstallGuide_mtrl_createdAt_idx" ON "ItemInstallGuide"("mtrl", "createdAt");
