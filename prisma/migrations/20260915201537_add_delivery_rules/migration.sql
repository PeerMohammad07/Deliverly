-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('DEFAULT', 'PRODUCT', 'COLLECTION');

-- CreateEnum
CREATE TYPE "TargetType" AS ENUM ('PRODUCT', 'COLLECTION');

-- CreateTable
CREATE TABLE "DeliveryRule" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RuleType" NOT NULL,
    "minDeliveryDays" INTEGER NOT NULL,
    "maxDeliveryDays" INTEGER NOT NULL,
    "processingDays" INTEGER NOT NULL,
    "excludedDays" TEXT NOT NULL,
    "customMessage" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleTarget" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "targetType" "TargetType" NOT NULL,
    "targetId" TEXT NOT NULL,

    CONSTRAINT "RuleTarget_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RuleTarget_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "DeliveryRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DeliveryRule_shop_idx" ON "DeliveryRule"("shop");

-- CreateIndex
CREATE INDEX "DeliveryRule_shop_type_idx" ON "DeliveryRule"("shop", "type");

-- CreateIndex
CREATE INDEX "RuleTarget_targetType_targetId_idx" ON "RuleTarget"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "RuleTarget_ruleId_idx" ON "RuleTarget"("ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "RuleTarget_ruleId_targetType_targetId_key" ON "RuleTarget"("ruleId", "targetType", "targetId");
