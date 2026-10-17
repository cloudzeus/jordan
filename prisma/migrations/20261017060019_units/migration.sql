-- CreateTable
CREATE TABLE "SoftoneUnit" (
    "id" SERIAL NOT NULL,
    "code" INTEGER NOT NULL,
    "shortcut" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "interCode" TEXT,
    "decimals" INTEGER NOT NULL DEFAULT 2,
    "sodim" INTEGER NOT NULL DEFAULT 1,
    "sodiv" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "myDataCode" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoftoneUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SoftoneUnit_code_key" ON "SoftoneUnit"("code");
