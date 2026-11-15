-- Σύνθετες συνταγές: στάδια (parent→child αναφορά) με σειρά 1..6.
-- Η υποσυνταγή είναι ΑΝΑΦΟΡΑ σε άλλη (απλή) συνταγή· ON DELETE RESTRICT εμποδίζει τη διαγραφή
-- συνταγής που χρησιμοποιείται ως στάδιο.

-- CreateTable
CREATE TABLE IF NOT EXISTS "InstallRecipeComponent" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "InstallRecipeComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "InstallRecipeComponent_parentId_childId_key" ON "InstallRecipeComponent"("parentId", "childId");
CREATE INDEX IF NOT EXISTS "InstallRecipeComponent_parentId_sortOrder_idx" ON "InstallRecipeComponent"("parentId", "sortOrder");
CREATE INDEX IF NOT EXISTS "InstallRecipeComponent_childId_idx" ON "InstallRecipeComponent"("childId");

-- AddForeignKey (idempotent)
DO $$ BEGIN
    ALTER TABLE "InstallRecipeComponent" ADD CONSTRAINT "InstallRecipeComponent_parentId_fkey"
        FOREIGN KEY ("parentId") REFERENCES "InstallRecipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "InstallRecipeComponent" ADD CONSTRAINT "InstallRecipeComponent_childId_fkey"
        FOREIGN KEY ("childId") REFERENCES "InstallRecipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
