import { resolveDeliveryRule } from "./deliveryRuleResolution.service.server";
import {
  calculateDeliveryRange,
  renderStoredMessage,
  toDateOnlyString,
} from "../utils/delivery-dates";
import { isProductGid } from "../validators/deliveryRule.validator";
import {
  isValidShopDomain,
  normalizeShop,
} from "./deliveryRule.service.server";

const PRODUCT_COLLECTIONS_QUERY = `query ProductCollectionIds($id: ID!) {
  product(id: $id) {
    id
    collections(first: 50) {
      edges {
        node {
          id
        }
      }
    }
  }
}`;

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
export async function fetchProductCollectionIds(
  admin: StorefrontAdminClient,
  productId: string,
): Promise<string[]> {
  let payload: unknown;
  try {
    const response = await admin.graphql(PRODUCT_COLLECTIONS_QUERY, {
      variables: { id: productId },
    });
    payload = await response.json();
  } catch (error) {
    console.error("[storefrontEstimate] product lookup failed", error);
    throw new Error("Failed to load product");
  }

  const body = payload as {
    data?: { product?: unknown };
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

  const edges = (product as { collections?: { edges?: unknown } })
    ?.collections?.edges;
  if (!Array.isArray(edges)) return [];

  const ids: string[] = [];
  for (const edge of edges) {
    const id = (edge as { node?: { id?: unknown } } | null)?.node?.id;
    if (typeof id === "string" && id.length > 0) ids.push(id);
  }
  return ids;
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
  admin: StorefrontAdminClient;
}): Promise<EstimateResult> {
  const { shop, productId, admin } = input;
  if (!shop || typeof shop !== "string") throw new Error("Shop is required");
  const normalizedShop = normalizeShop(shop);
  if (!isValidShopDomain(normalizedShop)) {
    throw new Error("Invalid shop domain");
  }
  if (!isProductGid(productId)) throw new InvalidProductError();
  if (!admin || typeof admin.graphql !== "function") {
    throw new Error("Admin client is required");
  }

  const collectionIds = await fetchProductCollectionIds(admin, productId);

  const rule = await resolveDeliveryRule({
    shop: normalizedShop,
    productId,
    collectionIds,
  });
  if (!rule) {
    return { enabled: false, message: null, minDate: null, maxDate: null };
  }

  const { minDate, maxDate } = calculateDeliveryRange({
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
