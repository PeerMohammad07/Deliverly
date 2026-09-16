import {
  createRule,
  listRulesByShop,
  type DeliveryRuleWithTargets,
} from "../repositories/deliveryRule.repository.server";
import {
  serializeExcludedDays,
  serializeMessageParts,
} from "../utils/delivery-dates";
import {
  validateRuleInput,
  type RuleFormInput,
} from "../validators/deliveryRule.validator";

/**
 * Validates shop domain format.
 * Follows Shopify shop domain pattern: <name>.myshopify.com
 */
export function isValidShopDomain(shop: string): boolean {
  if (!shop || typeof shop !== "string") return false;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop.trim());
}

export function normalizeShop(shop: string): string {
  return shop.trim().toLowerCase();
}

/**
 * Service layer for delivery rules — single source of truth for listing.
 * Enforces shop isolation and validation before hitting repository.
 */
export async function getRulesForShop(
  shop: string,
): Promise<DeliveryRuleWithTargets[]> {
  if (!shop || typeof shop !== "string") {
    throw new Error("Shop is required");
  }

  const normalized = normalizeShop(shop);

  if (!isValidShopDomain(normalized)) {
    throw new Error("Invalid shop domain");
  }

  try {
    return await listRulesByShop(normalized);
  } catch (error) {
    // Log server-side, return meaningful error to caller
    console.error("[deliveryRule.service] Failed to fetch rules", {
      shop: normalized,
      error,
    });
    throw new Error("Failed to load delivery rules");
  }
}

export type DisplayRule = DeliveryRuleWithTargets & {
  displayEta: string;
  displayTargets: string;
  displayTypeLabel: string;
};

/**
 * Create a rule for a shop. Validates input, enforces shop isolation,
 * persists via repository. Returns created rule or throws with field errors.
 */
export async function createDeliveryRule(
  shop: string,
  rawInput: Partial<RuleFormInput>,
): Promise<DeliveryRuleWithTargets> {
  if (!shop || typeof shop !== "string") throw new Error("Shop is required");
  const normalized = normalizeShop(shop);
  if (!isValidShopDomain(normalized)) throw new Error("Invalid shop domain");

  const checked = validateRuleInput(rawInput);
  if (!checked.valid || !checked.value) {
    const err = new Error("Invalid rule data") as Error & {
      fieldErrors?: typeof checked.errors;
    };
    err.fieldErrors = checked.errors;
    throw err;
  }
  const v = checked.value;

  try {
    return await createRule({
      shop: normalized,
      name: v.name,
      type: v.type,
      processingDays: v.processingDays,
      minDeliveryDays: v.minDeliveryDays,
      maxDeliveryDays: v.maxDeliveryDays,
      excludedDays: serializeExcludedDays(v.excludedDays),
      customMessage: serializeMessageParts({
        prefix: v.msgPrefix,
        separator: v.msgSeparator,
        suffix: v.msgSuffix,
        dateStyle: v.dateStyle,
      }),
      enabled: v.enabled,
      targetIds: v.targetIds,
    });
  } catch (error) {
    console.error("[deliveryRule.service] Failed to create rule", {
      shop: normalized,
      error,
    });
    // Preserve fieldErrors if already attached
    if ((error as { fieldErrors?: unknown }).fieldErrors) throw error;
    throw new Error("Failed to create delivery rule");
  }
}

/**
 * Pure formatters — no DB access, safe to reuse on storefront + admin preview.
 */
export function formatEtaRange(minDays: number, maxDays: number): string {
  if (!Number.isFinite(minDays) || !Number.isFinite(maxDays)) return "—";
  if (minDays === maxDays)
    return `${minDays} day${minDays === 1 ? "" : "s"}`;
  return `${minDays}–${maxDays} days`;
}

export function formatRuleTypeLabel(
  type: DeliveryRuleWithTargets["type"],
): string {
  switch (type) {
    case "DEFAULT":
      return "Default";
    case "PRODUCT":
      return "Product";
    case "COLLECTION":
      return "Collection";
    default:
      return String(type);
  }
}

export function formatTargets(
  rule: DeliveryRuleWithTargets,
): string {
  if (rule.type === "DEFAULT") return "All products";

  if (!rule.targets || rule.targets.length === 0) {
    return "No targets";
  }

  const productCount = rule.targets.filter(
    (t) => t.targetType === "PRODUCT",
  ).length;
  const collectionCount = rule.targets.filter(
    (t) => t.targetType === "COLLECTION",
  ).length;

  const parts: string[] = [];
  if (productCount > 0)
    parts.push(
      `${productCount} product${productCount === 1 ? "" : "s"}`,
    );
  if (collectionCount > 0)
    parts.push(
      `${collectionCount} collection${collectionCount === 1 ? "" : "s"}`,
    );

  return parts.join(" · ") || `${rule.targets.length} target${rule.targets.length === 1 ? "" : "s"}`;
}

export function toDisplayRule(
  rule: DeliveryRuleWithTargets,
): DisplayRule {
  return {
    ...rule,
    displayEta: formatEtaRange(rule.minDeliveryDays, rule.maxDeliveryDays),
    displayTargets: formatTargets(rule),
    displayTypeLabel: formatRuleTypeLabel(rule.type),
  };
}
