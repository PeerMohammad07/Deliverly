-- The order cutoff moves back from the store-wide setting to each rule.
ALTER TABLE "DeliveryRule" ADD COLUMN "cutoffMinutes" INTEGER;

-- Keep any store-wide cutoff already saved by copying it onto that
-- store's rules.
UPDATE "DeliveryRule" AS r
SET "cutoffMinutes" = s."cutoffMinutes"
FROM "ShopSettings" AS s
WHERE r."shop" = s."shop";

DROP TABLE "ShopSettings";
