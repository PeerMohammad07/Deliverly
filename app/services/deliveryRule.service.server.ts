import {
  createRule,
  deleteRuleForShop,
  DuplicateDefaultRuleError,
  getRuleByIdForShop,
  listRulePageByShop,
  listRulesByShop,
  RuleNotFoundError,
  toggleRuleEnabled,
  updateRule,
  type DeliveryRuleWithTargets,
  type RuleListPage,
  type RuleListStatus,
} from "../repositories/deliveryRule.repository.server";
import {
  formatExcludedDaysLabel,
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
    console.error("[deliveryRule.service] Failed to fetch rules", {
      shop: normalized,
      error,
    });
    throw new Error("Failed to load delivery rules");
  }
}

export async function getRulePageForShop(
  shop: string,
  input: {
    status: RuleListStatus;
    query: string;
    page: number;
    pageSize: number;
  },
): Promise<RuleListPage> {
  const normalized = normalizeShop(shop);
  if (!isValidShopDomain(normalized)) throw new Error("Invalid shop domain");
  if (!["all", "active", "inactive"].includes(input.status)) {
    throw new Error("Invalid rule status");
  }
  if (!Number.isInteger(input.page) || input.page < 1) {
    throw new Error("Invalid page");
  }
  if (
    !Number.isInteger(input.pageSize) ||
    input.pageSize < 1 ||
    input.pageSize > 50
  ) {
    throw new Error("Invalid page size");
  }

  try {
    return await listRulePageByShop(normalized, {
      status: input.status,
      query: input.query.trim().slice(0, 100),
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    });
  } catch (error) {
    console.error("[deliveryRule.service] Failed to fetch rule page", {
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
  displayExcluded: string;
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
    if (error instanceof DuplicateDefaultRuleError) {
      const err = new Error("Invalid rule data") as Error & {
        fieldErrors?: Record<string, string>;
      };
      err.fieldErrors = {
        type: "This shop already has a store-wide default rule. Edit it instead of creating another.",
      };
      throw err;
    }
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
  if (minDays === maxDays) return `${minDays} day${minDays === 1 ? "" : "s"}`;
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

export function formatTargets(rule: DeliveryRuleWithTargets): string {
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
    parts.push(`${productCount} product${productCount === 1 ? "" : "s"}`);
  if (collectionCount > 0)
    parts.push(
      `${collectionCount} collection${collectionCount === 1 ? "" : "s"}`,
    );

  return (
    parts.join(" · ") ||
    `${rule.targets.length} target${rule.targets.length === 1 ? "" : "s"}`
  );
}

export function toDisplayRule(rule: DeliveryRuleWithTargets): DisplayRule {
  return {
    ...rule,
    displayEta: formatEtaRange(rule.minDeliveryDays, rule.maxDeliveryDays),
    displayTargets: formatTargets(rule),
    displayTypeLabel: formatRuleTypeLabel(rule.type),
    displayExcluded: formatExcludedDaysLabel(rule.excludedDays),
  };
}

/**
 * Single rule for editing — ownership enforced, RuleNotFoundError
 * bubbles so routes can answer 404.
 */
export async function getRuleForEdit(
  shop: string,
  id: string,
): Promise<DeliveryRuleWithTargets> {
  if (!shop || typeof shop !== "string") throw new Error("Shop is required");
  const normalized = normalizeShop(shop);
  if (!isValidShopDomain(normalized)) throw new Error("Invalid shop domain");

  const rule = await getRuleByIdForShop(normalized, id);
  if (!rule) throw new RuleNotFoundError(id);
  return rule;
}

/**
 * Update a rule plus its targets. Same validation as create; DEFAULT
 * changes and target replacement are handled atomically in the repo.
 * RuleNotFoundError bubbles so routes can answer 404.
 */
export async function updateDeliveryRule(
  shop: string,
  id: string,
  rawInput: Partial<RuleFormInput>,
): Promise<DeliveryRuleWithTargets> {
  if (!shop || typeof shop !== "string") throw new Error("Shop is required");
  const normalized = normalizeShop(shop);
  if (!isValidShopDomain(normalized)) throw new Error("Invalid shop domain");
  if (!id || typeof id !== "string") throw new Error("Rule ID is required");

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
    return await updateRule(normalized, id, {
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
    console.error("[deliveryRule.service] Failed to update rule", {
      shop: normalized,
      id,
      error,
    });
    if (error instanceof DuplicateDefaultRuleError) {
      const err = new Error("Invalid rule data") as Error & {
        fieldErrors?: Record<string, string>;
      };
      err.fieldErrors = {
        type: "This shop already has a store-wide default rule.",
      };
      throw err;
    }
    if (error instanceof RuleNotFoundError) throw error;
    if ((error as { fieldErrors?: unknown }).fieldErrors) throw error;
    throw new Error("Failed to update delivery rule");
  }
}

/**
 * Delete a rule with its targets (FK cascade).
 * RuleNotFoundError bubbles so routes can answer with the right message.
 */
export async function deleteDeliveryRule(
  shop: string,
  id: string,
): Promise<{ id: string; name: string }> {
  if (!shop || typeof shop !== "string") throw new Error("Shop is required");
  const normalized = normalizeShop(shop);
  if (!isValidShopDomain(normalized)) throw new Error("Invalid shop domain");
  if (!id || typeof id !== "string") throw new Error("Rule ID is required");

  try {
    return await deleteRuleForShop(normalized, id);
  } catch (error) {
    console.error("[deliveryRule.service] Failed to delete rule", {
      shop: normalized,
      id,
      error,
    });
    if (error instanceof RuleNotFoundError) throw error;
    throw new Error("Failed to delete delivery rule");
  }
}

/**
 * Flip only the enabled flag. Returns the fresh rule so callers show
 * server truth instead of optimistic state.
 */
export async function toggleRuleEnabledState(
  shop: string,
  id: string,
): Promise<DeliveryRuleWithTargets> {
  if (!shop || typeof shop !== "string") throw new Error("Shop is required");
  const normalized = normalizeShop(shop);
  if (!isValidShopDomain(normalized)) throw new Error("Invalid shop domain");
  if (!id || typeof id !== "string") throw new Error("Rule ID is required");

  try {
    return await toggleRuleEnabled(normalized, id);
  } catch (error) {
    console.error("[deliveryRule.service] Failed to toggle rule", {
      shop: normalized,
      id,
      error,
    });
    if (error instanceof RuleNotFoundError) throw error;
    throw new Error("Failed to update rule status");
  }
}
