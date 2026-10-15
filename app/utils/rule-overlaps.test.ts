import { describe, expect, it } from "vitest";
import { findRuleOverlaps, type OverlapCandidate } from "./rule-overlaps";

const OLD = "2026-01-01T00:00:00.000Z";
const NEW = "2026-06-01T00:00:00.000Z";

function other(partial: Partial<OverlapCandidate>): OverlapCandidate {
  return {
    id: "other",
    name: "Other",
    type: "DEFAULT",
    countries: "",
    enabled: true,
    createdAt: OLD,
    targetIds: [],
    ...partial,
  };
}

const newDefault = {
  id: null,
  type: "DEFAULT" as const,
  countries: ["FR"],
  targetIds: [],
  enabled: true,
  createdAt: null,
};

describe("findRuleOverlaps", () => {
  it("reports shared countries; a new rule wins", () => {
    const result = findRuleOverlaps(newDefault, [
      other({ name: "Default EU", countries: "DE,FR" }),
    ]);
    expect(result).toEqual([
      { id: "other", name: "Default EU", countries: ["FR"], thisRuleWins: true },
    ]);
  });

  it("ignores country vs all-countries, other countries, other levels and inactive rules", () => {
    expect(
      findRuleOverlaps(newDefault, [
        other({ id: "a", countries: "" }),
        other({ id: "b", countries: "DE" }),
        other({ id: "c", countries: "FR", type: "PRODUCT" }),
        other({ id: "d", countries: "FR", enabled: false }),
      ]),
    ).toEqual([]);
    expect(
      findRuleOverlaps({ ...newDefault, countries: [] }, [other({})]),
    ).toEqual([]);
    expect(
      findRuleOverlaps({ ...newDefault, enabled: false }, [
        other({ countries: "FR" }),
      ]),
    ).toEqual([]);
  });

  it("needs a shared product for product rules", () => {
    const rule = {
      id: "mine",
      type: "PRODUCT" as const,
      countries: [],
      targetIds: ["gid://shopify/Product/1"],
      enabled: true,
      createdAt: OLD,
    };
    const shared = other({
      type: "PRODUCT",
      createdAt: NEW,
      targetIds: ["gid://shopify/Product/1", "gid://shopify/Product/2"],
    });
    const unrelated = other({
      id: "x",
      type: "PRODUCT",
      targetIds: ["gid://shopify/Product/3"],
    });
    expect(findRuleOverlaps(rule, [shared, unrelated])).toEqual([
      { id: "other", name: "Other", countries: [], thisRuleWins: false },
    ]);
  });

  it("skips the rule itself and breaks time ties by id", () => {
    const rule = { ...newDefault, id: "b", createdAt: OLD };
    expect(
      findRuleOverlaps(rule, [
        other({ id: "b", countries: "FR" }),
        other({ id: "a", countries: "FR" }),
      ]),
    ).toEqual([
      { id: "a", name: "Other", countries: ["FR"], thisRuleWins: true },
    ]);
  });
});
