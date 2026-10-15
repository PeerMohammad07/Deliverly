-- Per-shop sync state of the storefront config metafield. A shop is out
-- of date while syncedAt is null or older than requestedAt.

-- CreateTable
CREATE TABLE "StorefrontSync" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" DATETIME,
    "timezone" TEXT,
    "lastError" TEXT,
    "updatedAt" DATETIME NOT NULL
);
