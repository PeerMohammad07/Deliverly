import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  deliveryRule: {
    create: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
  },
  ruleTarget: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
}));
vi.mock("../db.server", () => ({ default: db }));

import {
  createRule,
  DuplicateDefaultRuleError,
  updateRule,
} from "./deliveryRule.repository.server";

const SHOP = "demo.myshopify.com";
const P1 = "gid://shopify/Product/1";
const P2 = "gid://shopify/Product/2";
const P3 = "gid://shopify/Product/3";

const BASE = {
  name: "Rule",
  type: "PRODUCT" as const,
  processingDays: 1,
  minDeliveryDays: 3,
  maxDeliveryDays: 5,
  excludedDays: "[0,6]",
  cutoffMinutes: null,
  countries: "",
  customMessage: "",
  enabled: true,
  targetIds: [P2, P3],
};

const uniqueError = Object.assign(new Error("unique"), { code: "P2002" });

beforeEach(() => {
  vi.clearAllMocks();
  db.deliveryRule.update.mockResolvedValue({ id: "r1" });
  db.deliveryRule.findFirst.mockResolvedValue({ id: "r1", targets: [] });
});

describe("updateRule targets", () => {
  it("only deletes dropped targets and adds new ones", async () => {
    db.ruleTarget.findMany.mockResolvedValue([
      { id: "t1", targetType: "PRODUCT", targetId: P1 },
      { id: "t2", targetType: "PRODUCT", targetId: P2 },
    ]);
    await updateRule(SHOP, "r1", BASE);
    expect(db.ruleTarget.deleteMany).toHaveBeenCalledWith({
      where: { ruleId: "r1", id: { in: ["t1"] } },
    });
    expect(db.ruleTarget.createMany).toHaveBeenCalledWith({
      data: [{ ruleId: "r1", targetType: "PRODUCT", targetId: P3 }],
    });
  });

  it("writes nothing when the targets are unchanged", async () => {
    db.ruleTarget.findMany.mockResolvedValue([
      { id: "t2", targetType: "PRODUCT", targetId: P2 },
      { id: "t3", targetType: "PRODUCT", targetId: P3 },
    ]);
    await updateRule(SHOP, "r1", BASE);
    expect(db.ruleTarget.deleteMany).not.toHaveBeenCalled();
    expect(db.ruleTarget.createMany).not.toHaveBeenCalled();
  });

  it("removes every target when the rule becomes a default", async () => {
    db.ruleTarget.findMany.mockResolvedValue([
      { id: "t2", targetType: "PRODUCT", targetId: P2 },
    ]);
    await updateRule(SHOP, "r1", { ...BASE, type: "DEFAULT", countries: "FR" });
    expect(db.ruleTarget.deleteMany).toHaveBeenCalledWith({
      where: { ruleId: "r1", id: { in: ["t2"] } },
    });
    expect(db.ruleTarget.createMany).not.toHaveBeenCalled();
  });
});

describe("duplicate all-countries default", () => {
  it("names the existing default on create", async () => {
    db.deliveryRule.create.mockRejectedValue(uniqueError);
    db.deliveryRule.findFirst.mockResolvedValue({
      id: "old",
      name: "Standard",
      enabled: false,
    });
    const error = await createRule({
      ...BASE,
      shop: SHOP,
      type: "DEFAULT",
      targetIds: [],
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DuplicateDefaultRuleError);
    expect((error as DuplicateDefaultRuleError).existing).toEqual({
      id: "old",
      name: "Standard",
      enabled: false,
    });
    expect(db.deliveryRule.findFirst).toHaveBeenCalledWith({
      where: { defaultShopKey: SHOP },
      select: { id: true, name: true, enabled: true },
    });
  });

  it("still reports the conflict if the lookup fails", async () => {
    db.deliveryRule.update.mockRejectedValue(uniqueError);
    db.deliveryRule.findFirst.mockRejectedValue(new Error("db down"));
    const error = await updateRule(SHOP, "r1", {
      ...BASE,
      type: "DEFAULT",
      targetIds: [],
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DuplicateDefaultRuleError);
    expect((error as DuplicateDefaultRuleError).existing).toBeNull();
  });
});
