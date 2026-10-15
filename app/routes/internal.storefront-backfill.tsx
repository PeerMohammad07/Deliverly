import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { syncStorefrontConfig } from "../services/storefrontSync.server";

/**
 * One-off backfill: writes the storefront config for every installed
 * shop. Run after the first release and after any change to the config
 * format. Shops are processed in batches to stay inside the Worker's
 * request limits; call again with `after` until `next` is null:
 *
 *   curl -X POST -H "Authorization: Bearer $BACKFILL_TOKEN" \
 *     "https://<worker>/internal/storefront-backfill?limit=20&after=<next>"
 *
 * Disabled (404) unless the BACKFILL_TOKEN secret is set.
 */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/** Compare without stopping at the first difference. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const token = process.env.BACKFILL_TOKEN ?? "";
  if (token.length < 32) {
    return new Response("Not found", { status: 404 });
  }
  const header = request.headers.get("authorization") ?? "";
  if (!safeEqual(header, `Bearer ${token}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const requested = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit =
    Number.isInteger(requested) && requested >= 1
      ? Math.min(requested, MAX_LIMIT)
      : DEFAULT_LIMIT;
  const after = url.searchParams.get("after") ?? "";

  const sessions = await db.session.findMany({
    where: { isOnline: false, shop: { gt: after } },
    select: { shop: true },
    distinct: ["shop"],
    orderBy: { shop: "asc" },
    take: limit,
  });

  const results: Array<{ shop: string; ok: boolean; reason?: string }> = [];
  for (const { shop } of sessions) {
    try {
      const { admin } = await unauthenticated.admin(shop);
      const result = await syncStorefrontConfig(shop, admin);
      results.push(
        result.ok ? { shop, ok: true } : { shop, ok: false, reason: result.reason },
      );
    } catch (error) {
      console.error("[storefront-backfill] shop failed", { shop, error });
      results.push({ shop, ok: false, reason: "no_session" });
    }
  }

  const next =
    sessions.length === limit ? sessions[sessions.length - 1].shop : null;
  return Response.json({
    processed: results.length,
    failed: results.filter((r) => !r.ok).length,
    next,
    results,
  });
};
