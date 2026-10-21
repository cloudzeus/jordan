-- Χαρτογράφηση κάτοψης έργου + σύνδεση προσφοράς/σύμβασης με αυτή
CREATE TABLE "FloorPlan" (
    "id" TEXT NOT NULL,
    "prjc" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT,
    "data" JSONB NOT NULL,
    "floorM2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wallsM2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "roomCount" INTEGER NOT NULL DEFAULT 0,
    "imageFileId" TEXT,
    "annotatedFileId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FloorPlan_prjc_updatedAt_idx" ON "FloorPlan"("prjc", "updatedAt");

ALTER TABLE "Contract" ADD COLUMN "floorPlanId" TEXT;
CREATE INDEX "Contract_floorPlanId_idx" ON "Contract"("floorPlanId");
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "FloorPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
