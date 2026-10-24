-- Επικοινωνία από τη διαχείριση (έργο / πελάτης / προσφορά). Μόνο προσθήκη.
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "prjc" INTEGER,
    "trdr" INTEGER,
    "contractId" TEXT,
    "audience" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SEND',
    "toName" TEXT,
    "toEmail" TEXT,
    "partyRef" TEXT,
    "viaEmail" BOOLEAN NOT NULL DEFAULT false,
    "viaPortal" BOOLEAN NOT NULL DEFAULT false,
    "emailStatus" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachmentFileIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "authorId" TEXT,
    "authorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Message_prjc_createdAt_idx" ON "Message"("prjc", "createdAt");
CREATE INDEX "Message_trdr_createdAt_idx" ON "Message"("trdr", "createdAt");
CREATE INDEX "Message_contractId_idx" ON "Message"("contractId");
ALTER TABLE "Message" ADD CONSTRAINT "Message_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
