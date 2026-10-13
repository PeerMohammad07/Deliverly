/**
 * Short-lived KV cache for the Shopify lookups behind each storefront
 * estimate (the product's collections and the shop's time zone). Every
 * product page view would otherwise spend Admin API rate limit; rules
 * themselves are never cached, so saved rule changes show immediately.
 *
 * The cache is best-effort: any KV failure (including the free plan's
 * daily write limit) falls back to the live lookup, never to an error.
 */

export interface ProductContext {
  collectionIds: string[];
  timeZone: string;
}

/** The parts of a Workers KV namespace this module uses. */
export interface ProductContextStore {
  get(key: string, type: "json"): Promise<unknown>;
  put(
    key: string,
    value: string,
    options: { expirationTtl: number },
  ): Promise<void>;
}

/** Collection changes can take this long to reach the storefront. */
export const PRODUCT_CONTEXT_TTL_SECONDS = 600;

export function productContextKey(shop: string, productId: string): string {
  return `product-context:v1:${shop}:${productId}`;
}

function isProductContext(value: unknown): value is ProductContext {
  if (!value || typeof value !== "object") return false;
  const { collectionIds, timeZone } = value as Partial<ProductContext>;
  return (
    typeof timeZone === "string" &&
    timeZone.length > 0 &&
    Array.isArray(collectionIds) &&
    collectionIds.every((id) => typeof id === "string")
  );
}

/**
 * Cached `load()`. A miss runs `load()` and stores its result in the
 * background through `waitUntil`, so the shopper never waits on the
 * write. `load()` errors propagate unchanged and are never cached.
 */
export async function withProductContextCache(input: {
  store: ProductContextStore | null | undefined;
  shop: string;
  productId: string;
  load: () => Promise<ProductContext>;
  waitUntil?: (promise: Promise<unknown>) => void;
}): Promise<ProductContext> {
  const { store, shop, productId, load, waitUntil } = input;
  if (!store) return load();

  const key = productContextKey(shop, productId);
  try {
    const cached = await store.get(key, "json");
    if (isProductContext(cached)) return cached;
  } catch (error) {
    console.warn("[productContextCache] read failed", error);
  }

  const fresh = await load();
  const write = store
    .put(key, JSON.stringify(fresh), {
      expirationTtl: PRODUCT_CONTEXT_TTL_SECONDS,
    })
    .catch((error: unknown) => {
      console.warn("[productContextCache] write failed", error);
    });
  if (waitUntil) waitUntil(write);
  else await write;
  return fresh;
}
