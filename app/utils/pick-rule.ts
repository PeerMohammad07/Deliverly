import { hasCountry } from "./country-match";

/**
 * Pick the rule that applies to a shopper's country within one level
 * (product, collection or default). `rules` must be newest first.
 *
 *   1. the newest rule limited to the shopper's country
 *   2. otherwise the newest rule for all countries ("")
 *   3. otherwise null: the caller moves on to the next level
 *
 * Without a known country only all-countries rules apply.
 */
export function pickRule<T extends { countries: string }>(
  rules: readonly T[],
  country: string | null,
): T | null {
  if (country) {
    const forCountry = rules.find((rule) => hasCountry(rule.countries, country));
    if (forCountry) return forCountry;
  }
  return rules.find((rule) => rule.countries === "") ?? null;
}
