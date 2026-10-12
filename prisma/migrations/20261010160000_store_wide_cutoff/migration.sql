-- The order cutoff moved from each rule to one store-wide setting.
ALTER TABLE "DeliveryRule" DROP COLUMN "cutoffMinutes";

-- CreateTable
CREATE TABLE "ShopSettings" (
    "shop" TEXT NOT NULL,
    "cutoffMinutes" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("shop")
);
