export const DAY_SUNDAY = 0;
export const DAY_SATURDAY = 6;

export interface DeliveryRange {
  minDate: Date;
  maxDate: Date;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getCalendarDateInTimeZone(
  date: Date,
  timeZone: string,
): Date {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("A valid date is required");
  }
  if (typeof timeZone !== "string" || !timeZone.trim()) {
    throw new Error("A valid time zone is required");
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const value = (type: "year" | "month" | "day") =>
    Number(parts.find((part) => part.type === type)?.value);
  const year = value("year");
  const month = value("month");
  const day = value("day");

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    throw new Error("Couldn’t resolve the current date");
  }

  return new Date(year, month - 1, day);
}

function isExcluded(date: Date, excludedDays: Set<number>): boolean {
  return excludedDays.has(date.getDay());
}

/**
 * Parse excludedDays stored as JSON or comma-separated string.
 * Examples: "[0,6]", "0,6", "SAT,SUN", "".
 * Returns a Set of 0-6 (0 = Sunday). Invalid values are ignored.
 */
export function parseExcludedDays(raw: unknown): Set<number> {
  if (!raw) return new Set<number>();
  if (raw instanceof Set) {
    return new Set(
      [...raw].filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
    );
  }
  if (Array.isArray(raw)) {
    return new Set(
      raw
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
    );
  }
  if (typeof raw !== "string") return new Set<number>();

  const trimmed = raw.trim();
  if (!trimmed) return new Set<number>();

  const nameToNum: Record<string, number> = {
    SUN: 0,
    SUNDAY: 0,
    MON: 1,
    MONDAY: 1,
    TUE: 2,
    TUESDAY: 2,
    WED: 3,
    WEDNESDAY: 3,
    THU: 4,
    THURSDAY: 4,
    FRI: 5,
    FRIDAY: 5,
    SAT: 6,
    SATURDAY: 6,
  };

  let parts: string[] = [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parseExcludedDays(parsed);
    }
    if (typeof parsed === "string") {
      parts = parsed.split(",");
    } else if (typeof parsed === "number") {
      parts = [String(parsed)];
    } else {
      parts = trimmed.replace(/[[\\\]"]/g, "").split(",");
    }
  } catch {
    parts = trimmed.replace(/[[\\\]"]/g, "").split(",");
  }

  const out = new Set<number>();
  for (const part of parts) {
    const token = part.trim().toUpperCase();
    if (!token) continue;
    if (token in nameToNum) {
      out.add(nameToNum[token]);
      continue;
    }
    const num = Number(token);
    if (Number.isInteger(num) && num >= 0 && num <= 6) {
      out.add(num);
    }
  }
  return out;
}

export function serializeExcludedDays(days: Set<number> | number[]): string {
  const arr = Array.from(days)
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    .sort((a, b) => a - b);
  return JSON.stringify(arr);
}

/**
 * Derive working days automatically from merchant-chosen excluded days.
 * Merchants only ever configure exclusions — never working days directly.
 */
export function deriveWorkingDays(
  excludedDays: Set<number> | number[] | string | undefined,
): number[] {
  const excluded =
    excludedDays instanceof Set
      ? excludedDays
      : parseExcludedDays(excludedDays ?? []);
  return [0, 1, 2, 3, 4, 5, 6].filter((day) => !excluded.has(day));
}

const SHORT_DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Compact merchant-facing schedule label, collapsing consecutive days:
 * "Mon–Fri", "Mon, Wed, Fri", "Every day", "None".
 */
export function formatDeliveryDays(workingDays: number[]): string {
  const days = [...new Set(workingDays)]
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    .sort((a, b) => a - b);
  if (days.length === 0) return "None";
  if (days.length === 7) return "Every day";

  const runs: number[][] = [];
  for (const day of days) {
    const last = runs[runs.length - 1];
    if (last && day === last[last.length - 1] + 1) {
      last.push(day);
    } else {
      runs.push([day]);
    }
  }
  return runs
    .map((run) =>
      run.length === 1
        ? SHORT_DAY_NAMES[run[0]]
        : `${SHORT_DAY_NAMES[run[0]]}–${SHORT_DAY_NAMES[run[run.length - 1]]}`,
    )
    .join(", ");
}

/**
 * Table-friendly "Excluded days" label from the stored value:
 * "None" when everything delivers, otherwise "Sat, Sun".
 */
export function formatExcludedDaysLabel(
  excludedDays: Set<number> | number[] | string | undefined,
): string {
  const excluded =
    excludedDays instanceof Set
      ? excludedDays
      : parseExcludedDays(excludedDays ?? []);
  if (excluded.size === 0) return "None";
  return [...excluded]
    .sort((a, b) => a - b)
    .map((day) => SHORT_DAY_NAMES[day])
    .join(", ");
}

/**
 * Add N business days to a date, skipping excluded weekdays.
 *
 * Explicit contract:
 * - The start date is first rolled forward to the next working day when
 *   it lands on an excluded day. So 0 days means "today if we operate
 *   today, otherwise the next operating day" — NOT unconditionally today.
 *   Example: Saturday start + Sat/Sun excluded + 0 days → Monday.
 * - N > 0 counts only working days after that rolled-forward start.
 * - Negative or non-integer values throw.
 * - A fully excluded week (all 7 days) throws instead of returning a
 *   silently wrong date — there is no working day to land on.
 */
export function addBusinessDays(
  from: Date,
  businessDays: number,
  excludedDays: Set<number> = new Set([DAY_SUNDAY, DAY_SATURDAY]),
): Date {
  if (!Number.isInteger(businessDays) || businessDays < 0) {
    throw new Error("businessDays must be a non-negative integer");
  }
  if (excludedDays.size >= 7) {
    throw new Error(
      "At least one working day is required (all 7 days are excluded)",
    );
  }
  const current = startOfDay(from);

  // Roll forward if start lands on excluded day (see contract above).
  // Bounded: with at least one working day, 14 steps always suffice.
  let guard = 0;
  while (isExcluded(current, excludedDays) && guard < 14) {
    current.setDate(current.getDate() + 1);
    guard += 1;
  }

  let remaining = businessDays;
  guard = 0;
  while (remaining > 0 && guard < 366 * 3) {
    current.setDate(current.getDate() + 1);
    guard += 1;
    if (!isExcluded(current, excludedDays)) {
      remaining -= 1;
    }
  }
  return current;
}

export interface CalculateRangeInput {
  from?: Date;
  processingDays: number;
  minShippingDays: number;
  maxShippingDays: number;
  excludedDays?: Set<number> | number[] | string;
}

/**
 * Order date → processing → shipping → working-day calculation → ETA range.
 *
 * Zero-day contract (inherited from addBusinessDays): 0 processing days
 * means "ready today if we operate today, otherwise the next operating
 * day". A fully excluded week is rejected up front — see below.
 */
export function calculateDeliveryRange(input: CalculateRangeInput): DeliveryRange {
  const {
    from = new Date(),
    processingDays,
    minShippingDays,
    maxShippingDays,
  } = input;

  for (const [label, value] of [
    ["processingDays", processingDays],
    ["minShippingDays", minShippingDays],
    ["maxShippingDays", maxShippingDays],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative integer`);
    }
  }
  if (minShippingDays > maxShippingDays) {
    throw new Error("minShippingDays must be <= maxShippingDays");
  }

  const excluded =
    input.excludedDays instanceof Set
      ? input.excludedDays
      : parseExcludedDays(input.excludedDays ?? [DAY_SUNDAY, DAY_SATURDAY]);

  if (deriveWorkingDays(excluded).length === 0) {
    throw new Error(
      "At least one working day is required (all 7 days are excluded)",
    );
  }

  const readyDate = addBusinessDays(from, processingDays, excluded);
  const minDate = addBusinessDays(readyDate, minShippingDays, excluded);
  const maxDate = addBusinessDays(readyDate, maxShippingDays, excluded);

  return { minDate, maxDate };
}

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/**
 * Serialize a calculator Date as calendar-day YYYY-MM-DD using LOCAL
 * date parts (not toISOString): the calculator works in day units, so
 * UTC conversion could shift the storefront date across midnight.
 */
export function toDateOnlyString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Storefront-style date, matching the merchant-facing mock:
 * "Sept 17th" (note "Sept", not "Sep", plus ordinal suffix).
 */
export function formatStorefrontDate(date: Date): string {
  const month = new Intl.DateTimeFormat("en-US", { month: "short" }).format(
    date,
  );
  const monthLabel = month === "Sep" ? "Sept" : month;
  const day = date.getDate();
  return `${monthLabel} ${day}${ordinalSuffix(day)}`;
}

/**
 * Storefront-style range: "Sept 17th - Sept 19th" (single date when equal).
 * Ordinal-style shorthand for formatStorefrontRangeWithStyle.
 */
export function formatStorefrontRange(minDate: Date, maxDate: Date): string {
  return formatStorefrontRangeWithStyle(minDate, maxDate, "ordinal");
}

export type StorefrontDateStyle = "long" | "ordinal" | "short" | "weekday";

const DATE_STYLES: readonly StorefrontDateStyle[] = [
  "long",
  "ordinal",
  "short",
  "weekday",
];

export function isStorefrontDateStyle(
  value: unknown,
): value is StorefrontDateStyle {
  return (
    typeof value === "string" &&
    (DATE_STYLES as readonly string[]).includes(value)
  );
}

/**
 * Date appearance for the storefront message. "ordinal" matches the
 * default "Sept 17th" style; "short" gives "Sep 17"; "weekday" gives
 * "Fri, Sep 17".
 */
export function formatStorefrontDateWithStyle(
  date: Date,
  style: StorefrontDateStyle = "ordinal",
): string {
  if (style === "long") {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
    }).format(date);
  }
  if (style === "short") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(date);
  }
  if (style === "weekday") {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(date);
  }
  return formatStorefrontDate(date);
}

export function formatStorefrontRangeWithStyle(
  minDate: Date,
  maxDate: Date,
  style: StorefrontDateStyle = "ordinal",
): string {
  if (startOfDay(minDate).getTime() === startOfDay(maxDate).getTime()) {
    return formatStorefrontDateWithStyle(minDate, style);
  }
  return `${formatStorefrontDateWithStyle(minDate, style)} - ${formatStorefrontDateWithStyle(maxDate, style)}`;
}

export interface DeliveryMessageParts {
  prefix: string;
  separator: string;
  suffix: string;
  dateStyle: StorefrontDateStyle;
}

export const DEFAULT_MESSAGE_PARTS: DeliveryMessageParts = {
  prefix: "Estimated delivery between",
  separator: " and ",
  suffix: ".",
  dateStyle: "long",
};

/**
 * Join two pre-formatted dates with a separator, collapsing to a single
 * date when both sides are equal.
 */
export function composeDeliveryRange(
  minStr: string,
  separator: string,
  maxStr: string,
): string {
  return minStr === maxStr ? minStr : `${minStr}${separator}${maxStr}`;
}

/**
 * Compose "prefix minDate<separator>maxDate suffix" from parts and
 * pre-formatted date strings. Single place the storefront sentence
 * is assembled — preview, admin and storefront all use this.
 */
export function composeDeliveryMessage(
  parts: Pick<DeliveryMessageParts, "prefix" | "separator" | "suffix">,
  minStr: string,
  maxStr: string,
): string {
  const head = parts.prefix.trim();
  const tail = parts.suffix.trim();
  const core = composeDeliveryRange(minStr, parts.separator, maxStr);
  const tailSpace = tail && !/^[,.;:!?]/.test(tail) ? " " : "";
  return `${head ? `${head} ` : ""}${core}${tailSpace}${tail}`;
}

export function serializeMessageParts(parts: DeliveryMessageParts): string {
  return JSON.stringify({ v: 1, ...parts });
}

/**
 * Parse the stored customMessage column. Returns structured parts, or
 * null for legacy plain-text templates (rendered with token fallback).
 */
export function parseStoredMessage(
  stored: string,
): DeliveryMessageParts | null {
  try {
    const parsed: unknown = JSON.parse(stored);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      (parsed as { v?: unknown }).v === 1 &&
      typeof (parsed as { prefix?: unknown }).prefix === "string" &&
      typeof (parsed as { separator?: unknown }).separator === "string" &&
      typeof (parsed as { suffix?: unknown }).suffix === "string" &&
      isStorefrontDateStyle(
        (parsed as { dateStyle?: unknown }).dateStyle,
      )
    ) {
      const p = parsed as {
        prefix: string;
        separator: string;
        suffix: string;
        dateStyle: StorefrontDateStyle;
      };
      return {
        prefix: p.prefix,
        separator: p.separator,
        suffix: p.suffix,
        dateStyle: p.dateStyle,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Render the stored message for real dates. Handles structured JSON
 * and legacy "{min_date} / {max_date} / {dates}" templates.
 */
export function renderStoredMessage(
  stored: string,
  minDate: Date,
  maxDate: Date,
): string {
  const parts = parseStoredMessage(stored);
  if (!parts) {
    const range = formatStorefrontRange(minDate, maxDate);
    const min = formatStorefrontDate(minDate);
    const max = formatStorefrontDate(maxDate);
    return stored
      .split("{min_date}")
      .join(min)
      .split("{max_date}")
      .join(max)
      .split("{dates}")
      .join(range)
      .split("{date}")
      .join(range);
  }
  const min = formatStorefrontDateWithStyle(minDate, parts.dateStyle);
  const max = formatStorefrontDateWithStyle(maxDate, parts.dateStyle);
  return composeDeliveryMessage(parts, min, max);
}
