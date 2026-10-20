-- Χώροι έργου με τελικό δάπεδο (πλακάκι / πέτρα / τσιμεντοκονία) — από τη διαστασιολόγηση κάτοψης.
CREATE TABLE "ProjectRoom" (
    "id" TEXT NOT NULL,
    "prjc" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "areaM2" DOUBLE PRECISION NOT NULL,
    "perimeterM" DOUBLE PRECISION,
    "finish" TEXT,
    "mtrl" INTEGER,
    "itemCode" TEXT,
    "itemName" TEXT,
    "itemUnit" TEXT,
    "wastePct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "skirting" BOOLEAN NOT NULL DEFAULT false,
    "pattern" TEXT,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectRoom_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProjectRoom_prjc_idx" ON "ProjectRoom"("prjc");
