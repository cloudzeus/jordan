-- Συνεργεία στο portal: ο χρήστης δένεται με προμηθευτή SoftOne (TRDR).
ALTER TABLE "User" ADD COLUMN "supplierTrdr" INTEGER;
CREATE INDEX "User_supplierTrdr_idx" ON "User"("supplierTrdr");
