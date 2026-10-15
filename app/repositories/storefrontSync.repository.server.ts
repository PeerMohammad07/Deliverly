import type { StorefrontSync } from "@prisma/client";
import prisma from "../db.server";

/*
 * Sync state of each shop's storefront config metafield. No transactions
 * on D1, so writes are single statements: a change bumps requestedAt, and
 * a finished sync only moves syncedAt forward (updateMany with a
 * condition), so a slow older sync can never mark a newer change as done.
 */

/** Record that the shop's config must be rebuilt (a change happened). */
export async function markSyncRequested(shop: string, at: Date): Promise<void> {
  await prisma.storefrontSync.upsert({
    where: { shop },
    create: { shop, requestedAt: at },
    update: { requestedAt: at },
  });
}

/**
 * Record a successful write of a config built from data read after
 * `startedAt`. Ignored when a newer sync already finished.
 */
export async function markSyncSucceeded(
  shop: string,
  startedAt: Date,
  timezone: string,
): Promise<void> {
  await prisma.storefrontSync.updateMany({
    where: {
      shop,
      OR: [{ syncedAt: null }, { syncedAt: { lt: startedAt } }],
    },
    data: { syncedAt: startedAt, timezone, lastError: null },
  });
}

export async function markSyncFailed(shop: string, error: string): Promise<void> {
  await prisma.storefrontSync.updateMany({
    where: { shop },
    data: { lastError: error.slice(0, 500) },
  });
}

export async function getSyncState(
  shop: string,
): Promise<StorefrontSync | null> {
  return prisma.storefrontSync.findUnique({ where: { shop } });
}

/** shop/redact: forget the shop. */
export async function deleteSyncState(shop: string): Promise<number> {
  const { count } = await prisma.storefrontSync.deleteMany({ where: { shop } });
  return count;
}
