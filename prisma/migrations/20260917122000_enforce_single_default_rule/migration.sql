ALTER TABLE "DeliveryRule" ADD COLUMN "defaultShopKey" TEXT;

UPDATE "DeliveryRule"
SET "defaultShopKey" = "shop"
WHERE "type" = 'DEFAULT';

CREATE UNIQUE INDEX "DeliveryRule_defaultShopKey_key"
ON "DeliveryRule"("defaultShopKey");
