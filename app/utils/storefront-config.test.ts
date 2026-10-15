import { describe, expect, it } from "vitest";
import {
  buildStorefrontConfig,
  parseStorefrontConfig,
  serializeStorefrontConfig,
  StorefrontConfigTooLargeError,
  toNumericId,
  type ConfigSourceRule,
} from "./storefront-config";
import { selectRule } from "./select-rule";

function rule(partial: Partial<ConfigSourceRule>): ConfigSourceRule {
  return {
    id: "r",
    type: "DEFAULT",
    enabled: true,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    countries: "",
    processingDays: 1,
    minDeliveryDays: 3,
    maxDeliveryDays: 5,
    excludedDays: "[6,0]",
    cutoffMinutes: null,
    customMessage: "",
    targets: [],
    ...partial,
  };
}

const NOW = new Date("2026-10-15T10:00:00Z");

describe("buildStorefrontConfig", () => {
  it("keeps enabled rules newest first with numeric targets", () => {
    const config = buildStorefrontConfig({
      timeZone: "Asia/Kolkata",
      now: NOW,
      rules: [
        rule({ id: "old-default" }),
        rule({ id: "off", enabled: false }),
        rule({
          id: "new-product",
          type: "PRODUCT",
          countries: "IN",
          createdAt: new Date("2026-10-10T00:00:00Z"),
          targets: [
            { targetId: "gid://shopify/Product/123" },
            { targetId: "not-a-gid" },
          ],
        }),
      ],
    });
    expect(config.v).toBe(1);
    expect(config.timezone).toBe("Asia/Kolkata");
    expect(config.updatedAt).toBe(NOW.toISOString());
    expect(config.rules.map((r) => r.id)).toEqual(["new-product", "old-default"]);
    expect(config.rules[0].targets).toEqual(["123"]);
    expect(config.rules[0].countries).toBe("IN");
    expect(config.rules[1].excludedDays).toEqual([0, 6]);
  });

  it("drops targets from default rules", () => {
    const config = buildStorefrontConfig({
      timeZone: "UTC",
      rules: [rule({ targets: [{ targetId: "gid://shopify/Product/1" }] })],
    });
    expect(config.rules[0].targets).toEqual([]);
  });

  it("breaks time ties by id, like the server", () => {
    const config = buildStorefrontConfig({
      timeZone: "UTC",
      rules: [rule({ id: "a" }), rule({ id: "b" })],
    });
    expect(config.rules.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("works with selectRule as stored", () => {
    const config = buildStorefrontConfig({
      timeZone: "UTC",
      rules: [
        rule({ id: "all" }),
        rule({
          id: "collection",
          type: "COLLECTION",
          targets: [{ targetId: "gid://shopify/Collection/77" }],
        }),
      ],
    });
    const parsed = parseStorefrontConfig(serializeStorefrontConfig(config));
    expect(
      selectRule(parsed!.rules, {
        productId: "5",
        collectionIds: ["77"],
        country: null,
      })?.id,
    ).toBe("collection");
  });
});

describe("serializeStorefrontConfig", () => {
  it("refuses a config over the size limit", () => {
    const targets = Array.from({ length: 10_000 }, (_, i) => ({
      targetId: `gid://shopify/Product/${1_000_000_000 + i}`,
    }));
    const config = buildStorefrontConfig({
      timeZone: "UTC",
      rules: [rule({ type: "PRODUCT", targets })],
    });
    expect(() => serializeStorefrontConfig(config)).toThrow(
      StorefrontConfigTooLargeError,
    );
  });
});

describe("parseStorefrontConfig", () => {
  const valid = buildStorefrontConfig({ timeZone: "UTC", rules: [rule({})] });

  it("round-trips a valid config", () => {
    expect(parseStorefrontConfig(serializeStorefrontConfig(valid))).toEqual(valid);
    expect(parseStorefrontConfig(valid)).toEqual(valid);
  });

  it("rejects other versions and broken data", () => {
    expect(parseStorefrontConfig("not json")).toBeNull();
    expect(parseStorefrontConfig(null)).toBeNull();
    expect(parseStorefrontConfig({ ...valid, v: 2 })).toBeNull();
    expect(parseStorefrontConfig({ ...valid, timezone: "" })).toBeNull();
    expect(
      parseStorefrontConfig({
        ...valid,
        rules: [{ ...valid.rules[0], excludedDays: [7] }],
      }),
    ).toBeNull();
    expect(
      parseStorefrontConfig({
        ...valid,
        rules: [{ ...valid.rules[0], type: "OTHER" }],
      }),
    ).toBeNull();
  });
});

describe("toNumericId", () => {
  it("strips product and collection GIDs only", () => {
    expect(toNumericId("gid://shopify/Product/42")).toBe("42");
    expect(toNumericId("gid://shopify/Collection/7")).toBe("7");
    expect(toNumericId("gid://shopify/Order/7")).toBeNull();
  });
});
