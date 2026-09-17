# Deliverly — Estimated Delivery Date

## Overview

Deliverly is an embedded Shopify app for configuring estimated delivery dates by product, collection, or store-wide default rule. Merchants manage delivery timing, excluded weekdays, activation state, and storefront message formatting in Shopify Admin. Customers see the resolved estimate on product pages through a Theme App Embed.

## Features

- Create, edit, activate, deactivate, delete, search, and filter delivery rules
- Target all products, specific products, or specific collections
- Product → Collection → Default rule precedence
- Processing and delivery ranges that skip merchant-selected weekdays
- Configurable storefront message and date style with a live admin preview
- Responsive storefront ETA rendered through a Theme App Embed
- Dashboard with setup guidance, rule summaries, and embed activation status
- Server-side input validation and shop-scoped data access

## Tech Stack

- Shopify App Bridge, Admin GraphQL API, App Proxy, and Theme App Extension
- React 18, React Router 7, and TypeScript
- Shopify Polaris web components
- Prisma ORM with SQLite
- Liquid, CSS, and lightweight storefront JavaScript

## Architecture

Merchant → Embedded Admin UI → Delivery Rules → Prisma / SQLite
Customer → Theme App Embed → App Proxy → Rule Resolution
         → Delivery Calculator → Storefront ETA


- Admin routes authenticate with `authenticate.admin` and obtain the shop from the Shopify session.
- Route actions validate form data before calling the delivery-rule service and repository layers.
- Prisma stores Shopify sessions, delivery rules, and product or collection targets.
- The storefront endpoint authenticates signed App Proxy requests, resolves the applicable rule, calculates the date range, and returns customer-safe data.
- The Theme App Embed detects the current product, requests its estimate, and renders only when an enabled rule applies.

## Rule Resolution

Rules use fixed precedence; merchants do not configure a numeric priority:

1. An enabled product rule targeting the current product
2. An enabled collection rule targeting one of the product's collections
3. The enabled store-wide default rule

Disabled rules are ignored. If multiple rules match at the same level, the newest rule is selected; the rule ID provides a deterministic tie-breaker. If no rule applies, the endpoint returns a disabled result and the theme renders nothing.

## Delivery Calculation

The calculator starts from the current date, adds processing days, then calculates the minimum and maximum delivery dates. Every stage skips the weekdays excluded by the merchant. If the starting date is excluded, calculation rolls forward to the next available weekday.

The form accepts 0–30 processing days and 0–60 minimum or maximum delivery days. The maximum cannot be earlier than the minimum, and at least one weekday must remain available.

## Storefront Integration

The `deliverly-eta` Theme App Extension provides an App Embed enabled on product templates. Liquid exposes the current product ID as inert JSON, and the extension JavaScript places the estimate near the product price or purchase form. The component inherits the active theme's typography, color, and alignment, remains hidden while loading, and caches results for the current page.

The storefront calls the signed App Proxy URL:

GET /apps/delivery-estimate?productId=gid://shopify/Product/{id}

Shopify forwards the request to the internal `/api/estimate` route. A successful estimate returns `enabled`, `message`, `minDate`, and `maxDate`. When no enabled rule applies, `enabled` is `false` and the date and message values are `null`.

## Setup

Requirements:

- Node.js `>=20.19 <22` or `>=22.12` (Node 22.12 is recommended for the current Shopify CLI)
- pnpm
- Shopify CLI authenticated with access to a development store
- A Shopify app configuration linked to the project

Install dependencies, prepare Prisma, and start Shopify development:

pnpm install
pnpm setup
pnpm dev

Shopify CLI supplies the development app URL and standard Shopify environment values. Hosted environments require `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, and `SCOPES`. `SHOPIFY_APP_HANDLE` can be provided for embed-status detection, and `SHOP_CUSTOM_DOMAIN` is optional.

The checked-in `shopify.app.toml` contains placeholder application and redirect URLs. Configure the production URLs before deployment.

## Development / Validation

```bash
pnpm typecheck
pnpm lint
pnpm build
```

`pnpm setup` generates Prisma Client and applies pending migrations. No automated test command or test suite is currently configured.

## Design Decisions

### Rule precedence

Product rules are most specific, collection rules provide reusable grouping, and the default rule is the fallback. Keeping this order fixed makes storefront behavior deterministic without exposing manual priority management.

### Separation of responsibilities

Persistence, rule resolution, date calculation, and storefront rendering are separate. The browser never calculates delivery dates; it only renders the server-approved message.

### Theme App Embed

The App Embed keeps storefront integration theme-managed and limits execution to product templates. It uses Shopify's signed App Proxy rather than exposing admin credentials or rule data to the browser.

## Known Limitations

- SQLite is configured as the database and is best suited to local development or a single application instance.
- Product collection lookup reads the first 50 collections returned by Shopify.
- Date formatting is currently English (`en-US`), and holiday calendars are not supported.
- Automated tests have not yet been added.
