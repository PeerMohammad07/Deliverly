import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  unauthenticatedAdmin: vi.fn(),
  sync: vi.fn(),
}));
vi.mock("../db.server", () => ({
  default: { session: { findMany: mocks.findMany } },
}));
vi.mock("../shopify.server", () => ({
  unauthenticated: { admin: mocks.unauthenticatedAdmin },
}));
vi.mock("../services/storefrontSync.server", () => ({
  syncStorefrontConfig: mocks.sync,
}));

import { action } from "../routes/internal.storefront-backfill";

const TOKEN = "t".repeat(40);

function call(headers: Record<string, string> = {}, query = "") {
  const request = new Request(
    `https://app.example/internal/storefront-backfill${query}`,
    { method: "POST", headers },
  );
  return action({ request, params: {}, context: {} } as never) as Promise<Response>;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BACKFILL_TOKEN = TOKEN;
  mocks.unauthenticatedAdmin.mockResolvedValue({ admin: {} });
});
afterEach(() => {
  delete process.env.BACKFILL_TOKEN;
});

describe("storefront backfill", () => {
  it("is off without a token", async () => {
    delete process.env.BACKFILL_TOKEN;
    expect((await call({ authorization: `Bearer ${TOKEN}` })).status).toBe(404);
  });

  it("rejects a wrong token", async () => {
    expect((await call({ authorization: "Bearer nope" })).status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("syncs a batch and returns the cursor", async () => {
    mocks.findMany.mockResolvedValue([{ shop: "a.myshopify.com" }, { shop: "b.myshopify.com" }]);
    mocks.sync
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, reason: "failed", message: "x" });
    const response = await call({ authorization: `Bearer ${TOKEN}` }, "?limit=2");
    const body = await response.json();
    expect(body).toMatchObject({ processed: 2, failed: 1, next: "b.myshopify.com" });
    expect(mocks.findMany.mock.calls[0][0]).toMatchObject({
      where: { isOnline: false, shop: { gt: "" } },
      take: 2,
    });
  });

  it("ends when a batch isn't full", async () => {
    mocks.findMany.mockResolvedValue([{ shop: "c.myshopify.com" }]);
    mocks.sync.mockResolvedValue({ ok: true });
    const body = (await (await call({ authorization: `Bearer ${TOKEN}` }, "?after=b.myshopify.com")).json()) as { next: string | null };
    expect(body.next).toBeNull();
    expect(mocks.findMany.mock.calls[0][0].where.shop).toEqual({ gt: "b.myshopify.com" });
  });
});
