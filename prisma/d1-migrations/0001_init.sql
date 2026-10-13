-- Initial D1 (SQLite) schema, generated from prisma/schema.prisma with
-- `prisma migrate diff --from-empty --to-schema-datamodel`.

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" DATETIME
);

-- CreateTable
CREATE TABLE "DeliveryRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "defaultShopKey" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "minDeliveryDays" INTEGER NOT NULL,
    "maxDeliveryDays" INTEGER NOT NULL,
    "processingDays" INTEGER NOT NULL,
    "excludedDays" TEXT NOT NULL,
    "cutoffMinutes" INTEGER,
    "customMessage" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RuleTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    CONSTRAINT "RuleTarget_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "DeliveryRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRule_defaultShopKey_key" ON "DeliveryRule"("defaultShopKey");

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

