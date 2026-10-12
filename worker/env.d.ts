// Secrets and optional bindings that wrangler.jsonc doesn't declare, so
// `wrangler types` can't see them. DATABASE_URL comes from .env.
interface Env {
  SHOPIFY_API_KEY?: string;
  SHOPIFY_API_SECRET?: string;
  SHOPIFY_APP_URL?: string;
  SCOPES?: string;
  SHOP_CUSTOM_DOMAIN?: string;
  SHOPIFY_APP_HANDLE?: string;
  /** Optional Hyperdrive connection pool; preferred over DATABASE_URL. */
  HYPERDRIVE?: Hyperdrive;
}
