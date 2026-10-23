-- Κείμενο για τον πελάτη + σύνδεση γραμμής με χώρο κάτοψης
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "customerText" TEXT;
ALTER TABLE "ContractLine" ADD COLUMN IF NOT EXISTS "roomId" TEXT;
