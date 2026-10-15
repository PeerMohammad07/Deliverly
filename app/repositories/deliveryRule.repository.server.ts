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
  cutoffMinutes: number | null;
  /** Serialized ISO country codes ("DE,FR"); "" = all countries. */
  countries: string;
  customMessage: string;
  enabled: boolean;
  targetIds: string[];
}

/**
 * Thrown when a second all-countries DEFAULT rule is created for a shop.
 * The unique defaultShopKey index (set only on that rule) enforces this
 * in the database, so two simultaneous requests can't both succeed.
 * DEFAULT rules limited to countries aren't limited.
 */
export class DuplicateDefaultRuleError extends Error {
  constructor(
    shop: string,
    /** The shop's existing all-countries default, when it could be found. */
    readonly existing: { id: string; name: string; enabled: boolean } | null,
  ) {
    super(`Shop "${shop}" already has an all-countries default rule`);
    this.name = "DuplicateDefaultRuleError";
  }
}

/** The rule holding the shop's all-countries default slot, if any. */
async function findAllCountriesDefault(shop: string) {
  try {
    return await prisma.deliveryRule.findFirst({
      where: { defaultShopKey: shop },
      select: { id: true, name: true, enabled: true },
    });
  } catch {
    return null;
  }
}

export class RuleNotFoundError extends Error {
  constructor(id: string) {
    super(`Delivery rule "${id}" was not found`);
    this.name = "RuleNotFoundError";
  }
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return hasPrismaCode(error, "P2002");
}

/** Prisma's "record to update/delete not found". */
function isRecordNotFoundError(error: unknown): boolean {
  return hasPrismaCode(error, "P2025");
}

/*
 * Cloudflare D1 doesn't support transactions: Prisma runs the queries of
 * a transaction one by one anyway. So writes here don't rely on them.
 * Ownership is part of each write's WHERE (id + shop), and the single
 * all-countries DEFAULT rule per shop is a unique index. Updating a rule's
 * targets only deletes the dropped ones and inserts the new ones, so
 * targets kept across the edit are never touched.
 */

/** The unique key that allows one all-countries DEFAULT rule per shop. */
function defaultShopKey(
  shop: string,
  type: CreateRuleData["type"],
  countries: string,
): string | null {
  return type === "DEFAULT" && countries === "" ? shop : null;
}

function targetKey(target: { targetType: string; targetId: string }): string {
  return `${target.targetType}:${target.targetId}`;
}

function targetRows(
  ruleId: string,
  type: CreateRuleData["type"],
  targetIds: string[],
) {
  return targetIds.map((targetId) => ({
    ruleId,
    targetType:
      type === "PRODUCT" ? ("PRODUCT" as const) : ("COLLECTION" as const),
    targetId,
  }));
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

  // Reads only, so they don't need a transaction (D1 has none anyway).
  const [rules, filteredTotal, total, active] = await Promise.all([
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
 * Resolution finders. Each returns a shop's ENABLED rules for one level,
 * newest first — the building blocks of PRODUCT → COLLECTION → DEFAULT
 * precedence. The caller picks among them by country (see pickRule), so
 * a level costs one query whatever the countries are. Targets are
 * intentionally NOT included: the date-calculation step only needs the
 * rule's timing/message fields.
 */
const RESOLUTION_ORDER_BY = [{ createdAt: "desc" }, { id: "desc" }] as const;

export async function findEnabledProductRules(
  shop: string,
  productId: string,
): Promise<DeliveryRule[]> {
  if (!shop || typeof shop !== "string") throw new Error("Shop is required");
  if (!productId || typeof productId !== "string") {
    throw new Error("Product ID is required");
  }

  return prisma.deliveryRule.findMany({
    where: {
      shop: shop.trim().toLowerCase(),
      type: "PRODUCT",
      enabled: true,
      targets: { some: { targetType: "PRODUCT", targetId: productId } },
    },
    orderBy: [...RESOLUTION_ORDER_BY],
  });
}

export async function findEnabledCollectionRules(
  shop: string,
  collectionIds: string[],
): Promise<DeliveryRule[]> {
  if (!shop || typeof shop !== "string") throw new Error("Shop is required");
  if (!Array.isArray(collectionIds) || collectionIds.length === 0) return [];

  return prisma.deliveryRule.findMany({
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

export async function findEnabledDefaultRules(
  shop: string,
): Promise<DeliveryRule[]> {
  if (!shop || typeof shop !== "string") throw new Error("Shop is required");

  return prisma.deliveryRule.findMany({
    where: { shop: shop.trim().toLowerCase(), type: "DEFAULT", enabled: true },
    orderBy: [...RESOLUTION_ORDER_BY],
  });
}

export async function createRule(
  data: CreateRuleData,
): Promise<DeliveryRuleWithTargets> {
  const shop = data.shop.trim().toLowerCase();
  if (!shop) throw new Error("Shop is required");

  let ruleId: string;
  try {
    ({ id: ruleId } = await prisma.deliveryRule.create({
      data: {
        shop,
        defaultShopKey: defaultShopKey(shop, data.type, data.countries),
        name: data.name,
        type: data.type,
        processingDays: data.processingDays,
        minDeliveryDays: data.minDeliveryDays,
        maxDeliveryDays: data.maxDeliveryDays,
        excludedDays: data.excludedDays,
        cutoffMinutes: data.cutoffMinutes,
        countries: data.countries,
        customMessage: data.customMessage,
        enabled: data.enabled,
      },
      select: { id: true },
    }));
  } catch (error) {
    if (data.type === "DEFAULT" && isUniqueConstraintError(error)) {
      throw new DuplicateDefaultRuleError(
        shop,
        await findAllCountriesDefault(shop),
      );
    }
    throw error;
  }

  if (data.type !== "DEFAULT" && data.targetIds.length > 0) {
    await prisma.ruleTarget.createMany({
      data: targetRows(ruleId, data.type, data.targetIds),
    });
  }

  const rule = await getRuleByIdForShop(shop, ruleId);
  if (!rule) throw new RuleNotFoundError(ruleId);
  return rule;
}

/**
 * Update a rule and replace its targets. The update is scoped to the
 * shop in the database; switching to an all-countries DEFAULT fails on
 * the unique index when the shop already has one. DEFAULT rules always end with zero
 * targets.
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
    await prisma.deliveryRule.update({
      where: { id, shop: normalizedShop },
      data: {
        defaultShopKey: defaultShopKey(
          normalizedShop,
          data.type,
          data.countries,
        ),
        name: data.name,
        type: data.type,
        processingDays: data.processingDays,
        minDeliveryDays: data.minDeliveryDays,
        maxDeliveryDays: data.maxDeliveryDays,
        excludedDays: data.excludedDays,
        cutoffMinutes: data.cutoffMinutes,
        countries: data.countries,
        customMessage: data.customMessage,
        enabled: data.enabled,
      },
      select: { id: true },
    });
  } catch (error) {
    if (isRecordNotFoundError(error)) throw new RuleNotFoundError(id);
    if (data.type === "DEFAULT" && isUniqueConstraintError(error)) {
      throw new DuplicateDefaultRuleError(
        normalizedShop,
        await findAllCountriesDefault(normalizedShop),
      );
    }
    throw error;
  }

  // The rule belongs to this shop (the update above matched it).
  // Only remove dropped targets and add new ones: without transactions,
  // a failed insert then can't leave the rule with no targets at all.
  const wanted = targetRows(
    id,
    data.type,
    data.type === "DEFAULT" ? [] : data.targetIds,
  );
  const wantedKeys = new Set(wanted.map(targetKey));
  const current = await prisma.ruleTarget.findMany({
    where: { ruleId: id },
    select: { id: true, targetType: true, targetId: true },
  });
  const currentKeys = new Set(current.map(targetKey));
  const dropped = current.filter((t) => !wantedKeys.has(targetKey(t)));
  const added = wanted.filter((t) => !currentKeys.has(targetKey(t)));
  if (dropped.length > 0) {
    await prisma.ruleTarget.deleteMany({
      where: { ruleId: id, id: { in: dropped.map((t) => t.id) } },
    });
  }
  if (added.length > 0) {
    await prisma.ruleTarget.createMany({ data: added });
  }

  const rule = await getRuleByIdForShop(normalizedShop, id);
  if (!rule) throw new RuleNotFoundError(id);
  return rule;
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

  try {
    return await prisma.deliveryRule.delete({
      where: { id, shop: normalizedShop },
      select: { id: true, name: true },
    });
  } catch (error) {
    if (isRecordNotFoundError(error)) throw new RuleNotFoundError(id);
    throw error;
  }
}

/**
 * Delete every rule for a shop (shop/redact). Targets go via the FK
 * cascade. Idempotent: returns 0 when nothing is left.
 */
export async function deleteAllRulesForShop(shop: string): Promise<number> {
  const normalizedShop = shop.trim().toLowerCase();
  if (!normalizedShop) throw new Error("Shop is required");

  const { count } = await prisma.deliveryRule.deleteMany({
    where: { shop: normalizedShop },
  });
  return count;
}

/**
 * Flip only the enabled flag, scoped to the shop in the write itself.
 */
export async function toggleRuleEnabled(
  shop: string,
  id: string,
): Promise<DeliveryRuleWithTargets> {
  const normalizedShop = shop.trim().toLowerCase();
  if (!normalizedShop) throw new Error("Shop is required");
  if (!id || typeof id !== "string") throw new Error("Rule ID is required");
  const existing = await prisma.deliveryRule.findFirst({
    where: { id, shop: normalizedShop },
    select: { enabled: true },
  });
  if (!existing) throw new RuleNotFoundError(id);

  try {
    return await prisma.deliveryRule.update({
      where: { id, shop: normalizedShop },
      data: { enabled: !existing.enabled },
      include: { targets: true },
    });
  } catch (error) {
    if (isRecordNotFoundError(error)) throw new RuleNotFoundError(id);
    throw error;
  }
}
