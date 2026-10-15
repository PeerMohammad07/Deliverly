import { describe, expect, it } from "vitest";
import {
  isCollectionGid,
  isProductGid,
  parseRuleFormData,
  validateRuleInput,
  type RuleFormInput,
} from "./deliveryRule.validator";

const BASE: Partial<RuleFormInput> = {
  name: "Standard",
  type: "DEFAULT",
  processingDays: 1,
  minDeliveryDays: 3,
  maxDeliveryDays: 5,
  excludedDays: [0, 6],
  cutoffMinutes: null,
  msgPrefix: "",
  msgSeparator: " – ",
  msgSuffix: "",
  dateStyle: "short",
  countdown: false,
  countdownPrefix: "",
  enabled: true,
  targetIds: [],
};

describe("validateRuleInput countries", () => {
  it("treats missing countries as all countries", () => {
    const checked = validateRuleInput(BASE);
    expect(checked.valid).toBe(true);
    expect(checked.value?.countries).toEqual([]);
  });

  it("normalizes, sorts and de-duplicates country codes", () => {
    const checked = validateRuleInput({
      ...BASE,
      countries: ["fr", "DE", "FR"],
    });
    expect(checked.valid).toBe(true);
    expect(checked.value?.countries).toEqual(["DE", "FR"]);
  });

  it("rejects unknown country codes", () => {
    const checked = validateRuleInput({ ...BASE, countries: ["FR", "XX"] });
    expect(checked.valid).toBe(false);
    expect(checked.errors.countries).toBe("Choose countries from the list.");
  });
});

describe("parseRuleFormData countries", () => {
  it("reads the comma-separated countries field", () => {
    const fd = new FormData();
    fd.set("countries", "FR, DE,");
    expect(parseRuleFormData(fd).countries).toEqual(["FR", "DE"]);
  });

  it("reads a missing field as no countries", () => {
    expect(parseRuleFormData(new FormData()).countries).toEqual([]);
  });
});

describe("isProductGid / isCollectionGid", () => {
  it("accepts numeric Shopify IDs only", () => {
    expect(isProductGid("gid://shopify/Product/8123456789")).toBe(true);
    expect(isProductGid("gid://shopify/Product/abc")).toBe(false);
    expect(isProductGid("gid://shopify/Product/1?x=1")).toBe(false);
    expect(isProductGid("gid://shopify/Product/" + "1".repeat(21))).toBe(false);
    expect(isCollectionGid("gid://shopify/Collection/42")).toBe(true);
    expect(isCollectionGid("gid://shopify/Product/42")).toBe(false);
  });
});
