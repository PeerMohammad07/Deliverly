import type { DeliveryRule, RuleTarget, RuleType } from "@prisma/client";
import prisma from "../db.server";

export type DeliveryRuleWithTargets = DeliveryRule & {
  targets: RuleTarget[];
};

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
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
}

/**
 * Create a rule + its targets atomically. Caller must already validate
 * and normalize. Shop scoping enforced here — shop is always set server-side.
 */
export async function createRule(
  data: CreateRuleData,
): Promise<DeliveryRuleWithTargets> {
  const shop = data.shop.trim().toLowerCase();
  if (!shop) throw new Error("Shop is required");

  return prisma.deliveryRule.create({
    data: {
      shop,
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
}
