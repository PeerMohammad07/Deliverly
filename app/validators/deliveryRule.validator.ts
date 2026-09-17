/**
 * Validation for DeliveryRule create/update.
 * Pure functions — safe to reuse client + server.
 * Server must always re-validate (never trust client alone).
 */

import {
  DEFAULT_MESSAGE_PARTS,
  isStorefrontDateStyle,
  type StorefrontDateStyle,
} from "../utils/delivery-dates";

export type RuleTypeInput = "DEFAULT" | "PRODUCT" | "COLLECTION";

export interface RuleFormInput {
  name: string;
  type: RuleTypeInput;
  processingDays: number;
  minDeliveryDays: number;
  maxDeliveryDays: number;
  excludedDays: number[];
  msgPrefix: string;
  msgSeparator: string;
  msgSuffix: string;
  dateStyle: StorefrontDateStyle;
  enabled: boolean;
  targetIds: string[];
}

export type RuleFormErrors = Partial<Record<keyof RuleFormInput, string>>;

const MAX_NAME_LENGTH = 100;
const MAX_PREFIX_LENGTH = 120;
const MAX_SEPARATOR_LENGTH = 10;
const MAX_SUFFIX_LENGTH = 200;
export const MAX_TARGETS = 50;

const PRODUCT_GID_PATTERN = /^gid:\/\/shopify\/Product\/\S+$/;
const COLLECTION_GID_PATTERN = /^gid:\/\/shopify\/Collection\/\S+$/;

export function isProductGid(value: unknown): value is string {
  return typeof value === "string" && PRODUCT_GID_PATTERN.test(value);
}

export function isCollectionGid(value: unknown): value is string {
  return typeof value === "string" && COLLECTION_GID_PATTERN.test(value);
}

function isIntInRange(value: unknown, min: number, max: number): boolean {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

/**
 * Number("") and Number("  ") are both 0 — trim first so blank
 * input is invalid instead of silently becoming zero.
 */
function toNum(value: unknown): number {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? NaN : Number(trimmed);
  }
  return Number(value);
}

export function validateRuleInput(input: Partial<RuleFormInput>): {
  valid: boolean;
  errors: RuleFormErrors;
  value?: RuleFormInput;
} {
  const errors: RuleFormErrors = {};

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    errors.name = "Give your rule a name, e.g. Standard US.";
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Keep the name under ${MAX_NAME_LENGTH} characters.`;
  }

  const type = input.type;
  if (type !== "DEFAULT" && type !== "PRODUCT" && type !== "COLLECTION") {
    errors.type = "Choose where this rule applies.";
  }

  const processingDays = toNum(input.processingDays);
  if (!isIntInRange(processingDays, 0, 30)) {
    errors.processingDays = "Enter 0–30 days.";
  }

  const minDeliveryDays = toNum(input.minDeliveryDays);
  if (!isIntInRange(minDeliveryDays, 0, 60)) {
    errors.minDeliveryDays = "Enter 0–60 days.";
  }

  const maxDeliveryDays = toNum(input.maxDeliveryDays);
  if (!isIntInRange(maxDeliveryDays, 0, 60)) {
    errors.maxDeliveryDays = "Enter 0–60 days.";
  }

  if (
    errors.minDeliveryDays === undefined &&
    errors.maxDeliveryDays === undefined &&
    Number.isInteger(minDeliveryDays) &&
    Number.isInteger(maxDeliveryDays) &&
    minDeliveryDays > maxDeliveryDays
  ) {
    errors.maxDeliveryDays = "Max must be the same or later than min.";
  }

  const excludedDays = Array.isArray(input.excludedDays)
    ? input.excludedDays.map(Number).filter((n) => Number.isInteger(n))
    : [];
  if (
    !Array.isArray(input.excludedDays) ||
    excludedDays.length !== input.excludedDays.length ||
    new Set(excludedDays).size !== excludedDays.length ||
    excludedDays.some((n) => n < 0 || n > 6)
  ) {
    errors.excludedDays = "Invalid excluded days.";
  } else if (excludedDays.length > 6) {
    errors.excludedDays =
      "Untick at least one day so orders can be delivered.";
  }

  const msgPrefix =
    typeof input.msgPrefix === "string" ? input.msgPrefix.trim() : "";
  if (msgPrefix.length > MAX_PREFIX_LENGTH) {
    errors.msgPrefix = `Keep the opening text under ${MAX_PREFIX_LENGTH} characters.`;
  }

  const msgSeparator =
    typeof input.msgSeparator === "string" ? input.msgSeparator : "";
  if (msgSeparator.length > MAX_SEPARATOR_LENGTH) {
    errors.msgSeparator = `Keep the separator under ${MAX_SEPARATOR_LENGTH} characters.`;
  }

  const msgSuffix =
    typeof input.msgSuffix === "string" ? input.msgSuffix.trim() : "";
  if (msgSuffix.length > MAX_SUFFIX_LENGTH) {
    errors.msgSuffix = `Keep the closing text under ${MAX_SUFFIX_LENGTH} characters.`;
  }

  const dateStyle = isStorefrontDateStyle(input.dateStyle)
    ? input.dateStyle
    : DEFAULT_MESSAGE_PARTS.dateStyle;
  if (!isStorefrontDateStyle(input.dateStyle)) {
    errors.dateStyle = "Pick a date style.";
  }

  // De-duplicated: repeats would otherwise violate the DB unique
  // constraint on (ruleId, targetType, targetId) with a raw 500.
  const targetIds = Array.isArray(input.targetIds)
    ? [
        ...new Set(
          input.targetIds.map((t) => String(t).trim()).filter(Boolean),
        ),
      ]
    : [];

  if (type === "PRODUCT" || type === "COLLECTION") {
    const isKindGid = type === "PRODUCT" ? isProductGid : isCollectionGid;
    if (targetIds.length === 0) {
      errors.targetIds =
        type === "PRODUCT"
          ? "Browse and choose at least one product."
          : "Browse and choose at least one collection.";
    } else if (targetIds.length > MAX_TARGETS) {
      errors.targetIds = `You can add up to ${MAX_TARGETS} targets per rule.`;
    } else if (targetIds.some((t) => t.length > 120)) {
      errors.targetIds = "One of the IDs looks too long.";
    } else if (targetIds.some((t) => !isKindGid(t))) {
      // The picker always returns GIDs — anything else is tampered input.
      // This also guarantees targetType matches the rule type.
      errors.targetIds =
        type === "PRODUCT"
          ? "Each product must be a valid product ID."
          : "Each collection must be a valid collection ID.";
    }
  }

  if (input.enabled !== undefined && typeof input.enabled !== "boolean") {
    errors.enabled = "Invalid rule status.";
  }
  const enabled = input.enabled === undefined ? true : input.enabled === true;

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: {},
    value: {
      name,
      type: type as RuleTypeInput,
      processingDays,
      minDeliveryDays,
      maxDeliveryDays,
      excludedDays,
      msgPrefix,
      msgSeparator,
      msgSuffix,
      dateStyle,
      enabled,
      targetIds: type === "DEFAULT" ? [] : targetIds,
    },
  };
}

/**
 * Parse FormData from React Router action into RuleFormInput shape.
 * Handles checkboxes (excludedDays may repeat) and switch ("on"/"true").
 */
export function parseRuleFormData(formData: FormData): Partial<RuleFormInput> {
  const get = (key: string): string => {
    const v = formData.get(key);
    return typeof v === "string" ? v : "";
  };

  const excludedRaw = formData.getAll("excludedDays").map(String);
  const targetRaw = get("targetIds");

  return {
    name: get("name"),
    type: get("type") as RuleTypeInput,
    processingDays: toNum(get("processingDays")),
    minDeliveryDays: toNum(get("minDeliveryDays")),
    maxDeliveryDays: toNum(get("maxDeliveryDays")),
    // NaN deliberately kept: the validator rejects it instead of
    // silently dropping tampered values.
    excludedDays: excludedRaw.map(toNum),
    msgPrefix: get("msgPrefix"),
    msgSeparator: get("msgSeparator"),
    msgSuffix: get("msgSuffix"),
    dateStyle: get("dateStyle") as RuleFormInput["dateStyle"],
    enabled:
      get("enabled") === "on" ||
      get("enabled") === "true" ||
      get("enabled") === "1",
    targetIds: targetRaw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
