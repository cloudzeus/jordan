-- Δυναμικές προσφορές με ΠΟΛΛΑ προϊόντα και έως 8 κλιμάκια (PRICEW01…08).
-- Διατηρεί τα δεδομένα: κάθε υπάρχουσα προσφορά γίνεται προσφορά ενός προϊόντος, οι τιμές των
-- κλιμακίων μεταφέρονται στο προϊόν και κάθε κράτηση δένεται με αυτό.

-- 1. Νέος πίνακας προϊόντων
CREATE TABLE "ContainerOfferItem" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "mtrl" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUnit" TEXT,
    "sqmPerPallet" DOUBLE PRECISION NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "prices" DOUBLE PRECISION[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContainerOfferItem_pkey" PRIMARY KEY ("id")
);

-- 2. Χωρητικότητα σε παλέτες (από τ.μ. container ÷ τ.μ. παλέτας, προς τα κάτω ανά ½)
ALTER TABLE "ContainerOffer" ADD COLUMN "capacityPallets" DOUBLE PRECISION;
UPDATE "ContainerOffer"
   SET "capacityPallets" = CASE WHEN "sqmPerPallet" > 0
     THEN floor(("sqmPerContainer" / "sqmPerPallet") / 0.5 + 1e-9) * 0.5 ELSE 0 END;
ALTER TABLE "ContainerOffer" ALTER COLUMN "capacityPallets" SET NOT NULL;

-- 3. Ένα προϊόν ανά υπάρχουσα προσφορά, με τις τιμές των κλιμακίων με τη σειρά τους
INSERT INTO "ContainerOfferItem" ("id", "offerId", "mtrl", "code", "name", "baseUnit", "sqmPerPallet", "order", "prices", "createdAt")
SELECT 'coi_' || o."id", o."id", o."mtrl", o."code", o."name", o."baseUnit", o."sqmPerPallet", 0,
       COALESCE((SELECT array_agg(t."price" ORDER BY t."level") FROM "ContainerOfferTier" t WHERE t."offerId" = o."id"), ARRAY[]::DOUBLE PRECISION[]),
       o."createdAt"
  FROM "ContainerOffer" o;

-- 4. Κάθε κράτηση → το (μοναδικό) προϊόν της προσφοράς της
ALTER TABLE "ContainerReservation" ADD COLUMN "offerItemId" TEXT;
UPDATE "ContainerReservation" SET "offerItemId" = 'coi_' || "offerId";
ALTER TABLE "ContainerReservation" ALTER COLUMN "offerItemId" SET NOT NULL;

-- 5. Τα πεδία ενός προϊόντος φεύγουν από την προσφορά / την τιμή από το κλιμάκιο
DROP INDEX "ContainerOffer_mtrl_idx";
ALTER TABLE "ContainerOffer" DROP COLUMN "baseUnit",
DROP COLUMN "code",
DROP COLUMN "mtrl",
DROP COLUMN "name",
DROP COLUMN "sqmPerContainer",
DROP COLUMN "sqmPerPallet";
ALTER TABLE "ContainerOfferTier" DROP COLUMN "price";

-- 6. Ευρετήρια και σχέσεις
CREATE INDEX "ContainerOfferItem_mtrl_idx" ON "ContainerOfferItem"("mtrl");
CREATE UNIQUE INDEX "ContainerOfferItem_offerId_mtrl_key" ON "ContainerOfferItem"("offerId", "mtrl");
CREATE INDEX "ContainerReservation_offerItemId_idx" ON "ContainerReservation"("offerItemId");
ALTER TABLE "ContainerOfferItem" ADD CONSTRAINT "ContainerOfferItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ContainerOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContainerReservation" ADD CONSTRAINT "ContainerReservation_offerItemId_fkey" FOREIGN KEY ("offerItemId") REFERENCES "ContainerOfferItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
