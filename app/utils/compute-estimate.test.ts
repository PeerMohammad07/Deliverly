import { describe, expect, it } from "vitest";
import { computeEstimate, type EstimateRule } from "./compute-estimate";
import { DEFAULT_MESSAGE_PARTS, serializeMessageParts } from "./delivery-dates";

// Wednesday 2026-10-14, 12:00 UTC.
const NOW = new Date("2026-10-14T12:00:00Z");

const RULE: EstimateRule = {
  processingDays: 1,
  minDeliveryDays: 3,
  maxDeliveryDays: 5,
  excludedDays: "[0,6]",
  cutoffMinutes: null,
  customMessage: serializeMessageParts({
    ...DEFAULT_MESSAGE_PARTS,
    countdown: true,
  }),
};

describe("computeEstimate", () => {
  it("works out the range in the shop's time zone", () => {
    const estimate = computeEstimate(RULE, NOW, "UTC");
    expect(estimate.minDate).toBe("2026-10-20");
    expect(estimate.maxDate).toBe("2026-10-22");
    expect(estimate.message).toContain("Oct");
    expect(estimate.countdown).toBeNull();
  });

  it("accepts excluded days as a list", () => {
    expect(
      computeEstimate({ ...RULE, excludedDays: [0, 6] }, NOW, "UTC"),
    ).toEqual(computeEstimate(RULE, NOW, "UTC"));
  });

  it("counts down before the cutoff", () => {
    const estimate = computeEstimate(
      { ...RULE, cutoffMinutes: 14 * 60 },
      NOW,
      "UTC",
    );
    expect(estimate.countdown?.secondsLeft).toBe(2 * 3600);
    expect(estimate.minDate).toBe("2026-10-20");
  });

  it("starts the next day after the cutoff", () => {
    const estimate = computeEstimate(
      { ...RULE, cutoffMinutes: 10 * 60 },
      NOW,
      "UTC",
    );
    expect(estimate.countdown).toBeNull();
    expect(estimate.minDate).toBe("2026-10-21");
    expect(estimate.maxDate).toBe("2026-10-23");
  });

  it("uses the shop's day, not UTC's", () => {
    // 12:00 UTC on Wednesday is already Thursday 01:00 in Auckland.
    const estimate = computeEstimate(RULE, NOW, "Pacific/Auckland");
    expect(estimate.minDate).toBe("2026-10-21");
  });
});
