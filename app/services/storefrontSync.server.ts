import { listRulesByShop } from "../repositories/deliveryRule.repository.server";
import {
  getSyncState,
  markSyncFailed,
  markSyncRequested,
  markSyncSucceeded,
} from "../repositories/storefrontSync.repository.server";
import {
  buildStorefrontConfig,
  serializeStorefrontConfig,
  StorefrontConfigTooLargeError,
} from "../utils/storefront-config";

/**
 * Writes a shop's storefront config (all enabled rules) to the
 * $app / deliverly_config shop metafield, which the theme widget reads
 * instead of calling our server. Run after every change to the shop's
 * rules or time zone.
 *
 * Races: the config is always rebuilt from D1 and written with the
 * metafield's compareDigest read *before* the rules. If another sync
 * wrote in between, Shopify answers STALE_OBJECT and we rebuild from
 * fresh data, so an older rule set can never overwrite a newer one.
 */

export interface SyncAdminClient {
  graphql(
    query: string,
    options?: { variables?: Record<string, unknown> },
  ): Promise<{ json(): Promise<unknown> }>;
}

export const TOO_LARGE_ERROR = "TOO_LARGE";
const MAX_ATTEMPTS = 3;
const KEY = "deliverly_config";

const STATE_QUERY = `query StorefrontConfigState {
  shop {
    id
    ianaTimezone
    config: metafield(namespace: "$app", key: "${KEY}") {
      compareDigest
    }
  }
}`;

const SET_MUTATION = `mutation SetStorefrontConfig($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields {
      id
    }
    userErrors {
      field
      message
      code
    }
  }
}`;

const DELETE_MUTATION = `mutation DeleteStorefrontConfig($metafields: [MetafieldIdentifierInput!]!) {
  metafieldsDelete(metafields: $metafields) {
    deletedMetafields {
      key
    }
    userErrors {
      field
      message
    }
  }
}`;

export type SyncResult =
  | { ok: true }
  | { ok: false; reason: "too_large" | "failed"; message: string };

async function run<T>(
  admin: SyncAdminClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(query, variables ? { variables } : {});
  const body = (await response.json()) as { data?: T; errors?: unknown };
  if (body.errors || !body.data) {
    throw new Error(`Shopify API error: ${JSON.stringify(body.errors ?? "no data")}`);
  }
  return body.data;
}

interface ShopState {
  shop: {
    id: string;
    ianaTimezone: string;
    config: { compareDigest: string } | null;
  };
}

interface SetResult {
  metafieldsSet: {
    userErrors: Array<{ message: string; code: string | null }>;
  };
}

export async function syncStorefrontConfig(
  shop: string,
  admin: SyncAdminClient,
): Promise<SyncResult> {
  const startedAt = new Date();
  try {
    await markSyncRequested(shop, startedAt);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      // Digest first, then rules: see the race note above.
      const { shop: state } = await run<ShopState>(admin, STATE_QUERY);
      const rules = await listRulesByShop(shop);
      const config = buildStorefrontConfig({
        rules,
        timeZone: state.ianaTimezone,
      });

      let value: string;
      try {
        value = serializeStorefrontConfig(config);
      } catch (error) {
        if (!(error instanceof StorefrontConfigTooLargeError)) throw error;
        // An old, smaller config would show outdated rules. Remove it so
        // the widget falls back to the server route.
        if (state.config) {
          await run(admin, DELETE_MUTATION, {
            metafields: [{ ownerId: state.id, namespace: "$app", key: KEY }],
          });
        }
        await markSyncFailed(shop, TOO_LARGE_ERROR);
        console.warn("[storefrontSync] config too large", {
          shop,
          bytes: error.bytes,
        });
        return { ok: false, reason: "too_large", message: error.message };
      }

      const result = await run<SetResult>(admin, SET_MUTATION, {
        metafields: [
          {
            ownerId: state.id,
            namespace: "$app",
            key: KEY,
            type: "json",
            value,
            // null = "must not exist yet", so even the first write is safe.
            compareDigest: state.config?.compareDigest ?? null,
          },
        ],
      });
      const errors = result.metafieldsSet.userErrors;
      if (errors.length === 0) {
        await markSyncSucceeded(shop, startedAt, state.ianaTimezone);
        return { ok: true };
      }
      if (!errors.every((e) => e.code === "STALE_OBJECT")) {
        throw new Error(errors.map((e) => e.message).join("; "));
      }
      // Someone else wrote first: rebuild from fresh data.
    }
    throw new Error("The storefront config kept changing while saving.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[storefrontSync] sync failed", { shop, error });
    try {
      await markSyncFailed(shop, message);
    } catch (markError) {
      console.error("[storefrontSync] couldn't record failure", markError);
    }
    return { ok: false, reason: "failed", message };
  }
}

export type SyncStatus =
  | { state: "ok" }
  | { state: "unknown" }
  | { state: "too_large" }
  | { state: "out_of_date"; lastError: string | null };

/** For the admin banner. */
export async function getStorefrontSyncStatus(
  shop: string,
): Promise<SyncStatus> {
  try {
    const sync = await getSyncState(shop);
    if (!sync) return { state: "unknown" };
    if (sync.lastError === TOO_LARGE_ERROR) return { state: "too_large" };
    if (sync.syncedAt && sync.syncedAt >= sync.requestedAt) {
      return { state: "ok" };
    }
    return { state: "out_of_date", lastError: sync.lastError };
  } catch (error) {
    console.error("[storefrontSync] status lookup failed", { shop, error });
    return { state: "unknown" };
  }
}

/** How long an out-of-date shop waits before an admin visit retries. */
const AUTO_RETRY_AFTER_MS = 5 * 60 * 1000;

/**
 * Backfill on admin visits: sync a shop that was never synced (installed
 * before the storefront config existed), and retry a failed sync at most
 * every few minutes. Never throws; a no-op for shops that are up to date.
 */
export async function ensureStorefrontSynced(
  shop: string,
  admin: SyncAdminClient,
  now: Date = new Date(),
): Promise<void> {
  try {
    const sync = await getSyncState(shop);
    const upToDate =
      sync?.syncedAt != null && sync.syncedAt >= sync.requestedAt;
    const retryDue =
      sync != null &&
      now.getTime() - sync.updatedAt.getTime() >= AUTO_RETRY_AFTER_MS;
    if (sync && (upToDate || !retryDue)) return;
    await syncStorefrontConfig(shop, admin);
  } catch (error) {
    console.error("[storefrontSync] backfill check failed", { shop, error });
  }
}

/** Sync only when the shop's time zone differs from the written config. */
export async function syncIfTimeZoneChanged(
  shop: string,
  timeZone: unknown,
  admin: SyncAdminClient,
): Promise<boolean> {
  if (typeof timeZone !== "string" || !timeZone) return false;
  const sync = await getSyncState(shop);
  if (!sync || sync.timezone === timeZone) return false;
  await syncStorefrontConfig(shop, admin);
  return true;
}
