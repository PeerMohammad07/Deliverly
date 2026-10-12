import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { deleteAllRulesForShop } from "../repositories/deliveryRule.repository.server";

/**
 * Mandatory compliance webhooks (customers/data_request, customers/redact,
 * shop/redact). authenticate.webhook verifies the HMAC and responds 401
 * when it's invalid, before any payload is trusted.
 *
 * Deliverly stores no customer personal data — only per-shop delivery
 * rules and Shopify sessions — so customer requests have nothing to
 * export or delete. shop/redact (sent 48 hours after uninstall) removes
 * everything stored for the shop.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      // No customer data is stored, so there is nothing to report or redact.
      break;
    case "SHOP_REDACT": {
      const rules = await deleteAllRulesForShop(shop);
      const sessions = await db.session.deleteMany({ where: { shop } });
      console.log(
        `Redacted ${shop}: ${rules} rules, ${sessions.count} sessions deleted`,
      );
      break;
    }
    default:
      return new Response("Unhandled webhook topic", { status: 404 });
  }

  return new Response();
};
