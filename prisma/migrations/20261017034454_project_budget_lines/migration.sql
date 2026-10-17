-- CreateTable
CREATE TABLE "ProjectBudgetLine" (
    "id" TEXT NOT NULL,
    "prjc" INTEGER NOT NULL,
    "mtrl" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isService" BOOLEAN NOT NULL DEFAULT false,
    "unit" TEXT,
    "qty" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectBudgetLine_prjc_idx" ON "ProjectBudgetLine"("prjc");

-- CreateIndex
CREATE INDEX "ProjectBudgetLine_mtrl_idx" ON "ProjectBudgetLine"("mtrl");
