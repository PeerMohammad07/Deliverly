import { resolveDeliveryRule } from "./deliveryRuleResolution.service.server";
import {
  calculateDeliveryRange,
  getCalendarDateInTimeZone,
  renderStoredMessage,
  toDateOnlyString,
} from "../utils/delivery-dates";
import { isProductGid } from "../validators/deliveryRule.validator";
import {
  isValidShopDomain,
  normalizeShop,
} from "./deliveryRule.service.server";

const PRODUCT_CONTEXT_QUERY = `query ProductEstimateContext($id: ID!, $after: String) {
  shop {
    ianaTimezone
  }
  product(id: $id) {
    id
    collections(first: 250, after: $after) {
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

// 250 is the Admin API page maximum. The cap bounds storefront latency;
// products in more collections than this are vanishingly rare.
const MAX_COLLECTION_PAGES = 10;

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

export type EstimateResult =
  | { enabled: true; message: string; minDate: string; maxDate: string }
  | { enabled: false; message: null; minDate: null; maxDate: null };

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
  admin?: StorefrontAdminClient | null;
}): Promise<EstimateResult> {
  const { shop, productId, admin } = input;
  if (!shop || typeof shop !== "string") throw new Error("Shop is required");
  const normalizedShop = normalizeShop(shop);
  if (!isValidShopDomain(normalizedShop)) {
    throw new Error("Invalid shop domain");
  }
  if (!isProductGid(productId)) throw new InvalidProductError();

  let collectionIds: string[] = [];
  let timeZone = "UTC";
  if (admin && typeof admin.graphql === "function") {
    try {
      const context = await fetchProductContext(admin, productId);
      collectionIds = context.collectionIds;
      timeZone = context.timeZone;
    } catch (error) {
      if (error instanceof ProductNotFoundError) throw error;
      console.error("[storefrontEstimate] product context failed", {
        shop: normalizedShop,
        error,
      });
    }
  }

  const rule = await resolveDeliveryRule({
    shop: normalizedShop,
    productId,
    collectionIds,
  });
  if (!rule) {
    return { enabled: false, message: null, minDate: null, maxDate: null };
  }

  const { minDate, maxDate } = calculateDeliveryRange({
    from: getCalendarDateInTimeZone(new Date(), timeZone),
    processingDays: rule.processingDays,
    minShippingDays: rule.minDeliveryDays,
    maxShippingDays: rule.maxDeliveryDays,
    excludedDays: rule.excludedDays,
  });

  return {
    enabled: true,
    message: renderStoredMessage(rule.customMessage, minDate, maxDate),
    minDate: toDateOnlyString(minDate),
    maxDate: toDateOnlyString(maxDate),
  };
}
