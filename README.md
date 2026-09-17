# Deliverly — Estimated Delivery Date

Deliverly is an embedded Shopify app that lets merchants configure estimated delivery ranges and display them automatically on product pages through a Theme App Extension.

## Assignment Coverage

### Core features

- Embedded Shopify Admin app using Shopify's React Router app architecture
- Shopify authentication with Prisma-backed session storage
- Polaris merchant interface for minimum delivery days, maximum delivery days, processing days, excluded weekdays, custom customer messaging, and activation state
- Server-validated create, edit, enable, disable, delete, search, and filter flows
- Store-wide default delivery rules
- Estimated minimum and maximum dates calculated from the current date in the shop's IANA time zone
- Theme App Extension with a product-page App Embed
- Signed Shopify App Proxy for storefront estimates
- Responsive storefront output that inherits the active theme's typography, color, and alignment

### Implemented bonus features

- Product-specific delivery rules
- Collection-specific delivery rules
- Live storefront preview in Shopify Admin

Country-based estimates, holiday or blackout dates, custom storefront colors, and automated calculation tests are not included.

## Technology

- Shopify CLI, App Bridge, Admin GraphQL API, App Proxy, and Theme App Extension
- React 18, React Router 7, and strict TypeScript
- Shopify Polaris web components
- Prisma ORM with PostgreSQL
- Liquid, CSS, and lightweight storefront JavaScript
- pnpm 11

## Installation and Development Setup

### Requirements

- Node.js `>=20.19 <22` or `>=22.12`
- pnpm `11.24.0`
- Shopify CLI authenticated with access to a Shopify development store
- PostgreSQL
- A Shopify app configuration linked to the project

### Local setup

1. Clone the repository:

   ```powershell
   git clone https://github.com/PeerMohammad07/Deliverly.git
   cd Deliverly
   ```

2. Install dependencies:

   ```powershell
   pnpm install
   ```

3. Create a local `.env` file and set `DATABASE_URL` to a valid PostgreSQL connection string.

4. Generate Prisma Client and apply the migrations:

   ```powershell
   pnpm setup
   ```

5. Link the intended Shopify app configuration when required:

   ```powershell
   pnpm config:link
   ```

6. Start the Shopify development environment:

   ```powershell
   pnpm dev
   ```

Shopify CLI creates the development tunnel, updates the app URL and redirect URL, starts the embedded app, and deploys the development Theme App Extension preview.

For hosted environments, configure `DATABASE_URL`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, and `SCOPES`. `SHOPIFY_APP_HANDLE` is optional for app-embed status detection, and `SHOP_CUSTOM_DOMAIN` is optional. Replace the `example.com` URLs in `shopify.app.toml` before a production deployment.

## Merchant Workflow

1. Install and open Deliverly in Shopify Admin.
2. Select **ETA rules**.
3. Create a store-wide rule or an optional product/collection rule.
4. Configure processing days, minimum and maximum delivery days, and excluded weekdays.
5. Customize the message and date format.
6. Enable the rule and save it.
7. From the dashboard, open the Shopify Theme Editor.
8. Enable **Estimated Delivery Date** under **App embeds** and save the theme.
9. Open a product page to verify the storefront estimate.

The default message follows this format:

> Estimated delivery between September 20 and September 23.

## Architecture

```text
Shopify Admin
  → Authenticated React Router loaders/actions
  → Validation and delivery-rule services
  → Shop-scoped Prisma repositories
  → PostgreSQL

Product page
  → Theme App Embed
  → Signed Shopify App Proxy
  → Product and shop context from Admin GraphQL
  → Rule resolution
  → Delivery-date calculation
  → Customer-safe JSON response
  → Theme-compatible ETA display
```

### Application layers

- `app/routes/` contains authenticated admin routes, App Proxy handling, OAuth routes, and webhook endpoints.
- `app/components/` contains focused Polaris admin components.
- `app/validators/` parses and validates all delivery-rule input on the server.
- `app/services/` coordinates rule persistence, rule resolution, app-embed status, and storefront estimates.
- `app/repositories/` contains shop-scoped Prisma database operations.
- `app/utils/delivery-dates.ts` contains delivery-date and message calculations.
- `extensions/deliverly-eta/` contains the Theme App Extension.

Admin routes obtain the shop from Shopify's authenticated session rather than merchant-submitted IDs. The App Proxy verifies Shopify's signature before accepting storefront requests. The browser receives only the final customer-safe message and date strings.

## Database Structure

### `Session`

Stores Shopify OAuth sessions through `PrismaSessionStorage`, including the shop, scopes, access tokens, expiry information, and online/offline session metadata.

### `DeliveryRule`

Stores:

- Shop domain
- Rule name and type
- Processing, minimum delivery, and maximum delivery days
- Serialized excluded weekdays
- Structured custom message settings
- Enabled state
- Creation and update timestamps

`defaultShopKey` has a unique constraint so each shop can have only one store-wide default rule.

### `RuleTarget`

Associates a delivery rule with a Shopify Product or Collection GID. Targets are deleted automatically when their parent rule is deleted. Composite uniqueness prevents duplicate targets inside one rule.

All rule reads and mutations are scoped to the authenticated shop.

## Delivery-Date Calculation

1. Shopify's `shop.ianaTimezone` determines the shop's current calendar date.
2. If that date is excluded, calculation moves to the next available weekday.
3. Processing days are added while skipping excluded weekdays.
4. Minimum delivery days are added to produce the earliest date.
5. Maximum delivery days are added to produce the latest date.
6. The selected message and date style format the final customer-facing range.

Inputs are restricted to:

- Processing days: `0–30`
- Minimum delivery days: `0–60`
- Maximum delivery days: `0–60`
- Maximum greater than or equal to minimum
- At least one available weekday

The default excluded days are Saturday and Sunday.

## Rule Resolution

Only enabled rules participate. The first applicable rule wins:

1. Product rule targeting the current product
2. Collection rule targeting one of the product's collections
3. Store-wide default rule

When multiple rules match at one level, the newest rule wins, with the rule ID used as a deterministic tie-breaker. If no rule applies, the storefront widget remains hidden.

## Storefront Integration

The `deliverly-eta` Theme App Extension provides the **Estimated Delivery Date** App Embed and restricts it to product templates. Liquid emits the current product identity as inert JSON. The extension then requests:

```text
GET /apps/delivery-estimate?productId=gid://shopify/Product/{id}
```

Shopify signs and forwards the request to `/api/estimate`. The endpoint validates the request, gets trusted product and shop context, resolves the rule, and returns:

- `enabled`
- `message`
- `minDate`
- `maxDate`

The extension does not calculate dates or receive Admin API credentials. It disables browser caching, refreshes when the storefront regains focus, and renders only when an active rule applies. Its styling inherits the theme and wraps safely on narrow screens.

## Validation and Error Handling

- Client validation provides immediate feedback.
- Server validation remains the source of truth.
- Rule IDs and target GIDs are validated.
- Every database operation is scoped to the authenticated shop.
- Invalid App Proxy signatures are rejected.
- Unexpected failures are logged server-side while customers receive generic messages.
- Secrets and access tokens are never sent to the storefront.

## Verification

```powershell
pnpm prisma validate
pnpm prisma migrate status
pnpm typecheck
pnpm lint
pnpm build
```

The current source passes Prisma validation and generation, PostgreSQL migration status, strict TypeScript checking, ESLint, the production build, and Shopify Theme App Extension checks.

## Development Store and Demonstration

- Development store: `final-invoice-v3.myshopify.com`
- Shopify CLI generates the current embedded-app and Theme App Extension preview during `pnpm dev`.
- Demo video is shared separately.

## Assumptions and Limitations

- Excluded weekdays apply to both processing and delivery-day calculations.
- Zero processing or delivery days means the current shop date when it is available; otherwise the next available weekday is used.
- Date formatting is currently English (`en-US`).
- Product collection resolution reads the first 50 collections returned by Shopify.
- Theme placement uses common product-price and add-to-cart selectors, with a product-area fallback.
- Country-specific estimates, holidays, blackout dates, and storefront color controls are not implemented.
- PostgreSQL is required; SQLite is no longer configured.
- Production deployment requires real application and OAuth redirect URLs in `shopify.app.toml`.
- Automated calculation tests are not included because they are an optional bonus requirement.
