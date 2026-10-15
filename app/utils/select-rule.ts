import { pickRule } from "./pick-rule";

export interface SelectableRule {
  type: "PRODUCT" | "COLLECTION" | "DEFAULT";
  /** Product or collection IDs, in the same form as the context's IDs. */
  targets: readonly string[];
  /** Stored countries ("DE,FR"); "" = all countries. */
  countries: string;
}

/**
 * Pick the rule for a product from all of a shop's enabled rules
 * (newest first), the same order the server uses:
 *   product → collection → default,
 * and within each level the shopper's country before all countries.
 */
export function selectRule<T extends SelectableRule>(
  rules: readonly T[],
  context: {
    productId: string;
    collectionIds: readonly string[];
    country: string | null;
  },
): T | null {
  const collections = new Set(context.collectionIds);
  const levels: Array<(rule: T) => boolean> = [
    (rule) => rule.type === "PRODUCT" && rule.targets.includes(context.productId),
    (rule) =>
      rule.type === "COLLECTION" && rule.targets.some((id) => collections.has(id)),
    (rule) => rule.type === "DEFAULT",
  ];
  for (const inLevel of levels) {
    const rule = pickRule(rules.filter(inLevel), context.country);
    if (rule) return rule;
  }
  return null;
}
