import type {
  DeliveryRule,
  Prisma,
  RuleTarget,
  RuleType,
} from "@prisma/client";
import prisma from "../db.server";

export type DeliveryRuleWithTargets = DeliveryRule & {
  targets: RuleTarget[];
};

export type RuleListStatus = "all" | "active" | "inactive";

export interface RuleListPage {
  rules: DeliveryRuleWithTargets[];
  filteredTotal: number;
  total: number;
  active: number;
  inactive: number;
}

export interface CreateRuleData {
  shop: string;
  name: string;
  type: RuleType;
  processingDays: number;
  minDeliveryDays: number;
  maxDeliveryDays: number;
  excludedDays: string;
  customMessage: string;
  enabled: boolean;
  targetIds: string[];
}

/**
 * Thrown when a second DEFAULT rule is created for a shop.
 * SQLite (via Prisma) cannot express a partial unique index, so this
 * invariant is enforced here instead of in the schema.
 */
export class DuplicateDefaultRuleError extends Error {
  constructor(shop: string) {
    super(`Shop "${shop}" already has a default delivery rule`);
    this.name = "DuplicateDefaultRuleError";
  }
}

export class RuleNotFoundError extends Error {
  constructor(id: string) {
    super(`Delivery rule "${id}" was not found`);
    this.name = "RuleNotFoundError";
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

/**
 * Fetch a single rule by ID, scoped to the shop.
 * Returns null when the rule doesn't exist or belongs elsewhere —
 * callers turn that into a not-found error. Never query by ID alone.
 */
export async function getRuleByIdForShop(
  shop: string,
  id: string,
): Promise<DeliveryRuleWithTargets | null> {
  if (!shop || typeof shop !== "string") throw new Error("Shop is required");
  if (!id || typeof id !== "string") throw new Error("Rule ID is required");

  return prisma.deliveryRule.findFirst({
    where: { id, shop: shop.trim().toLowerCase() },
    include: { targets: true },
  });
}

/**
 * Fetch all delivery rules for a shop, ordered by most recent first.
 * Shop scoping is mandatory — never return cross-shop data.
 */
export async function listRulesByShop(
  shop: string,
): Promise<DeliveryRuleWithTargets[]> {
  if (!shop || typeof shop !== "string") {
    throw new Error("Shop is required");
  }

  const normalizedShop = shop.trim().toLowerCase();

  return prisma.deliveryRule.findMany({
    where: { shop: normalizedShop },
    include: { targets: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function listRulePageByShop(
  shop: string,
  input: {
    status: RuleListStatus;
    query: string;
    skip: number;
    take: number;
  },
): Promise<RuleListPage> {
  if (!shop || typeof shop !== "string") throw new Error("Shop is required");
  if (!Number.isInteger(input.skip) || input.skip < 0) {
    throw new Error("Invalid page offset");
  }
  if (!Number.isInteger(input.take) || input.take < 1 || input.take > 50) {
    throw new Error("Invalid page size");
  }

  const normalizedShop = shop.trim().toLowerCase();
  const query = input.query.trim();
  const shopWhere: Prisma.DeliveryRuleWhereInput = { shop: normalizedShop };
  const filteredWhere: Prisma.DeliveryRuleWhereInput = {
    ...shopWhere,
    ...(input.status === "all" ? {} : { enabled: input.status === "active" }),
    ...(query ? { name: { contains: query } } : {}),
  };

  const [rules, filteredTotal, total, active] = await prisma.$transaction([
    prisma.deliveryRule.findMany({
      where: filteredWhere,
      include: { targets: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: input.skip,
      take: input.take,
    }),
    prisma.deliveryRule.count({ where: filteredWhere }),
    prisma.deliveryRule.count({ where: shopWhere }),
    prisma.deliveryRule.count({ where: { ...shopWhere, enabled: true } }),
  ]);

  return {
    rules,
    filteredTotal,
    total,
    active,
    inactive: total - active,
  };
}

/**
 * Resolution finders. Each returns at most one ENABLED rule (or null)
 * for a single shop — the building blocks of PRODUCT → COLLECTION →
 * DEFAULT precedence. Targets are intentionally NOT included: the
 * date-calculation step only needs the rule's timing/message fields,
 * so resolution stays at exactly one query per level.
 */
const RESOLUTION_ORDER_BY = [{ createdAt: "desc" }, { id: "desc" }] as const;

export async function findEnabledProductRule(
  shop: string,
  productId: string,
): Promise<DeliveryRule | null> {
  if (!shop || typeof shop !== "string") throw new Error("Shop is required");
  if (!productId || typeof productId !== "string") {
    throw new Error("Product ID is required");
  }

  return prisma.deliveryRule.findFirst({
    where: {
      shop: shop.trim().toLowerCase(),
      type: "PRODUCT",
      enabled: true,
      targets: { some: { targetType: "PRODUCT", targetId: productId } },
    },
    orderBy: [...RESOLUTION_ORDER_BY],
  });
}

export async function findEnabledCollectionRule(
  shop: string,
  collectionIds: string[],
): Promise<DeliveryRule | null> {
  if (!shop || typeof shop !== "string") throw new Error("Shop is required");
  if (!Array.isArray(collectionIds) || collectionIds.length === 0) return null;

  return prisma.deliveryRule.findFirst({
    where: {
      shop: shop.trim().toLowerCase(),
      type: "COLLECTION",
      enabled: true,
      targets: {
        some: { targetType: "COLLECTION", targetId: { in: collectionIds } },
      },
    },
    orderBy: [...RESOLUTION_ORDER_BY],
  });
}

export async function findEnabledDefaultRule(
  shop: string,
): Promise<DeliveryRule | null> {
  if (!shop || typeof shop !== "string") throw new Error("Shop is required");

  return prisma.deliveryRule.findFirst({
    where: { shop: shop.trim().toLowerCase(), type: "DEFAULT", enabled: true },
    orderBy: [...RESOLUTION_ORDER_BY],
  });
}

export async function createRule(
  data: CreateRuleData,
): Promise<DeliveryRuleWithTargets> {
  const shop = data.shop.trim().toLowerCase();
  if (!shop) throw new Error("Shop is required");

  try {
    return await prisma.$transaction(async (tx) => {
      if (data.type === "DEFAULT") {
        const existing = await tx.deliveryRule.findFirst({
          where: { shop, type: "DEFAULT" },
          select: { id: true },
        });
        if (existing) throw new DuplicateDefaultRuleError(shop);
      }

      return tx.deliveryRule.create({
        data: {
          shop,
          defaultShopKey: data.type === "DEFAULT" ? shop : null,
          name: data.name,
          type: data.type,
          processingDays: data.processingDays,
          minDeliveryDays: data.minDeliveryDays,
          maxDeliveryDays: data.maxDeliveryDays,
          excludedDays: data.excludedDays,
          customMessage: data.customMessage,
          enabled: data.enabled,
          targets:
            data.targetIds.length > 0
              ? {
                  create: data.targetIds.map((targetId) => ({
                    targetType:
                      data.type === "PRODUCT" ? "PRODUCT" : "COLLECTION",
                    targetId,
                  })),
                }
              : undefined,
        },
        include: { targets: true },
      });
    });
  } catch (error) {
    if (data.type === "DEFAULT" && isUniqueConstraintError(error)) {
      throw new DuplicateDefaultRuleError(shop);
    }
    throw error;
  }
}

/**
 * Update a rule and replace its targets atomically.
 * Ownership is verified inside the transaction; switching to DEFAULT
 * is rejected when another DEFAULT already exists for the shop.
 * DEFAULT rules always end with zero targets.
 */
export async function updateRule(
  shop: string,
  id: string,
  data: Omit<CreateRuleData, "shop">,
): Promise<DeliveryRuleWithTargets> {
  const normalizedShop = shop.trim().toLowerCase();
  if (!normalizedShop) throw new Error("Shop is required");
  if (!id || typeof id !== "string") throw new Error("Rule ID is required");

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.deliveryRule.findFirst({
        where: { id, shop: normalizedShop },
        select: { id: true, type: true },
      });
      if (!existing) throw new RuleNotFoundError(id);

      if (data.type === "DEFAULT" && existing.type !== "DEFAULT") {
        const clash = await tx.deliveryRule.findFirst({
          where: {
            shop: normalizedShop,
            type: "DEFAULT",
            id: { not: id },
          },
          select: { id: true },
        });
        if (clash) throw new DuplicateDefaultRuleError(normalizedShop);
      }

      return tx.deliveryRule.update({
        where: { id },
        data: {
          defaultShopKey:
            data.type === "DEFAULT" ? normalizedShop : null,
          name: data.name,
          type: data.type,
          processingDays: data.processingDays,
          minDeliveryDays: data.minDeliveryDays,
          maxDeliveryDays: data.maxDeliveryDays,
          excludedDays: data.excludedDays,
          customMessage: data.customMessage,
          enabled: data.enabled,
          targets: {
            deleteMany: {},
            create: data.targetIds.map((targetId) => ({
              targetType: data.type === "PRODUCT" ? "PRODUCT" : "COLLECTION",
              targetId,
            })),
          },
        },
        include: { targets: true },
      });
    });
  } catch (error) {
    if (data.type === "DEFAULT" && isUniqueConstraintError(error)) {
      throw new DuplicateDefaultRuleError(normalizedShop);
    }
    throw error;
  }
}

/**
 * Delete a rule scoped to its shop. Targets go via the FK cascade.
 */
export async function deleteRuleForShop(
  shop: string,
  id: string,
): Promise<{ id: string; name: string }> {
  const normalizedShop = shop.trim().toLowerCase();
  if (!normalizedShop) throw new Error("Shop is required");
  if (!id || typeof id !== "string") throw new Error("Rule ID is required");

  return prisma.$transaction(async (tx) => {
    const existing = await tx.deliveryRule.findFirst({
      where: { id, shop: normalizedShop },
      select: { id: true, name: true },
    });
    if (!existing) throw new RuleNotFoundError(id);

    await tx.deliveryRule.delete({ where: { id } });
    return { id: existing.id, name: existing.name };
  });
}

/**
 * Flip only the enabled flag, scoped to the shop.
 * Ownership check and write happen in one transaction.
 */
export async function toggleRuleEnabled(
  shop: string,
  id: string,
): Promise<DeliveryRuleWithTargets> {
  const normalizedShop = shop.trim().toLowerCase();
  if (!normalizedShop) throw new Error("Shop is required");
  if (!id || typeof id !== "string") throw new Error("Rule ID is required");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.deliveryRule.findFirst({
      where: { id, shop: normalizedShop },
      select: { id: true, enabled: true },
    });
    if (!existing) throw new RuleNotFoundError(id);

    return tx.deliveryRule.update({
      where: { id },
      data: { enabled: !existing.enabled },
      include: { targets: true },
    });
  });
}
