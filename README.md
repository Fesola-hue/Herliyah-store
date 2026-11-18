# HERLIYAH store

Mobile-first preorder storefront and owner-workspace foundation for HERLIYAH. `PRODUCT.md` is the product brief; this file describes the implementation that actually runs.

## Architecture

The UI uses the Next.js App Router API, React and TypeScript, but it is compiled by **Vinext on Vite**, not by the standard Next.js Node server. `build/sites-worker.ts` is the Cloudflare Worker entry point:

- requests under `/api/*` go to the Hono API in `server/api.ts`;
- all other requests go to Vinext's Next-compatible fetch handler;
- D1 is bound as `DB`, and R2 is bound as `PRODUCT_IMAGES`;
- a five-minute scheduled Worker job reconciles expired payment attempts, releases safe-to-release capacity, and retries transactional email.

This is more specific than the framework-neutral deployment description in `PRODUCT.md`, but it supports the required Cloudflare, D1, R2, Hono and App Router behaviours. There is no product reason to rewrite it. Locally and after deployment, the storefront and API run in the same Worker process and origin. Separate frontend/API startup commands are therefore neither needed nor correct for this repository.

## Modes and launch safety

| Mode         | Catalog                | Payment behaviour                              | Intended use                       |
| ------------ | ---------------------- | ---------------------------------------------- | ---------------------------------- |
| `preview`    | D1 sample rows allowed | Local simulation only; cannot contact Paystack | Design and local end-to-end checks |
| `test`       | D1 rows allowed        | Paystack test keys only (`sk_test_`)           | Staging payment verification       |
| `production` | Sample rows hidden     | Disabled unless an approved live provider gate is complete | Launch after documented setup |

Production checkout defaults to disabled. It opens only when `PAYMENT_PROVIDER=paystack`, `PAYMENT_PROVIDER_VERIFIED=true`, and an `sk_live_` secret are all present; test and live key prefixes cannot be mixed.

## Local setup

Requirements: Node.js 22.13 or newer and npm.

```powershell
cd C:\Users\USER\Downloads\HERLIYAH\herliyah-store
npm install
Copy-Item .env.example .env.local
Copy-Item .dev.vars.example .dev.vars
npm run db:setup:local
npm run dev
```

Open `http://localhost:5173`. The same command serves the UI and `/api`; `/api/health` reports the active mode and bindings. D1 state is stored under ignored `.wrangler/state`. `db:migrate:local` uses Wrangler's migration journal and is safe to rerun; the sample seed is idempotent and is only appropriate for preview/test.

Checks:

```powershell
npm run lint
npm test
npm run build
npm run test:e2e
```

`npm run test:e2e` expects `npm run dev` to be running on port 5173 and a local Microsoft Edge/Chromium installation. `npm run start` serves the previously built Worker locally using the same D1 state.

## Configuration

Non-secret settings belong in `.env.local` locally and Worker variables when deployed:

- `APP_MODE`: `preview`, `test` or `production`.
- `PUBLIC_APP_ORIGIN`: public origin used for payment callbacks; local default is `http://localhost:5173`.
- `PAYMENT_PROVIDER`: `paystack`. Paystack is the approved HERLIYAH launch provider.
- `PAYMENT_PROVIDER_VERIFIED`: keep `false` until staging callback, webhook, amount/currency/environment, and reconciliation tests are approved.
- `ADMIN_AUTH_MODE`: use `preview-token` only for localhost preview; deployed environments use `cloudflare-access`.
- `CF_ACCESS_TEAM_DOMAIN`: full Access issuer, for example `https://team-name.cloudflareaccess.com`.
- `CF_ACCESS_AUD`: Access application audience tag.
- `ADMIN_EMAIL_ALLOWLIST`: comma-separated, lower/upper case insensitive owner email list.
- `EMAIL_PROVIDER`: `disabled` or `resend`.
- `EMAIL_FROM`: verified transactional sender.
- `CUSTOMER_AUTH_ISSUER`, `CUSTOMER_AUTH_JWKS_URL`, `CUSTOMER_AUTH_AUDIENCE`, `CUSTOMER_AUTH_CLIENT_ID`, `CUSTOMER_AUTHORIZATION_URL`, `CUSTOMER_AUTH_TOKEN_URL`: provider-neutral OIDC Authorization Code + PKCE settings.

Secrets belong in ignored `.dev.vars` locally and Worker secrets when deployed:

- `PAYSTACK_SECRET_KEY`: an `sk_test_` key in test mode. Live keys are not accepted.
- `EMAIL_PROVIDER_API_KEY`: Resend API key when email is enabled.
- `ADMIN_PREVIEW_TOKEN`: random local-only owner token of at least 16 characters.
- `CUSTOMER_SESSION_SECRET`: random value of at least 32 characters used to sign HTTP-only customer sessions.

Never commit `.env.local`, `.dev.vars`, or provider credentials. The tracked example files contain names only.

## Database, catalog and checkout

The versioned `drizzle/` migrations contain the core schema, checkout/payment events and refund records. The Drizzle TypeScript schema mirrors those deployed tables. `db/seed.sql` provides ten explicitly marked sample products, images, five size variants each, and a Lagos delivery zone.

The catalog API reads products, images, variants, availability, price and preparation windows from D1. Checkout ignores browser prices and validates every line, delivery zone, quantity and variant against D1. One D1 batch creates the order, immutable line snapshots, whole-basket reservation, capacity movements and payment attempt. Database constraints make the batch fail as a unit; the idempotency key returns the same logical checkout on repeats.

In test mode Paystack initialization occurs only after that batch commits. Callback and webhook paths verify the transaction server-side. The webhook requires the raw-body HMAC SHA-512 signature and still calls Paystack verification before confirming. Provider event IDs are unique. An order is confirmed only when the amount, NGN currency, test environment and capacity allocation all agree. Expired holds are verified before release; late success either reallocates the complete basket or moves the order to `payment_exception` for owner action.

The customer status screen persists pending, confirmed, failed and exception states. Recoverable checkout input is kept locally, and the cart is cleared only after the API reports a confirmed order.

## Paystack test setup

1. Set `APP_MODE=test` and the deployed `PUBLIC_APP_ORIGIN`.
2. Put an `sk_test_` key in `.dev.vars` locally or a Worker secret remotely.
3. Set the Paystack test webhook URL to `https://YOUR_ORIGIN/api/paystack/webhook`.
4. Run a test transaction and verify callback, webhook and reconciliation results in D1.

No Paystack credential is stored in this repository, so a real provider test has not been run here. Preview simulation exercises the same D1 confirmation/allocation code after provider verification would have succeeded.

## Admin authentication

ChatGPT-host identity headers are not trusted or used. Admin API routes are closed by default and return `503 admin_access_disabled`. To enable them independently:

1. Put `/admin/*` and `/api/admin/*` behind a Cloudflare Access self-hosted application.
2. Restrict its Access policy to the owner identity.
3. Set `ADMIN_AUTH_MODE=cloudflare-access`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, and `ADMIN_EMAIL_ALLOWLIST`.
4. Confirm Access sends `Cf-Access-Jwt-Assertion` and test denial with no token, the wrong audience and an email outside the allowlist.

The API independently validates the Access JWT signature, issuer and audience against Cloudflare's JWKS, then enforces the email allowlist. The `/admin` dashboard supports product lifecycle, image metadata/order/cover, variants and capacity, order fulfilment, courier data, audit history, settings, delivery zones, policies, and homepage features. For local preview only, `preview-token` provides safe dashboard access and is rejected on non-local hostnames.

## Cloudflare deployment

The Sites/Vinext build consumes `.openai/hosting.json` for logical `DB` and `PRODUCT_IMAGES` bindings and emits `dist/server/wrangler.json`.

```powershell
npm run build
npm run start
```

Before a real deployment, provision separate staging/production D1 and R2 resources, replace placeholder resource IDs in the generated/hosting configuration through the hosting workflow, apply every versioned migration, configure variables/secrets and Access, and register the Paystack test webhook. Load `db/seed.sql` only in non-production. The scheduled trigger is `*/5 * * * *`.

## Operational status and launch dependencies

Implemented flows include protected product administration, publication validation, variant capacity, product media, searchable orders, payment/fulfilment separation, courier updates, immutable order snapshots, guest tracking, optional OIDC accounts, scoped order history, cross-device wishlists, retryable email, delivery/settings management, and ordered homepage features.

Still external: Cloudflare Access configuration, staging/production D1 and R2, a customer OIDC application, a verified Resend sender/key, and a Paystack test key plus reachable webhook. Production payment defaults to disabled and requires the explicit verified-provider gate above. Provider simulation is limited to preview and is stored as provider `simulation`, never Paystack.

Still owner-approved: mixed-basket rule, delivery zones/fees/estimates, contact details, size guide, and policies. Paystack is the chosen launch provider. Real product content and photography must be entered through admin. Production filters all sample products and `db/seed.sql` must never be loaded there.

See `LAUNCH_CHECKLIST.md` for the four-part handoff and `OWNER_GUIDE.md` for daily operation.

See `VALIDATION.md` for checks actually run and `OWNER_GUIDE.md` for operational setup.
