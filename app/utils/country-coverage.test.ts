import { describe, expect, it } from "vitest";
import { findCountryCoverageGap } from "./country-coverage";

const rule = (type: string, countries: string, enabled = true) => ({
  type,
  countries,
  enabled,
});

describe("findCountryCoverageGap", () => {
  it("flags country rules without an all-countries default", () => {
    expect(
      findCountryCoverageGap([rule("DEFAULT", "IN"), rule("PRODUCT", "US,IN")]),
    ).toEqual({ countries: ["IN", "US"], label: "India, United States" });
  });

  it("is fine with an enabled all-countries default", () => {
    expect(
      findCountryCoverageGap([rule("DEFAULT", "IN"), rule("DEFAULT", "")]),
    ).toBeNull();
  });

  it("doesn't count an inactive fallback or product-level all-countries rules", () => {
    expect(
      findCountryCoverageGap([
        rule("DEFAULT", "IN"),
        rule("DEFAULT", "", false),
        rule("PRODUCT", ""),
      ])?.countries,
    ).toEqual(["IN"]);
  });

  it("ignores shops without country rules", () => {
    expect(findCountryCoverageGap([rule("PRODUCT", "")])).toBeNull();
    expect(findCountryCoverageGap([rule("DEFAULT", "IN", false)])).toBeNull();
    expect(findCountryCoverageGap([])).toBeNull();
  });
});
