-- Εναλλακτικές επιλογές υλικών (A/B) ανά χώρο ή εργασία
-- AlterTable
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "optionChoices" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "ContractLine" ADD COLUMN IF NOT EXISTS "inactive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "option" TEXT,
ADD COLUMN IF NOT EXISTS "optionGroup" TEXT;
