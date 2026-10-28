-- Κωδικός ιεραρχίας (SOHCODE) στις κατηγορίες/ομάδες ειδών
ALTER TABLE "SoftoneClassification" ADD COLUMN IF NOT EXISTS "sohCode" TEXT;
