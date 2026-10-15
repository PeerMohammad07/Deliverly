import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { syncStorefrontConfig } from "../services/storefrontSync.server";

/** Retry button of the storefront sync banner. No UI of its own. */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = (session as { shop?: string })?.shop;
  if (!shop) {
    throw new Response("Unauthorized: missing shop", { status: 401 });
  }
  return data(await syncStorefrontConfig(shop, admin));
};
