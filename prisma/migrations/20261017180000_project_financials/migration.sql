-- Κερδοφορία έργων (στιγμιότυπο υπολογισμού) και ποσοστά γενικών εξόδων ανά περίοδο.
CREATE TABLE "ProjectFinancials" (
    "id" SERIAL NOT NULL,
    "prjc" INTEGER NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL,
    "collected" DOUBLE PRECISION NOT NULL,
    "openAmount" DOUBLE PRECISION NOT NULL,
    "costs" DOUBLE PRECISION NOT NULL,
    "overhead" DOUBLE PRECISION NOT NULL,
    "netProfit" DOUBLE PRECISION NOT NULL,
    "marginPct" DOUBLE PRECISION,
    "paid" DOUBLE PRECISION NOT NULL,
    "issues" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectFinancials_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProjectFinancials_prjc_key" ON "ProjectFinancials"("prjc");

CREATE TABLE "OverheadRate" (
    "id" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "percent" DOUBLE PRECISION NOT NULL,
    "category" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OverheadRate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OverheadRate_validFrom_idx" ON "OverheadRate"("validFrom");
CREATE INDEX "OverheadRate_category_idx" ON "OverheadRate"("category");
