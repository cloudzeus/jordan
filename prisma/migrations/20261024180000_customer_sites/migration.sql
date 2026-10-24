-- Τοποθεσίες πελάτη (πύλη) και αιτήματα αλλαγής εταιρικών στοιχείων. Μόνο προσθήκες.
CREATE TABLE "CustomerSite" (
    "id" TEXT NOT NULL,
    "trdr" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "address" TEXT,
    "zip" TEXT,
    "district" TEXT,
    "city" TEXT,
    "floor" TEXT,
    "notes" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerSite_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerSite_trdr_idx" ON "CustomerSite"("trdr");

CREATE TABLE "CustomerChangeRequest" (
    "id" TEXT NOT NULL,
    "trdr" INTEGER NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT,
    "changes" JSONB NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reply" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerChangeRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerChangeRequest_trdr_status_idx" ON "CustomerChangeRequest"("trdr", "status");
CREATE INDEX "CustomerChangeRequest_status_createdAt_idx" ON "CustomerChangeRequest"("status", "createdAt");

ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "customerSiteId" TEXT;
CREATE INDEX "Contract_customerSiteId_idx" ON "Contract"("customerSiteId");
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_customerSiteId_fkey" FOREIGN KEY ("customerSiteId") REFERENCES "CustomerSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
