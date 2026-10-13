import { describe, expect, it, vi } from "vitest";
import {
  PRODUCT_CONTEXT_TTL_SECONDS,
  productContextKey,
  withProductContextCache,
  type ProductContext,
  type ProductContextStore,
} from "./productContextCache.server";

const SHOP = "shop-a.myshopify.com";
const PRODUCT = "gid://shopify/Product/1";
const CONTEXT: ProductContext = {
  collectionIds: ["gid://shopify/Collection/9"],
  timeZone: "Asia/Kolkata",
};

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const store: ProductContextStore & { puts: unknown[] } = {
    puts: [],
    async get(key) {
      const raw = data.get(key);
      return raw === undefined ? null : JSON.parse(raw);
    },
    async put(key, value, options) {
      store.puts.push({ key, value, options });
      data.set(key, value);
    },
  };
  return store;
}

describe("withProductContextCache", () => {
  it("loads and stores on a miss, then serves the cached value", async () => {
    const store = memoryStore();
    const load = vi.fn().mockResolvedValue(CONTEXT);

    const first = await withProductContextCache({
      store,
      shop: SHOP,
      productId: PRODUCT,
      load,
    });
    const second = await withProductContextCache({
      store,
      shop: SHOP,
      productId: PRODUCT,
      load,
    });

    expect(first).toEqual(CONTEXT);
    expect(second).toEqual(CONTEXT);
    expect(load).toHaveBeenCalledTimes(1);
    expect(store.puts).toEqual([
      {
        key: productContextKey(SHOP, PRODUCT),
        value: JSON.stringify(CONTEXT),
        options: { expirationTtl: PRODUCT_CONTEXT_TTL_SECONDS },
      },
    ]);
  });

  it("keeps shops apart", async () => {
    const store = memoryStore({
      [productContextKey("other.myshopify.com", PRODUCT)]: JSON.stringify({
        collectionIds: ["gid://shopify/Collection/OTHER"],
        timeZone: "UTC",
      }),
    });
    const load = vi.fn().mockResolvedValue(CONTEXT);

    const result = await withProductContextCache({
      store,
      shop: SHOP,
      productId: PRODUCT,
      load,
    });

    expect(result).toEqual(CONTEXT);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("ignores malformed cached values", async () => {
    const store = memoryStore({
      [productContextKey(SHOP, PRODUCT)]: JSON.stringify({ timeZone: 5 }),
    });
    const load = vi.fn().mockResolvedValue(CONTEXT);

    expect(
      await withProductContextCache({
        store,
        shop: SHOP,
        productId: PRODUCT,
        load,
      }),
    ).toEqual(CONTEXT);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("falls back to the live lookup when KV fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store: ProductContextStore = {
      get: vi.fn().mockRejectedValue(new Error("KV down")),
      put: vi.fn().mockRejectedValue(new Error("daily write limit")),
    };
    const load = vi.fn().mockResolvedValue(CONTEXT);

    expect(
      await withProductContextCache({
        store,
        shop: SHOP,
        productId: PRODUCT,
        load,
      }),
    ).toEqual(CONTEXT);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("writes in the background when waitUntil is given", async () => {
    const store = memoryStore();
    const waitUntil = vi.fn();

    await withProductContextCache({
      store,
      shop: SHOP,
      productId: PRODUCT,
      load: async () => CONTEXT,
      waitUntil,
    });

    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(waitUntil.mock.calls[0][0]).toBeInstanceOf(Promise);
  });

  it("does not cache failed lookups", async () => {
    const store = memoryStore();
    const failure = new Error("Product not found");

    await expect(
      withProductContextCache({
        store,
        shop: SHOP,
        productId: PRODUCT,
        load: async () => {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
    expect(store.puts).toEqual([]);
  });

  it("goes straight to the live lookup without a store", async () => {
    const load = vi.fn().mockResolvedValue(CONTEXT);
    expect(
      await withProductContextCache({
        store: null,
        shop: SHOP,
        productId: PRODUCT,
        load,
      }),
    ).toEqual(CONTEXT);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
