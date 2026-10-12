import prisma from "../db.server";
import { MINUTES_PER_DAY } from "../utils/delivery-dates";
import {
  isValidShopDomain,
  normalizeShop,
} from "./deliveryRule.service.server";

function checkedShop(shop: string): string {
  if (!shop || typeof shop !== "string") throw new Error("Shop is required");
  const normalized = normalizeShop(shop);
  if (!isValidShopDomain(normalized)) throw new Error("Invalid shop domain");
  return normalized;
}

/**
 * A cutoff must fall after 12:00 AM: midnight would mean "never today",
 * which is just an extra processing day.
 */
export function isValidCutoffMinutes(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value < MINUTES_PER_DAY
  );
}

/** The store-wide order cutoff, or null when none is set. */
export async function getShopCutoff(shop: string): Promise<number | null> {
  const settings = await prisma.shopSettings.findUnique({
    where: { shop: checkedShop(shop) },
    select: { cutoffMinutes: true },
  });
  const minutes = settings?.cutoffMinutes ?? null;
  return isValidCutoffMinutes(minutes) ? minutes : null;
}

export async function saveShopCutoff(
  shop: string,
  cutoffMinutes: number | null,
): Promise<void> {
  if (cutoffMinutes !== null && !isValidCutoffMinutes(cutoffMinutes)) {
    throw new Error("Invalid cutoff time");
  }
  const normalized = checkedShop(shop);
  await prisma.shopSettings.upsert({
    where: { shop: normalized },
    create: { shop: normalized, cutoffMinutes },
    update: { cutoffMinutes },
  });
}

/** shop/redact cleanup. */
export async function deleteShopSettings(shop: string): Promise<number> {
  const { count } = await prisma.shopSettings.deleteMany({
    where: { shop: normalizeShop(shop) },
  });
  return count;
}
