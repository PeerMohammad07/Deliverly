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

export interface ZonedNow {
  /** Today's calendar date in the time zone, as a local-midnight Date. */
  date: Date;
  /** Wall-clock seconds since midnight in the time zone. */
  secondsOfDay: number;
}

/**
 * Current calendar date plus wall-clock time in a time zone. The
 * cutoff check needs the time of day, not just the date.
 */
export function getZonedNow(now: Date, timeZone: string): ZonedNow {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
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
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const [year, month, day, hour, minute, second] = (
    ["year", "month", "day", "hour", "minute", "second"] as const
  ).map(value);

  if (
    ![year, month, day, hour, minute, second].every((n) => Number.isInteger(n))
  ) {
    throw new Error("Couldn’t resolve the current time");
  }

  return {
    date: new Date(year, month - 1, day),
    // Some engines report midnight as hour 24 even with h23.
    secondsOfDay: (hour % 24) * 3600 + minute * 60 + second,
  };
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

export const MINUTES_PER_DAY = 24 * 60;

export interface OrderStart {
  /** Date the order counts as placed on, before working-day roll-forward. */
  from: Date;
  /** Seconds until today's cutoff, or null when no countdown applies. */
  secondsToCutoff: number | null;
}

/**
 * Apply an order cutoff time. Before the cutoff on a working day the
 * order counts as placed today; at or after it, it counts as placed
 * tomorrow (calculateDeliveryRange then rolls past days off).
 *
 * The countdown only runs on a working day before its cutoff — never
 * "Order within 2d 4h". It uses wall-clock time, so on a daylight-saving
 * change between now and the cutoff it can be off by that hour.
 */
export function resolveOrderStart(input: {
  now: ZonedNow;
  cutoffMinutes: number | null | undefined;
  excludedDays: Set<number>;
}): OrderStart {
  const { now, cutoffMinutes, excludedDays } = input;
  const today = new Date(now.date);
  if (
    cutoffMinutes === null ||
    cutoffMinutes === undefined ||
    !Number.isInteger(cutoffMinutes) ||
    cutoffMinutes < 0 ||
    cutoffMinutes >= MINUTES_PER_DAY
  ) {
    return { from: today, secondsToCutoff: null };
  }
  // A day off already rolls forward to the next working day, and that
  // day's cutoff is more than "today" away — no countdown.
  if (isExcluded(today, excludedDays)) {
    return { from: today, secondsToCutoff: null };
  }

  const secondsLeft = cutoffMinutes * 60 - now.secondsOfDay;
  if (secondsLeft > 0) {
    return { from: today, secondsToCutoff: secondsLeft };
  }
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { from: tomorrow, secondsToCutoff: null };
}

/** "2:00 PM" for 840 minutes after midnight. */
export function formatCutoffTime(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const period = hours < 12 ? "AM" : "PM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${String(mins).padStart(2, "0")} ${period}`;
}

export type CutoffPeriod = "AM" | "PM";

export interface CutoffParts {
  /** 1–12 */
  hour: number;
  /** 0–59 */
  minute: number;
  period: CutoffPeriod;
}

/** 840 → { hour: 2, minute: 0, period: "PM" }. */
export function splitCutoffMinutes(minutes: number): CutoffParts {
  const hours = Math.floor(minutes / 60) % 24;
  return {
    hour: hours % 12 === 0 ? 12 : hours % 12,
    minute: minutes % 60,
    period: hours < 12 ? "AM" : "PM",
  };
}

/**
 * Hour (1–12), minute (0–59) and AM/PM as typed by the merchant →
 * minutes after midnight. null when either number is out of range.
 */
export function joinCutoffTime(
  hour: string,
  minute: string,
  period: CutoffPeriod,
): number | null {
  const h = hour.trim() === "" ? NaN : Number(hour);
  const m = minute.trim() === "" ? NaN : Number(minute);
  if (!Number.isInteger(h) || h < 1 || h > 12) return null;
  if (!Number.isInteger(m) || m < 0 || m > 59) return null;
  return ((h % 12) + (period === "PM" ? 12 : 0)) * 60 + m;
}

export const COUNTDOWN_TOKEN = "{countdown}";

/**
 * "3h 20m" / "45m". Rounds up so the last minute reads "1m", not "0m".
 * Mirrored in storefront/deliverly-eta.js.
 */
export function formatCountdown(seconds: number): string {
  const totalMinutes = Math.max(1, Math.ceil(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
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
  /**
   * Before the store's cutoff, use countdownPrefix instead of prefix.
   * Off unless the merchant turns it on.
   */
  countdown: boolean;
  /**
   * Opening text while the countdown runs, in the same sentence as the
   * dates: "Order within {countdown} to get it between Oct 14 and Oct 16."
   */
  countdownPrefix: string;
}

export const DEFAULT_COUNTDOWN_PREFIX = `Order within ${COUNTDOWN_TOKEN} to get it between`;

export const DEFAULT_MESSAGE_PARTS: DeliveryMessageParts = {
  prefix: "Estimated delivery between",
  separator: " and ",
  suffix: ".",
  dateStyle: "long",
  countdown: false,
  countdownPrefix: DEFAULT_COUNTDOWN_PREFIX,
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
        countdown?: unknown;
        countdownPrefix?: unknown;
      };
      // Countdown fields were added later; older rows have neither.
      return {
        prefix: p.prefix,
        separator: p.separator,
        suffix: p.suffix,
        dateStyle: p.dateStyle,
        countdown: p.countdown === true,
        countdownPrefix:
          typeof p.countdownPrefix === "string" &&
          p.countdownPrefix.includes(COUNTDOWN_TOKEN)
            ? p.countdownPrefix
            : DEFAULT_COUNTDOWN_PREFIX,
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

/**
 * The before-cutoff sentence, with {countdown} left in for the
 * storefront to fill and tick. null when the rule has no countdown
 * (or uses a legacy plain-text message).
 */
export function renderCountdownMessage(
  stored: string,
  minDate: Date,
  maxDate: Date,
): string | null {
  const parts = parseStoredMessage(stored);
  if (!parts?.countdown || !parts.countdownPrefix.includes(COUNTDOWN_TOKEN)) {
    return null;
  }
  const min = formatStorefrontDateWithStyle(minDate, parts.dateStyle);
  const max = formatStorefrontDateWithStyle(maxDate, parts.dateStyle);
  return composeDeliveryMessage(
    { ...parts, prefix: parts.countdownPrefix },
    min,
    max,
  );
}
