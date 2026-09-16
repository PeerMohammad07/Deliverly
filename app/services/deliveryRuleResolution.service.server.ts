import type { DeliveryRule } from "@prisma/client";
import {
  findEnabledCollectionRule,
  findEnabledDefaultRule,
  findEnabledProductRule,
} from "../repositories/deliveryRule.repository.server";
import {
  isValidShopDomain,
  normalizeShop,
} from "./deliveryRule.service.server";

export interface ResolveDeliveryRuleInput {
  shop: string;
  productId: string;
  collectionIds?: string[];
}

/**
 * Reusable Rule Resolution Engine — no HTTP, no UI, no date math.
 *
 * Precedence (first match wins, disabled rules never participate):
 *   1. PRODUCT    — enabled rule targeting this exact product GID
 *   2. COLLECTION — enabled rule targeting any of the product's
 *                   collection GIDs (newest wins on multiple matches)
 *   3. DEFAULT    — the shop's enabled store-wide rule
 *   4. null       — nothing enabled applies
 *
 * Determinism: within one level, newest createdAt wins, id breaks
 * millisecond ties. There is deliberately no merchant-facing priority
 * number — the hierarchy above IS the priority.
 *
 * Shop isolation: every lookup is scoped to the normalized shop, which
 * must originate from the authenticated session at the calling layer.
 * A matching targetId in another shop can never surface its rule.
 *
 * Efficiency: at most one indexed query per level with early exit
 * (product hit = 1 query, collection hit = 2, default/null = 3).
 * No includes, no loops — no N+1 by construction.
 */
export async function resolveDeliveryRule(
  input: ResolveDeliveryRuleInput,
): Promise<DeliveryRule | null> {
  if (!input || typeof input !== "object") {
    throw new Error("Resolve input is required");
  }

  const { shop, productId } = input;
  if (!shop || typeof shop !== "string") throw new Error("Shop is required");
  const normalizedShop = normalizeShop(shop);
  if (!isValidShopDomain(normalizedShop)) {
    throw new Error("Invalid shop domain");
  }
  if (!productId || typeof productId !== "string") {
    throw new Error("Product ID is required");
  }

  const collectionIds = Array.isArray(input.collectionIds)
    ? input.collectionIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];

  const productRule = await findEnabledProductRule(
    normalizedShop,
    productId,
  );
  if (productRule) return productRule;

  if (collectionIds.length > 0) {
    const collectionRule = await findEnabledCollectionRule(
      normalizedShop,
      collectionIds,
    );
    if (collectionRule) return collectionRule;
  }

  return findEnabledDefaultRule(normalizedShop);
}
