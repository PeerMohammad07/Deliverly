import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findEnabledCollectionRules,
  findEnabledDefaultRules,
  findEnabledProductRules,
} from "../repositories/deliveryRule.repository.server";
import { resolveDeliveryRule } from "./deliveryRuleResolution.service.server";

vi.mock("../repositories/deliveryRule.repository.server", () => ({
  findEnabledProductRules: vi.fn(),
  findEnabledCollectionRules: vi.fn(),
  findEnabledDefaultRules: vi.fn(),
}));

type Rule = { id: string; countries: string };
const productRules = vi.mocked(findEnabledProductRules);
const collectionRules = vi.mocked(findEnabledCollectionRules);
const defaultRules = vi.mocked(findEnabledDefaultRules);

function setRules(product: Rule[], collection: Rule[], fallback: Rule[]) {
  productRules.mockResolvedValue(product as never);
  collectionRules.mockResolvedValue(collection as never);
  defaultRules.mockResolvedValue(fallback as never);
}

function resolve(country: string | null) {
  return resolveDeliveryRule({
    shop: "demo.myshopify.com",
    productId: "gid://shopify/Product/1",
    collectionIds: ["gid://shopify/Collection/9"],
    country,
  });
}

describe("resolveDeliveryRule countries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips a product rule for other countries", async () => {
    setRules(
      [{ id: "product-us", countries: "US" }],
      [{ id: "collection-all", countries: "" }],
      [],
    );
    expect((await resolve("FR"))?.id).toBe("collection-all");
    expect((await resolve("US"))?.id).toBe("product-us");
  });

  it("prefers the country default over the all-countries default", async () => {
    setRules(
      [],
      [],
      [
        { id: "default-all", countries: "" },
        { id: "default-eu", countries: "DE,FR" },
      ],
    );
    expect((await resolve("fr"))?.id).toBe("default-eu");
    expect((await resolve("JP"))?.id).toBe("default-all");
  });

  it("ignores an unknown country", async () => {
    setRules([], [], [
      { id: "default-eu", countries: "DE,FR" },
      { id: "default-all", countries: "" },
    ]);
    expect((await resolve("XX"))?.id).toBe("default-all");
    expect((await resolve(null))?.id).toBe("default-all");
  });

  it("returns null when only other countries have rules", async () => {
    setRules([], [], [{ id: "default-us", countries: "US" }]);
    expect(await resolve("FR")).toBeNull();
  });
});
