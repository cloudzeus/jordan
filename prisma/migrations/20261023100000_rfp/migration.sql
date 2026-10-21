-- Αιτήματα προσφοράς (RFP) προς συνεργεία: αίτημα, παραλήπτες με μοναδικό σύνδεσμο, ημερολόγιο συνεδρίας (απόδειξη)
-- CreateTable
CREATE TABLE "Rfp" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "contractId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '',
    "dueDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "specsFileId" TEXT,
    "specsFileName" TEXT,
    "specsSha256" TEXT,
    "awardedRecipientId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rfp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfpRecipient" (
    "id" TEXT NOT NULL,
    "rfpId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "trdr" INTEGER,
    "partnerId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "afm" TEXT,
    "specialty" TEXT,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "amount" DOUBLE PRECISION,
    "startDate" DATE,
    "durationDays" INTEGER,
    "notes" TEXT,
    "termsAccepted" BOOLEAN NOT NULL DEFAULT false,
    "viewedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "sends" JSONB NOT NULL DEFAULT '[]',
    "partyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RfpRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfpEvent" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "userId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "sessionId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "prevHash" TEXT,
    "hash" TEXT NOT NULL,

    CONSTRAINT "RfpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rfp_number_key" ON "Rfp"("number");

-- CreateIndex
CREATE INDEX "Rfp_contractId_idx" ON "Rfp"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "RfpRecipient_tokenHash_key" ON "RfpRecipient"("tokenHash");

-- CreateIndex
CREATE INDEX "RfpRecipient_rfpId_idx" ON "RfpRecipient"("rfpId");

-- CreateIndex
CREATE INDEX "RfpRecipient_trdr_idx" ON "RfpRecipient"("trdr");

-- CreateIndex
CREATE INDEX "RfpRecipient_partnerId_idx" ON "RfpRecipient"("partnerId");

-- CreateIndex
CREATE INDEX "RfpEvent_recipientId_at_idx" ON "RfpEvent"("recipientId", "at");

-- AddForeignKey
ALTER TABLE "Rfp" ADD CONSTRAINT "Rfp_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpRecipient" ADD CONSTRAINT "RfpRecipient_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "Rfp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpEvent" ADD CONSTRAINT "RfpEvent_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "RfpRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
