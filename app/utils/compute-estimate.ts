import {
  calculateDeliveryRange,
  getZonedNow,
  parseExcludedDays,
  renderCountdownMessage,
  renderStoredMessage,
  resolveOrderStart,
  toDateOnlyString,
} from "./delivery-dates";

/** The rule fields the date math needs. */
export interface EstimateRule {
  processingDays: number;
  minDeliveryDays: number;
  maxDeliveryDays: number;
  /** Stored form ("[0,6]") or a list of weekdays (0 = Sunday). */
  excludedDays: string | number[];
  /** Minutes after midnight in the shop's time zone; null = no cutoff. */
  cutoffMinutes: number | null;
  /** Stored message (see serializeMessageParts). */
  customMessage: string;
}

export interface Estimate {
  message: string;
  /** "YYYY-MM-DD" */
  minDate: string;
  maxDate: string;
  /** Set only while an order can still make today's cutoff. */
  countdown: { secondsLeft: number; message: string } | null;
}

/**
 * One rule → the shopper's estimate, at `now` in the shop's time zone:
 * shop-time "now" → cutoff → date range → message. Shared by the server
 * and the storefront widget so both always show the same dates.
 * Throws when the rule can't produce a range (e.g. no working days).
 */
export function computeEstimate(
  rule: EstimateRule,
  now: Date,
  timeZone: string,
): Estimate {
  const excludedDays = parseExcludedDays(rule.excludedDays);
  const start = resolveOrderStart({
    now: getZonedNow(now, timeZone),
    cutoffMinutes: rule.cutoffMinutes,
    excludedDays,
  });
  const { minDate, maxDate } = calculateDeliveryRange({
    from: start.from,
    processingDays: rule.processingDays,
    minShippingDays: rule.minDeliveryDays,
    maxShippingDays: rule.maxDeliveryDays,
    excludedDays,
  });

  const countdownMessage =
    start.secondsToCutoff !== null
      ? renderCountdownMessage(rule.customMessage, minDate, maxDate)
      : null;

  return {
    message: renderStoredMessage(rule.customMessage, minDate, maxDate),
    minDate: toDateOnlyString(minDate),
    maxDate: toDateOnlyString(maxDate),
    countdown:
      countdownMessage !== null && start.secondsToCutoff !== null
        ? { secondsLeft: start.secondsToCutoff, message: countdownMessage }
        : null,
  };
}
