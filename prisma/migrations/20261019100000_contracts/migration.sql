-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'OFFER',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "trdr" INTEGER,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "prjc" INTEGER,
    "siteAddress" TEXT,
    "siteZip" TEXT,
    "siteDistrict" TEXT,
    "siteCity" TEXT,
    "siteFormatted" TEXT,
    "siteLat" DOUBLE PRECISION,
    "siteLng" DOUBLE PRECISION,
    "siteSource" TEXT,
    "sitePrecision" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "validUntil" DATE,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 24,
    "terms" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractLine" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mtrl" INTEGER,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "partyId" TEXT,
    "crewFee" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ContractLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractParty" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "trdr" INTEGER,
    "partnerId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "afm" TEXT,
    "specialty" TEXT,
    "scope" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ContractParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractMember" (
    "contractId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ContractMember_pkey" PRIMARY KEY ("contractId","userId")
);

-- CreateTable
CREATE TABLE "ContractMilestone" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "partyId" TEXT,
    "title" TEXT NOT NULL,
    "deliverables" TEXT,
    "dueDate" DATE,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "taskId" TEXT,
    "doneAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ContractMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractDocument" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "partyId" TEXT,
    "stage" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" JSONB NOT NULL,
    "model" TEXT,
    "fileId" TEXT,
    "fileName" TEXT,
    "sends" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contract_number_key" ON "Contract"("number");

-- CreateIndex
CREATE INDEX "Contract_prjc_idx" ON "Contract"("prjc");

-- CreateIndex
CREATE INDEX "Contract_trdr_idx" ON "Contract"("trdr");

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- CreateIndex
CREATE INDEX "ContractLine_contractId_sortOrder_idx" ON "ContractLine"("contractId", "sortOrder");

-- CreateIndex
CREATE INDEX "ContractParty_contractId_idx" ON "ContractParty"("contractId");

-- CreateIndex
CREATE INDEX "ContractMember_userId_idx" ON "ContractMember"("userId");

-- CreateIndex
CREATE INDEX "ContractMilestone_contractId_sortOrder_idx" ON "ContractMilestone"("contractId", "sortOrder");

-- CreateIndex
CREATE INDEX "ContractDocument_contractId_audience_partyId_idx" ON "ContractDocument"("contractId", "audience", "partyId");

-- AddForeignKey
ALTER TABLE "ContractLine" ADD CONSTRAINT "ContractLine_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractLine" ADD CONSTRAINT "ContractLine_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "ContractParty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractParty" ADD CONSTRAINT "ContractParty_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractMember" ADD CONSTRAINT "ContractMember_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractMilestone" ADD CONSTRAINT "ContractMilestone_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractMilestone" ADD CONSTRAINT "ContractMilestone_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "ContractParty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "ContractParty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

