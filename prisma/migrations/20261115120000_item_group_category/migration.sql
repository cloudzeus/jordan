-- Σύνδεση ομάδας ειδών/υπηρεσιών με εμπορική κατηγορία (τοπικό — προεπιλογή σε νέα είδη, ΔΕΝ γράφεται στο SoftOne)
ALTER TABLE "ItemGroup" ADD COLUMN IF NOT EXISTS "categoryCode" INTEGER;
