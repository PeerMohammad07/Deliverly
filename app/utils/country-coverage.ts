import { formatCountries, parseCountries } from "./countries";

/**
 * Shoppers outside every rule's countries get no estimate unless an
 * enabled all-products, all-countries (DEFAULT, countries "") rule
 * catches them. Returns the countries the shop's country rules cover
 * when that fallback is missing, else null.
 */
export function findCountryCoverageGap(
  rules: ReadonlyArray<{ type: string; countries: string; enabled: boolean }>,
): { countries: string[]; label: string } | null {
  const enabled = rules.filter((rule) => rule.enabled);
  const hasFallback = enabled.some(
    (rule) => rule.type === "DEFAULT" && rule.countries === "",
  );
  if (hasFallback) return null;
  const countries = parseCountries(
    enabled.flatMap((rule) => (rule.countries ? rule.countries.split(",") : [])),
  );
  if (countries.length === 0) return null;
  return { countries, label: formatCountries(countries, 3) };
}
