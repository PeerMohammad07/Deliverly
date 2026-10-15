import type { EstimateRule } from "./compute-estimate";
import { parseExcludedDays } from "./delivery-dates";
import type { SelectableRule } from "./select-rule";

/**
 * The storefront config: every enabled rule of a shop, stored as one
 * JSON shop metafield ($app / deliverly_config) and read by the widget,
 * so estimates need no request to our server. D1 stays the source of
 * truth; this is a copy rebuilt from it on every change.
 *
 * Rule fields use the same names as selectRule and computeEstimate, so
 * the widget passes rules straight through. Names and other admin-only
 * fields are left out: merchants can see this JSON in their admin.
 */
export const STOREFRONT_CONFIG_VERSION = 1;

/**
 * Shopify caps JSON metafields at 128 KB (API 2026-04+). Stay below it
 * with some room to spare; a bigger shop keeps using the server route.
 */
export const MAX_STOREFRONT_CONFIG_BYTES = 120_000;

export interface StorefrontConfigRule extends SelectableRule, EstimateRule {
  id: string;
  /** Numeric product or collection IDs ("123"), not GIDs. */
  targets: string[];
  excludedDays: number[];
}

export interface StorefrontConfig {
  v: typeof STOREFRONT_CONFIG_VERSION;
  /** ISO time the config was built. */
  updatedAt: string;
  /** Shop's IANA time zone; dates and cutoffs use it. */
  timezone: string;
  /** Enabled rules, newest first (the order selectRule expects). */
  rules: StorefrontConfigRule[];
}

/** The rule fields the builder reads (a DeliveryRule with targets). */
export interface ConfigSourceRule {
  id: string;
  type: SelectableRule["type"];
  enabled: boolean;
  createdAt: Date;
  countries: string;
  processingDays: number;
  minDeliveryDays: number;
  maxDeliveryDays: number;
  excludedDays: string;
  cutoffMinutes: number | null;
  customMessage: string;
  targets: ReadonlyArray<{ targetId: string }>;
}

export class StorefrontConfigTooLargeError extends Error {
  constructor(readonly bytes: number) {
    super(
      `Storefront config is ${bytes} bytes; the limit is ${MAX_STOREFRONT_CONFIG_BYTES}`,
    );
    this.name = "StorefrontConfigTooLargeError";
  }
}

/** "gid://shopify/Product/123" → "123"; null for anything else. */
export function toNumericId(gid: string): string | null {
  const match = /^gid:\/\/shopify\/(?:Product|Collection)\/(\d+)$/.exec(gid);
  return match ? match[1] : null;
}

/** Newest first; id breaks ties, like the server's resolution queries. */
function newestFirst(a: ConfigSourceRule, b: ConfigSourceRule): number {
  const byTime = b.createdAt.getTime() - a.createdAt.getTime();
  if (byTime !== 0) return byTime;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export function buildStorefrontConfig(input: {
  rules: readonly ConfigSourceRule[];
  timeZone: string;
  now?: Date;
}): StorefrontConfig {
  const rules = input.rules
    .filter((rule) => rule.enabled)
    .sort(newestFirst)
    .map(
      (rule): StorefrontConfigRule => ({
        id: rule.id,
        type: rule.type,
        targets:
          rule.type === "DEFAULT"
            ? []
            : rule.targets
                .map((target) => toNumericId(target.targetId))
                .filter((id): id is string => id !== null),
        countries: rule.countries,
        processingDays: rule.processingDays,
        minDeliveryDays: rule.minDeliveryDays,
        maxDeliveryDays: rule.maxDeliveryDays,
        excludedDays: [...parseExcludedDays(rule.excludedDays)].sort(
          (a, b) => a - b,
        ),
        cutoffMinutes: rule.cutoffMinutes,
        customMessage: rule.customMessage,
      }),
    );

  return {
    v: STOREFRONT_CONFIG_VERSION,
    updatedAt: (input.now ?? new Date()).toISOString(),
    timezone: input.timeZone,
    rules,
  };
}

/**
 * The metafield value for a config. Throws StorefrontConfigTooLargeError
 * when it would not fit in a JSON metafield.
 */
export function serializeStorefrontConfig(config: StorefrontConfig): string {
  const value = JSON.stringify(config);
  const bytes = new TextEncoder().encode(value).length;
  if (bytes > MAX_STOREFRONT_CONFIG_BYTES) {
    throw new StorefrontConfigTooLargeError(bytes);
  }
  return value;
}

function isRule(value: unknown): value is StorefrontConfigRule {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  const count = (n: unknown) => Number.isInteger(n) && (n as number) >= 0;
  return (
    typeof r.id === "string" &&
    (r.type === "PRODUCT" || r.type === "COLLECTION" || r.type === "DEFAULT") &&
    Array.isArray(r.targets) &&
    r.targets.every((t) => typeof t === "string") &&
    typeof r.countries === "string" &&
    count(r.processingDays) &&
    count(r.minDeliveryDays) &&
    count(r.maxDeliveryDays) &&
    Array.isArray(r.excludedDays) &&
    r.excludedDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
    (r.cutoffMinutes === null || count(r.cutoffMinutes)) &&
    typeof r.customMessage === "string"
  );
}

/**
 * Read a config from the metafield (string or parsed JSON). Returns null
 * for anything that isn't a valid config of this version, so the widget
 * shows nothing (or falls back) instead of guessing a date.
 */
export function parseStorefrontConfig(raw: unknown): StorefrontConfig | null {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const config = value as Record<string, unknown>;
  if (
    config.v !== STOREFRONT_CONFIG_VERSION ||
    typeof config.timezone !== "string" ||
    !config.timezone ||
    typeof config.updatedAt !== "string" ||
    !Array.isArray(config.rules) ||
    !config.rules.every(isRule)
  ) {
    return null;
  }
  return value as StorefrontConfig;
}
