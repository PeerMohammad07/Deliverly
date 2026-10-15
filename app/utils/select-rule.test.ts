import { describe, expect, it } from "vitest";
import { selectRule, type SelectableRule } from "./select-rule";

type Rule = SelectableRule & { id: string };

// Newest first.
const RULES: Rule[] = [
  { id: "product-us", type: "PRODUCT", targets: ["1"], countries: "US" },
  { id: "collection", type: "COLLECTION", targets: ["10", "11"], countries: "" },
  { id: "default-eu", type: "DEFAULT", targets: [], countries: "DE,FR" },
  { id: "default-all", type: "DEFAULT", targets: [], countries: "" },
];

function pick(productId: string, collectionIds: string[], country: string | null) {
  return selectRule(RULES, { productId, collectionIds, country })?.id ?? null;
}

describe("selectRule", () => {
  it("follows product → collection → default", () => {
    expect(pick("1", ["11"], "US")).toBe("product-us");
    expect(pick("1", ["11"], "FR")).toBe("collection");
    expect(pick("2", ["11"], null)).toBe("collection");
    expect(pick("2", [], "FR")).toBe("default-eu");
    expect(pick("2", [], "JP")).toBe("default-all");
  });

  it("returns null when nothing applies", () => {
    expect(selectRule(RULES.slice(0, 3), { productId: "2", collectionIds: [], country: "JP" })).toBeNull();
  });
});
