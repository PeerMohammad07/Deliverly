// Secrets that wrangler.jsonc doesn't declare, so `wrangler types` can't
// see them. Bindings such as DB come from worker-configuration.d.ts.
interface Env {
  SHOPIFY_API_KEY?: string;
  SHOPIFY_API_SECRET?: string;
  SHOPIFY_APP_URL?: string;
  SCOPES?: string;
  SHOP_CUSTOM_DOMAIN?: string;
  SHOPIFY_APP_HANDLE?: string;
}
