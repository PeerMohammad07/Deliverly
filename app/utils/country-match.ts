/**
 * Country matching, kept apart from countries.ts so the storefront
 * widget can use it without bundling the full country list.
 */

/** True when stored countries ("DE,FR") include `country`; "" includes none. */
export function hasCountry(stored: string, country: string): boolean {
  return stored.split(",").includes(country);
}
