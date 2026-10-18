-- Τοποθεσία έργου (εργοτάξιο): διεύθυνση + ακριβείς συντεταγμένες.
CREATE TABLE "ProjectSite" (
    "id" TEXT NOT NULL,
    "prjc" INTEGER NOT NULL,
    "address" TEXT,
    "zip" TEXT,
    "district" TEXT,
    "city" TEXT,
    "formatted" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'geocode',
    "precision" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectSite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProjectSite_prjc_key" ON "ProjectSite"("prjc");
