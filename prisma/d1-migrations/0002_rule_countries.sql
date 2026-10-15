-- Countries a rule applies to: ISO 3166-1 alpha-2 codes, comma-separated
-- and sorted ("DE,FR"). Empty = all countries, so existing rules keep
-- applying everywhere.

-- AlterTable
ALTER TABLE "DeliveryRule" ADD COLUMN "countries" TEXT NOT NULL DEFAULT '';
