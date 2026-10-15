/**
 * Countries a delivery rule can be limited to. Codes are Shopify's
 * CountryCode values (ISO 3166-1 alpha-2 plus AC, TA and XK), which is
 * what the storefront reports as localization.country.iso_code. Left
 * out: ZZ (unknown region) and AN (Netherlands Antilles, dissolved;
 * Intl names it "Curaçao", the same as CW).
 *
 * Rules store their countries as one sorted, comma-separated string
 * ("DE,FR"). An empty string means all countries.
 */
export const COUNTRY_CODES: readonly string[] = [
  "AC", "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AR", "AT", "AU",
  "AW", "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ",
  "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ",
  "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO",
  "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO",
  "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FO",
  "FR", "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN",
  "GP", "GQ", "GR", "GS", "GT", "GW", "GY", "HK", "HM", "HN", "HR", "HT",
  "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE",
  "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW",
  "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV",
  "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MK", "ML", "MM", "MN", "MO",
  "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC",
  "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA",
  "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PS", "PT", "PY", "QA",
  "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD", "SE", "SG", "SH",
  "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX",
  "SY", "SZ", "TA", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM",
  "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY",
  "UZ", "VA", "VC", "VE", "VG", "VN", "VU", "WF", "WS", "XK", "YE", "YT",
  "ZA", "ZM", "ZW",
];

const COUNTRY_CODE_SET: ReadonlySet<string> = new Set(COUNTRY_CODES);

/** Normalize one value to a known country code, or null. */
export function toCountryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return COUNTRY_CODE_SET.has(code) ? code : null;
}

/**
 * Parse stored countries ("DE,FR") or a list of codes into sorted,
 * de-duplicated known codes. Unknown values are dropped. [] = all
 * countries.
 */
export function parseCountries(raw: unknown): string[] {
  const parts = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(",")
      : [];
  const codes = new Set<string>();
  for (const part of parts) {
    const code = toCountryCode(part);
    if (code) codes.add(code);
  }
  return [...codes].sort();
}

/** Store a list of codes as "DE,FR"; "" for none (all countries). */
export function serializeCountries(codes: Iterable<string>): string {
  return parseCountries([...codes]).join(",");
}

export { hasCountry } from "./country-match";

let regionNames: Intl.DisplayNames | null | undefined;

/** English country name for a code, or the code itself if unknown. */
export function countryName(code: string): string {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Short label for a rule's countries: "All countries", "France",
 * "France, Germany" or "France, Germany +3".
 */
export function formatCountries(raw: unknown, shown = 2): string {
  const codes = parseCountries(raw);
  if (codes.length === 0) return "All countries";
  const names = codes.map(countryName).sort((a, b) => a.localeCompare(b));
  const head = names.slice(0, shown).join(", ");
  const rest = names.length - shown;
  return rest > 0 ? `${head} +${rest}` : head;
}
