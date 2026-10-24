-- Γραμμές προϋπολογισμού έργου που ήρθαν από BOM προσφοράς/σύμβασης.
ALTER TABLE "ProjectBudgetLine" ADD COLUMN IF NOT EXISTS "sourceContractId" TEXT;
CREATE INDEX IF NOT EXISTS "ProjectBudgetLine_sourceContractId_idx" ON "ProjectBudgetLine"("sourceContractId");
