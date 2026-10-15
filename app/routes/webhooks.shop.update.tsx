import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { syncIfTimeZoneChanged } from "../services/storefrontSync.server";

/**
 * shop/update fires for any shop setting change. Only a time zone
 * change matters to us: the storefront config carries the zone the
 * widget uses for dates and cutoffs, so rewrite it then.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, payload, shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (admin) {
    try {
      const timeZone = (payload as { iana_timezone?: unknown }).iana_timezone;
      await syncIfTimeZoneChanged(shop, timeZone, admin);
    } catch (error) {
      console.error("[webhooks.shop.update] sync failed", { shop, error });
    }
  }
  return new Response();
};
