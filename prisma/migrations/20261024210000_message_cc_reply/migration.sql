-- Επικοινωνία: κοινοποίηση (Cc), μορφοποιημένο κείμενο και μυστικός κωδικός απάντησης. Μόνο προσθήκη.
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "cc" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "bodyHtml" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "replyCode" TEXT;
-- Οι υπάρχουσες εγγραφές παίρνουν κι αυτές κωδικό (8 χαρακτήρες, κεφαλαία/ψηφία).
UPDATE "Message" SET "replyCode" = upper(substr(md5(random()::text || id), 1, 8)) WHERE "replyCode" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Message_replyCode_key" ON "Message"("replyCode");
