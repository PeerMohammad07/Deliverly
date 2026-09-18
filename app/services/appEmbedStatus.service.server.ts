import {
  isValidShopDomain,
  normalizeShop,
} from "./deliveryRule.service.server";

/**
 * Minimal Admin API client surface the embed-status check needs.
 * Structural typing keeps this UI-independent and stub-friendly in tests.
 */
export interface AppEmbedAdminClient {
  graphql(
    query: string,
    options?: { variables?: Record<string, unknown> },
  ): Promise<{ json(): Promise<unknown> }>;
}

/**
 * Single request: main theme id + its config/settings_data.json content.
 * Validated against Admin API 2026-07. Requires the read_themes scope.
 */
const APP_EMBED_STATUS_QUERY = `query DeliverlyAppEmbedStatus {
  themes(first: 1, roles: [MAIN]) {
    nodes {
      id
      files(filenames: ["config/settings_data.json"], first: 1) {
        nodes {
          filename
          body {
            ... on OnlineStoreThemeFileBodyText {
              content
            }
          }
        }
      }
    }
  }
}`;

/**
 * Fallback to resolve our app handle when settings_data.json uses the
 * handle form (shopify://apps/<handle>/blocks/app-embed/<uuid>) instead
 * of the api-key form. Only called when an enabled app-embed entry that
 * isn't api-key form exists, so the common paths stay at one request.
 */
const APP_HANDLE_QUERY = `query DeliverlyAppHandle($apiKey: String!) {
  appByKey(apiKey: $apiKey) {
    handle
  }
}`;

/**
 * App-embed block types look like:
 * shopify://apps/<owner>/blocks/app-embed/<uuid>
 * where <owner> is the app handle (or api key). An entry is added to
 * settings_data.json only after first enable; disabling later keeps the
 * entry with "disabled": true. So enabled = ours + disabled !== true.
 */
const EMBED_TYPE_RE = /^shopify:\/\/apps\/([^/]+)\/blocks\/app-embed\/[^/]+$/;

export interface EmbedIdentity {
  apiKey: string;
  appHandle?: string;
}

interface EmbedEntry {
  type: unknown;
  disabled: unknown;
}

export function isOurEmbedType(
  type: unknown,
  ids: EmbedIdentity,
): boolean {
  if (typeof type !== "string") return false;
  const match = EMBED_TYPE_RE.exec(type.trim());
  if (!match) return false;
  const owner = match[1].toLowerCase();
  if (ids.apiKey && owner === ids.apiKey.toLowerCase()) return true;
  const handle = (ids.appHandle ?? "").trim().toLowerCase();
  if (handle && owner === handle) return true;
  return false;
}

/**
 * Pull the current.blocks entries out of a settings_data.json document.
 * Returns [] for anything unexpected — callers treat that as disabled
 * (fail closed), never as an error to surface.
 */
export function parseSettingsBlocks(content: unknown): EmbedEntry[] {
  if (typeof content !== "string" || content.length === 0) return [];
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return [];
  }
  const blocks = (data as { current?: { blocks?: unknown } } | null)?.current
    ?.blocks;
  if (!blocks || typeof blocks !== "object" || Array.isArray(blocks)) {
    return [];
  }
  return Object.values(blocks as Record<string, unknown>).filter(
    (entry): entry is EmbedEntry =>
      !!entry && typeof entry === "object" && !Array.isArray(entry),
  );
}

async function fetchAppHandle(
  admin: AppEmbedAdminClient,
  apiKey: string,
): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const response = await admin.graphql(APP_HANDLE_QUERY, {
      variables: { apiKey },
    });
    const payload = (await response.json()) as {
      data?: { appByKey?: { handle?: unknown } | null } | null;
    };
    const handle = payload?.data?.appByKey?.handle;
    return typeof handle === "string" && handle.length > 0 ? handle : null;
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[appEmbedStatus] app handle lookup failed", error);
    return null;
  }
}

/**
 * Whether OUR Deliverly ETA app embed is enabled on the shop's main
 * (published) theme. Shop-scoped, fail-closed: any API failure, missing
 * file, or unparsable content resolves to false, never throws to the
 * caller for data problems. Only programmer errors (bad shop, no admin
 * client) throw.
 */
export async function getAppEmbedStatus(input: {
  shop: string;
  admin: AppEmbedAdminClient;
  apiKey: string;
  appHandle?: string;
}): Promise<boolean> {
  const { shop, admin, apiKey } = input;
  if (!shop || typeof shop !== "string") throw new Error("Shop is required");
  const normalizedShop = normalizeShop(shop);
  if (!isValidShopDomain(normalizedShop)) {
    throw new Error("Invalid shop domain");
  }
  if (!admin || typeof admin.graphql !== "function") {
    throw new Error("Admin client is required");
  }

  try {
    const response = await admin.graphql(APP_EMBED_STATUS_QUERY);
    const payload = (await response.json()) as {
      data?: {
        themes?: {
          nodes?: Array<{
            files?: { nodes?: Array<{ body?: { content?: unknown } }> };
          }>;
        };
      };
      errors?: unknown;
    };
    if (payload?.errors) {
      console.error("[appEmbedStatus] theme file query errors", {
        shop: normalizedShop,
        errors: payload.errors,
      });
      return false;
    }
    const fileNodes =
      payload?.data?.themes?.nodes?.[0]?.files?.nodes ?? [];
    const content = fileNodes[0]?.body?.content;
    if (typeof content !== "string" || content.length === 0) return false;

    const entries = parseSettingsBlocks(content);
    if (entries.length === 0) return false;

    const ids: EmbedIdentity = { apiKey, appHandle: input.appHandle };
    const live = entries.filter((entry) => entry.disabled !== true);
    if (live.some((entry) => isOurEmbedType(entry.type, ids))) return true;
    if (live.length === 0) return false;

    // An enabled app-embed exists but isn't api-key form — resolve our
    // handle (env or Admin API) and check the handle form before
    // concluding it's someone else's embed.
    const handle =
      (input.appHandle ?? "").trim() ||
      (await fetchAppHandle(admin, apiKey)) ||
      "";
    if (!handle) return false;
    return live.some((entry) =>
      isOurEmbedType(entry.type, { apiKey, appHandle: handle }),
    );
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[appEmbedStatus] status check failed", {
      shop: normalizedShop,
      error,
    });
    return false;
  }
}

/**
 * Theme-editor deep link that lands the merchant with our app embed
 * preselected (documented activateAppId flow). Shop comes from the
 * authenticated session — never browser input, never hardcoded. No
 * credentials in the URL: apiKey is the public client_id.
 */
export function buildThemeEditorUrl(
  shop: string,
  apiKey: string,
): string | null {
  if (!shop || typeof shop !== "string") return null;
  const normalizedShop = normalizeShop(shop);
  if (!isValidShopDomain(normalizedShop)) return null;
  const base =
    `https://${normalizedShop}/admin/themes/current/editor` +
    `?context=apps&template=product`;
  const key = (apiKey ?? "").trim();
  if (!key) return base;
  return `${base}&activateAppId=${encodeURIComponent(key)}/app-embed`;
}
