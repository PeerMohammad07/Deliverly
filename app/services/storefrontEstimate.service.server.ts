import { resolveDeliveryRule } from "./deliveryRuleResolution.service.server";
import { computeEstimate } from "../utils/compute-estimate";
import { isProductGid } from "../validators/deliveryRule.validator";
import {
  isValidShopDomain,
  normalizeShop,
} from "./deliveryRule.service.server";
import {
  withProductContextCache,
  type ProductContextStore,
} from "./productContextCache.server";

const PRODUCT_CONTEXT_QUERY = `query ProductEstimateContext($id: ID!, $after: String) {
  shop {
    ianaTimezone
  }
  product(id: $id) {
    id
    collections(first: 100, after: $after) {
      edges {
        node {
          id
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}`;

// Shopify charges a query's requested size up front, so pages of 100
// (not the 250 maximum) leave rate limit for the merchant's own admin.
// 25 pages keep the same 2,500-collection cap; products in more
// collections than this are vanishingly rare.
const MAX_COLLECTION_PAGES = 25;

/**
 * Minimal Admin API client surface the estimate flow needs.
 * Structural typing keeps this UI-independent and stub-friendly in tests.
 */
export interface StorefrontAdminClient {
  graphql(
    query: string,
    options?: { variables?: Record<string, unknown> },
  ): Promise<{ json(): Promise<unknown> }>;
}

/**
 * Present only before today's cutoff on rules with the countdown turned
 * on. `message` replaces the normal one and still contains {countdown}
 * for the storefront to fill. secondsLeft is relative, so a wrong clock
 * on the shopper's device can't skew it; the storefront refetches when
 * it reaches zero.
 */
export interface EstimateCountdown {
  secondsLeft: number;
  message: string;
}

export type EstimateResult =
  | {
      enabled: true;
      message: string;
      minDate: string;
      maxDate: string;
      countdown: EstimateCountdown | null;
    }
  | { enabled: false; message: null; minDate: null; maxDate: null };

const DISABLED_ESTIMATE: EstimateResult = {
  enabled: false,
  message: null,
  minDate: null,
  maxDate: null,
};

export class InvalidProductError extends Error {
  constructor() {
    super("Invalid or missing product identifier");
    this.name = "InvalidProductError";
  }
}

export class ProductNotFoundError extends Error {
  constructor(productId: string) {
    super(`Product "${productId}" was not found`);
    this.name = "ProductNotFoundError";
  }
}

/**
 * Resolve the product's collection IDs from trusted Shopify data —
 * never from browser-supplied values, which could be manipulated to
 * steer rule resolution.
 */
export async function fetchProductContext(
  admin: StorefrontAdminClient,
  productId: string,
): Promise<{ collectionIds: string[]; timeZone: string }> {
  const collectionIds: string[] = [];
  let timeZone = "";
  let after: string | null = null;

  for (let page = 0; page < MAX_COLLECTION_PAGES; page += 1) {
    let payload: unknown;
    try {
      const response = await admin.graphql(PRODUCT_CONTEXT_QUERY, {
        variables: { id: productId, after },
      });
      payload = await response.json();
    } catch (error) {
      console.error("[storefrontEstimate] product lookup failed", error);
      throw new Error("Failed to load product");
    }

    const body = payload as {
      data?: { product?: unknown; shop?: { ianaTimezone?: unknown } };
      errors?: unknown;
    };
    if (body?.errors) {
      console.error("[storefrontEstimate] product lookup errors", body.errors);
      throw new Error("Failed to load product");
    }

    const product = body?.data?.product;
    if (!product || typeof product !== "object") {
      throw new ProductNotFoundError(productId);
    }
    const tz = body?.data?.shop?.ianaTimezone;
    if (typeof tz !== "string" || !tz) {
      throw new Error("Failed to load shop time zone");
    }
    timeZone = tz;

    const collections = (
      product as {
        collections?: {
          edges?: unknown;
          pageInfo?: { hasNextPage?: unknown; endCursor?: unknown };
        };
      }
    ).collections;
    const edges = collections?.edges;
    if (Array.isArray(edges)) {
      for (const edge of edges) {
        const id = (edge as { node?: { id?: unknown } } | null)?.node?.id;
        if (typeof id === "string" && id.length > 0) collectionIds.push(id);
      }
    }

    const pageInfo = collections?.pageInfo;
    if (
      pageInfo?.hasNextPage !== true ||
      typeof pageInfo.endCursor !== "string"
    ) {
      return { collectionIds, timeZone };
    }
    after = pageInfo.endCursor;
  }

  console.warn("[storefrontEstimate] collection pages capped", {
    productId,
    collected: collectionIds.length,
  });
  return { collectionIds, timeZone };
}

/**
 * Storefront estimate flow: trusted product context → resolved rule →
 * calculated range → customer message. Returns only customer-safe data.
 * Throws InvalidProductError / ProductNotFoundError for bad input;
 * anything else is unexpected and must map to a generic error upstream.
 */
export async function getDeliveryEstimate(input: {
  shop: string;
  productId: string;
  /** Shopper's country code from the storefront; null = unknown. */
  country?: string | null;
  admin?: StorefrontAdminClient | null;
  /** KV cache for the Shopify lookups; null skips caching. */
  cache?: ProductContextStore | null;
  /** Lets cache writes finish after the response (ctx.waitUntil). */
  waitUntil?: (promise: Promise<unknown>) => void;
}): Promise<EstimateResult> {
  const { shop, productId, country, admin, cache, waitUntil } = input;
  if (!shop || typeof shop !== "string") throw new Error("Shop is required");
  const normalizedShop = normalizeShop(shop);
  if (!isValidShopDomain(normalizedShop)) {
    throw new Error("Invalid shop domain");
  }
  if (!isProductGid(productId)) throw new InvalidProductError();

  // Fail closed: without the shop's time zone and the product's
  // collections we could show a date off by a day or the wrong rule's
  // estimate, so hide the widget instead of guessing.
  if (!admin || typeof admin.graphql !== "function") {
    return DISABLED_ESTIMATE;
  }
  let collectionIds: string[];
  let timeZone: string;
  try {
    ({ collectionIds, timeZone } = await withProductContextCache({
      store: cache,
      shop: normalizedShop,
      productId,
      load: () => fetchProductContext(admin, productId),
      waitUntil,
    }));
  } catch (error) {
    if (error instanceof ProductNotFoundError) throw error;
    console.error("[storefrontEstimate] product context failed", {
      shop: normalizedShop,
      error,
    });
    return DISABLED_ESTIMATE;
  }

  const rule = await resolveDeliveryRule({
    shop: normalizedShop,
    productId,
    collectionIds,
    country,
  });
  if (!rule) return DISABLED_ESTIMATE;

  return { enabled: true, ...computeEstimate(rule, new Date(), timeZone) };
}
