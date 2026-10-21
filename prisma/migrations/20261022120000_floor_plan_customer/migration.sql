-- Χαρτογράφηση κάτοψης και για πελάτη (προσφορά πριν από το έργο)
ALTER TABLE "FloorPlan" ALTER COLUMN "prjc" DROP NOT NULL;
ALTER TABLE "FloorPlan" ADD COLUMN "trdr" INTEGER;
CREATE INDEX "FloorPlan_trdr_updatedAt_idx" ON "FloorPlan"("trdr", "updatedAt");
