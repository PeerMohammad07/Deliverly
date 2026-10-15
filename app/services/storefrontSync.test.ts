import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  listRulesByShop: vi.fn(),
  markSyncRequested: vi.fn(),
  markSyncSucceeded: vi.fn(),
  markSyncFailed: vi.fn(),
  getSyncState: vi.fn(),
}));
vi.mock("../repositories/deliveryRule.repository.server", () => ({
  listRulesByShop: repo.listRulesByShop,
}));
vi.mock("../repositories/storefrontSync.repository.server", () => ({
  markSyncRequested: repo.markSyncRequested,
  markSyncSucceeded: repo.markSyncSucceeded,
  markSyncFailed: repo.markSyncFailed,
  getSyncState: repo.getSyncState,
}));

import {
  ensureStorefrontSynced,
  getStorefrontSyncStatus,
  syncIfTimeZoneChanged,
  syncStorefrontConfig,
  TOO_LARGE_ERROR,
  type SyncAdminClient,
} from "./storefrontSync.server";

const SHOP = "demo.myshopify.com";

const RULE = {
  id: "r1",
  type: "DEFAULT",
  enabled: true,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  countries: "",
  processingDays: 1,
  minDeliveryDays: 3,
  maxDeliveryDays: 5,
  excludedDays: "[0,6]",
  cutoffMinutes: null,
  customMessage: "",
  targets: [],
};

/** Fake Admin API answering each call with the next queued response. */
function fakeAdmin(responses: unknown[]) {
  const calls: Array<{ query: string; variables?: Record<string, unknown> }> =
    [];
  const admin: SyncAdminClient = {
    async graphql(query, options) {
      calls.push({ query, variables: options?.variables });
      const data = responses.shift();
      return { json: async () => data };
    },
  };
  return { admin, calls };
}

const state = (digest: string | null) => ({
  data: {
    shop: {
      id: "gid://shopify/Shop/1",
      ianaTimezone: "Asia/Kolkata",
      config: digest ? { compareDigest: digest } : null,
    },
  },
});
const setOk = { data: { metafieldsSet: { userErrors: [] } } };
const setStale = {
  data: {
    metafieldsSet: {
      userErrors: [{ message: "stale", code: "STALE_OBJECT" }],
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.listRulesByShop.mockResolvedValue([RULE]);
});

describe("syncStorefrontConfig", () => {
  it("writes the config with the current digest", async () => {
    const { admin, calls } = fakeAdmin([state("d1"), setOk]);
    expect(await syncStorefrontConfig(SHOP, admin)).toEqual({ ok: true });

    const input = (calls[1].variables!.metafields as Array<Record<string, unknown>>)[0];
    expect(input).toMatchObject({
      ownerId: "gid://shopify/Shop/1",
      namespace: "$app",
      key: "deliverly_config",
      type: "json",
      compareDigest: "d1",
    });
    const config = JSON.parse(input.value as string);
    expect(config.timezone).toBe("Asia/Kolkata");
    expect(config.rules.map((r: { id: string }) => r.id)).toEqual(["r1"]);

    const startedAt = repo.markSyncRequested.mock.calls[0][1];
    expect(repo.markSyncSucceeded).toHaveBeenCalledWith(
      SHOP,
      startedAt,
      "Asia/Kolkata",
    );
  });

  it("sends a null digest when nothing is stored yet", async () => {
    const { admin, calls } = fakeAdmin([state(null), setOk]);
    await syncStorefrontConfig(SHOP, admin);
    const input = (calls[1].variables!.metafields as Array<Record<string, unknown>>)[0];
    expect(input.compareDigest).toBeNull();
  });

  it("rebuilds from fresh data after a stale write", async () => {
    const { admin, calls } = fakeAdmin([state("d1"), setStale, state("d2"), setOk]);
    expect(await syncStorefrontConfig(SHOP, admin)).toEqual({ ok: true });
    expect(repo.listRulesByShop).toHaveBeenCalledTimes(2);
    const input = (calls[3].variables!.metafields as Array<Record<string, unknown>>)[0];
    expect(input.compareDigest).toBe("d2");
  });

  it("gives up after repeated conflicts", async () => {
    const { admin } = fakeAdmin([
      state("a"), setStale, state("b"), setStale, state("c"), setStale,
    ]);
    const result = await syncStorefrontConfig(SHOP, admin);
    expect(result.ok).toBe(false);
    expect(repo.markSyncSucceeded).not.toHaveBeenCalled();
    expect(repo.markSyncFailed).toHaveBeenCalled();
  });

  it("records API failures without throwing", async () => {
    const { admin } = fakeAdmin([{ errors: [{ message: "Throttled" }] }]);
    const result = await syncStorefrontConfig(SHOP, admin);
    expect(result).toMatchObject({ ok: false, reason: "failed" });
    expect(repo.markSyncFailed.mock.calls[0][1]).toContain("Throttled");
  });

  it("removes the stored config when the new one is too large", async () => {
    repo.listRulesByShop.mockResolvedValue([
      {
        ...RULE,
        type: "PRODUCT",
        targets: Array.from({ length: 10_000 }, (_, i) => ({
          targetId: `gid://shopify/Product/${1_000_000_000 + i}`,
        })),
      },
    ]);
    const deleted = { data: { metafieldsDelete: { userErrors: [] } } };
    const { admin, calls } = fakeAdmin([state("d1"), deleted]);
    const result = await syncStorefrontConfig(SHOP, admin);
    expect(result).toMatchObject({ ok: false, reason: "too_large" });
    expect(calls[1].query).toContain("metafieldsDelete");
    expect(repo.markSyncFailed).toHaveBeenCalledWith(SHOP, TOO_LARGE_ERROR);
  });
});

describe("getStorefrontSyncStatus", () => {
  const at = (iso: string) => new Date(iso);

  it("reports each state", async () => {
    repo.getSyncState.mockResolvedValueOnce(null);
    expect(await getStorefrontSyncStatus(SHOP)).toEqual({ state: "unknown" });

    repo.getSyncState.mockResolvedValueOnce({
      requestedAt: at("2026-10-15T10:00:00Z"),
      syncedAt: at("2026-10-15T10:00:00Z"),
      lastError: null,
    });
    expect(await getStorefrontSyncStatus(SHOP)).toEqual({ state: "ok" });

    repo.getSyncState.mockResolvedValueOnce({
      requestedAt: at("2026-10-15T11:00:00Z"),
      syncedAt: at("2026-10-15T10:00:00Z"),
      lastError: "Throttled",
    });
    expect(await getStorefrontSyncStatus(SHOP)).toEqual({
      state: "out_of_date",
      lastError: "Throttled",
    });

    repo.getSyncState.mockResolvedValueOnce({
      requestedAt: at("2026-10-15T11:00:00Z"),
      syncedAt: null,
      lastError: TOO_LARGE_ERROR,
    });
    expect(await getStorefrontSyncStatus(SHOP)).toEqual({ state: "too_large" });
  });
});

describe("syncIfTimeZoneChanged", () => {
  it("syncs only when the zone differs from the stored one", async () => {
    repo.getSyncState.mockResolvedValue({ timezone: "Asia/Kolkata" });
    const same = fakeAdmin([]);
    expect(await syncIfTimeZoneChanged(SHOP, "Asia/Kolkata", same.admin)).toBe(false);
    expect(same.calls).toHaveLength(0);

    const changed = fakeAdmin([state("d1"), setOk]);
    expect(await syncIfTimeZoneChanged(SHOP, "Europe/Berlin", changed.admin)).toBe(true);
    expect(changed.calls).toHaveLength(2);
  });
});

describe("ensureStorefrontSynced", () => {
  const NOW = new Date("2026-10-15T12:00:00Z");
  const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

  it("syncs a shop that was never synced", async () => {
    repo.getSyncState.mockResolvedValue(null);
    const { admin, calls } = fakeAdmin([state(null), setOk]);
    await ensureStorefrontSynced(SHOP, admin, NOW);
    expect(calls).toHaveLength(2);
  });

  it("leaves an up-to-date shop alone", async () => {
    repo.getSyncState.mockResolvedValue({
      requestedAt: minutesAgo(60),
      syncedAt: minutesAgo(60),
      updatedAt: minutesAgo(60),
    });
    const { admin, calls } = fakeAdmin([]);
    await ensureStorefrontSynced(SHOP, admin, NOW);
    expect(calls).toHaveLength(0);
  });

  it("retries a failed shop only after a pause", async () => {
    const failed = (m: number) => ({
      requestedAt: minutesAgo(m),
      syncedAt: null,
      updatedAt: minutesAgo(m),
    });
    repo.getSyncState.mockResolvedValue(failed(1));
    const recent = fakeAdmin([]);
    await ensureStorefrontSynced(SHOP, recent.admin, NOW);
    expect(recent.calls).toHaveLength(0);

    repo.getSyncState.mockResolvedValue(failed(10));
    const due = fakeAdmin([state("d1"), setOk]);
    await ensureStorefrontSynced(SHOP, due.admin, NOW);
    expect(due.calls).toHaveLength(2);
  });

  it("never throws", async () => {
    repo.getSyncState.mockRejectedValue(new Error("db down"));
    const { admin } = fakeAdmin([]);
    await expect(ensureStorefrontSynced(SHOP, admin, NOW)).resolves.toBeUndefined();
  });
});
