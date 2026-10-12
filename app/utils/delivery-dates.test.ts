import { describe, expect, it } from "vitest";
import {
  calculateDeliveryRange,
  formatCountdown,
  formatCutoffTime,
  getZonedNow,
  joinCutoffTime,
  parseStoredMessage,
  renderCountdownMessage,
  renderStoredMessage,
  resolveOrderStart,
  serializeMessageParts,
  splitCutoffMinutes,
  toDateOnlyString,
  DEFAULT_MESSAGE_PARTS,
} from "./delivery-dates";

const WEEKEND = new Set([0, 6]);
const CUTOFF_2PM = 14 * 60;

/** A ZonedNow for a local calendar date and wall-clock time. */
function at(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return { date: new Date(y, m - 1, d), secondsOfDay: hh * 3600 + mm * 60 };
}

describe("getZonedNow", () => {
  it("reads the date and time in the shop's time zone", () => {
    // 2026-10-09 20:30 UTC is already Oct 10, 02:00 in Kolkata (+5:30).
    const now = getZonedNow(new Date("2026-10-09T20:30:00Z"), "Asia/Kolkata");
    expect(toDateOnlyString(now.date)).toBe("2026-10-10");
    expect(now.secondsOfDay).toBe(2 * 3600);
  });

  it("reports midnight as 0 seconds", () => {
    const now = getZonedNow(new Date("2026-10-10T00:00:00Z"), "UTC");
    expect(now.secondsOfDay).toBe(0);
  });

  it("follows daylight saving time", () => {
    // New York is UTC-4 in July and UTC-5 in January.
    expect(
      getZonedNow(new Date("2026-07-01T18:00:00Z"), "America/New_York")
        .secondsOfDay,
    ).toBe(14 * 3600);
    expect(
      getZonedNow(new Date("2026-01-15T18:00:00Z"), "America/New_York")
        .secondsOfDay,
    ).toBe(13 * 3600);
  });
});

describe("resolveOrderStart", () => {
  it("counts the order as today before the cutoff, with a countdown", () => {
    // Friday 2026-10-09, 10:40.
    const start = resolveOrderStart({
      now: at("2026-10-09", "10:40"),
      cutoffMinutes: CUTOFF_2PM,
      excludedDays: WEEKEND,
    });
    expect(toDateOnlyString(start.from)).toBe("2026-10-09");
    expect(start.secondsToCutoff).toBe(3 * 3600 + 20 * 60);
  });

  it("moves to the next day at or after the cutoff, with no countdown", () => {
    for (const time of ["14:00", "18:30"]) {
      const start = resolveOrderStart({
        now: at("2026-10-08", time),
        cutoffMinutes: CUTOFF_2PM,
        excludedDays: WEEKEND,
      });
      expect(toDateOnlyString(start.from)).toBe("2026-10-09");
      expect(start.secondsToCutoff).toBeNull();
    }
  });

  it("never shows a countdown on a day off", () => {
    // Saturday morning, before the cutoff time.
    const start = resolveOrderStart({
      now: at("2026-10-10", "09:00"),
      cutoffMinutes: CUTOFF_2PM,
      excludedDays: WEEKEND,
    });
    expect(toDateOnlyString(start.from)).toBe("2026-10-10");
    expect(start.secondsToCutoff).toBeNull();
  });

  it("leaves rules without a cutoff unchanged", () => {
    const start = resolveOrderStart({
      now: at("2026-10-08", "23:59"),
      cutoffMinutes: null,
      excludedDays: WEEKEND,
    });
    expect(toDateOnlyString(start.from)).toBe("2026-10-08");
    expect(start.secondsToCutoff).toBeNull();
  });
});

describe("cutoff in the full estimate", () => {
  const rule = { processingDays: 1, minShippingDays: 2, maxShippingDays: 4 };

  function estimate(date: string, time: string) {
    const start = resolveOrderStart({
      now: at(date, time),
      cutoffMinutes: CUTOFF_2PM,
      excludedDays: WEEKEND,
    });
    const range = calculateDeliveryRange({
      ...rule,
      from: start.from,
      excludedDays: WEEKEND,
    });
    return [toDateOnlyString(range.minDate), toDateOnlyString(range.maxDate)];
  }

  it("adds a working day once the cutoff passes", () => {
    // Thursday before the cutoff: ready Fri, delivered Tue–Thu.
    expect(estimate("2026-10-08", "13:59")).toEqual([
      "2026-10-13",
      "2026-10-15",
    ]);
    // Thursday after the cutoff: counts as Friday, ready Mon.
    expect(estimate("2026-10-08", "14:00")).toEqual([
      "2026-10-14",
      "2026-10-16",
    ]);
  });

  it("rolls a Friday-after-cutoff order past the weekend", () => {
    // Counts as Saturday → Monday; ready Tue, delivered Thu–Mon.
    expect(estimate("2026-10-09", "15:00")).toEqual([
      "2026-10-15",
      "2026-10-19",
    ]);
  });
});

describe("formatters", () => {
  it("formats cutoff times", () => {
    expect(formatCutoffTime(0)).toBe("12:00 AM");
    expect(formatCutoffTime(12 * 60)).toBe("12:00 PM");
    expect(formatCutoffTime(CUTOFF_2PM)).toBe("2:00 PM");
    expect(formatCutoffTime(23 * 60 + 30)).toBe("11:30 PM");
  });

  it("turns typed hour, minute and AM/PM into minutes", () => {
    expect(joinCutoffTime("12", "0", "AM")).toBe(0);
    expect(joinCutoffTime("12", "00", "PM")).toBe(12 * 60);
    expect(joinCutoffTime("2", "30", "PM")).toBe(14 * 60 + 30);
    expect(joinCutoffTime("11", "59", "PM")).toBe(23 * 60 + 59);
    for (const [h, m] of [
      ["0", "0"],
      ["13", "0"],
      ["", "0"],
      ["2", "60"],
      ["2", "1.5"],
    ]) {
      expect(joinCutoffTime(h, m, "PM")).toBeNull();
    }
  });

  it("splits minutes back into the fields", () => {
    expect(splitCutoffMinutes(0)).toEqual({
      hour: 12,
      minute: 0,
      period: "AM",
    });
    expect(splitCutoffMinutes(14 * 60 + 30)).toEqual({
      hour: 2,
      minute: 30,
      period: "PM",
    });
  });

  it("formats the countdown, rounding up", () => {
    expect(formatCountdown(3 * 3600 + 20 * 60)).toBe("3h 20m");
    expect(formatCountdown(2 * 3600)).toBe("2h");
    expect(formatCountdown(45 * 60)).toBe("45m");
    expect(formatCountdown(10)).toBe("1m");
    expect(formatCountdown(59 * 60 + 1)).toBe("1h");
  });
});

describe("stored message countdown fields", () => {
  it("defaults to off for messages saved before the countdown existed", () => {
    const legacy = JSON.stringify({
      v: 1,
      prefix: "Arrives",
      separator: " – ",
      suffix: "",
      dateStyle: "short",
    });
    const parts = parseStoredMessage(legacy);
    expect(parts?.countdown).toBe(false);
    expect(parts?.countdownPrefix).toBe(DEFAULT_MESSAGE_PARTS.countdownPrefix);
  });

  it("round-trips the countdown settings", () => {
    const parts = {
      ...DEFAULT_MESSAGE_PARTS,
      countdown: true,
      countdownPrefix: "Order in the next {countdown} for delivery between",
    };
    expect(parseStoredMessage(serializeMessageParts(parts))).toEqual(parts);
  });
});

describe("countdown message", () => {
  const min = new Date(2026, 9, 14);
  const max = new Date(2026, 9, 16);
  const stored = serializeMessageParts({
    ...DEFAULT_MESSAGE_PARTS,
    countdown: true,
  });

  it("puts the countdown and the dates in one sentence", () => {
    expect(renderCountdownMessage(stored, min, max)).toBe(
      "Order within {countdown} to get it between October 14 and October 16.",
    );
  });

  it("keeps the normal sentence for after the cutoff", () => {
    expect(renderStoredMessage(stored, min, max)).toBe(
      "Estimated delivery between October 14 and October 16.",
    );
  });

  it("is null when the rule has the countdown off", () => {
    const off = serializeMessageParts(DEFAULT_MESSAGE_PARTS);
    expect(renderCountdownMessage(off, min, max)).toBeNull();
  });
});
