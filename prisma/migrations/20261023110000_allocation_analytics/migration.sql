-- IF NOT EXISTS: στο jordan οι στήλες prjc/prjcStage υπήρχαν ήδη (έργο ανά κομμάτι) — μόνο το costCntr είναι νέο.
-- Αναλυτικά ανά κομμάτι επιμερισμού (μοίρασμα σε κέντρα κόστους με τον ίδιο λογαριασμό).
-- Μόνο νέες, κενές στήλες — καμία αλλαγή σε υπάρχοντα δεδομένα.
ALTER TABLE "OcrInvoiceItemAllocation" ADD COLUMN IF NOT EXISTS "costCntr" INTEGER;
ALTER TABLE "OcrInvoiceItemAllocation" ADD COLUMN IF NOT EXISTS "prjc" INTEGER;
ALTER TABLE "OcrInvoiceItemAllocation" ADD COLUMN IF NOT EXISTS "prjcStage" INTEGER;
