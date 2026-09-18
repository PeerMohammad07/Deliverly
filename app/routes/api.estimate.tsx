import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { isValidShopDomain } from "../services/deliveryRule.service.server";
import {
  getDeliveryEstimate,
  InvalidProductError,
  ProductNotFoundError,
} from "../services/storefrontEstimate.service.server";

/**
 * Storefront estimate endpoint, served through the Shopify App Proxy
 * (GET shop.com/apps/delivery-estimate?productId=...).
 *
 * Security model:
 * - authenticate.public.appProxy verifies the Shopify HMAC signature
 *   and rejects tampered requests before any shop value is trusted.
 * - The shop comes from the signed query string, so the client cannot
 *   substitute an arbitrary shop and read another store's rules.
 * - No admin-session authentication is used here; the offline admin
 *   client comes from the verified proxy context and is only used to
 *   read the requested product's own collections (never client input).
 *
 * No default export: data-only route, same convention as webhooks.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  let admin;
  try {
    ({ admin } = await authenticate.public.appProxy(request));
  } catch (error) {
    if (error instanceof Response) {
      if (error.status === 400) {
        return Response.json(
          { error: "Invalid request signature." },
          { status: 401 },
        );
      }
      console.error("[api.estimate] app proxy error", error.status);
    } else {
      console.error("[api.estimate] app proxy auth failed", error);
    }
    return Response.json(
      { error: "Couldn’t verify this request." },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const shop = (url.searchParams.get("shop") ?? "").trim().toLowerCase();
  if (!isValidShopDomain(shop)) {
    return Response.json({ error: "Unknown store." }, { status: 401 });
  }

  if (!admin) {
    console.error("[api.estimate] no offline admin session", { shop });
  }

  const productId = (url.searchParams.get("productId") ?? "").trim();

  try {
    return Response.json(await getDeliveryEstimate({ shop, productId, admin }));
  } catch (error) {
    if (error instanceof InvalidProductError) {
      return Response.json(
        { error: "Invalid or missing product." },
        { status: 400 },
      );
    }
    if (error instanceof ProductNotFoundError) {
      return Response.json({ error: "Product not found." }, { status: 404 });
    }
    console.error("[api.estimate] estimate failed", { shop, error });
    return Response.json(
      { error: "Couldn’t load the delivery estimate." },
      { status: 500 },
    );
  }
};
