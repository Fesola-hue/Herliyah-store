# HERLIYAH store

Mobile-first preorder storefront and owner-workspace prototype for HERLIYAH. The source of truth is `PRODUCT.md`.

## Current modes

- `preview`: sample catalog, persistent device-local cart/wishlist, simulated checkout. It cannot call Paystack.
- `test`: intended for Paystack test credentials after D1/R2 and authentication are configured.
- `production`: must reject sample products and remain checkout-paused until the launch checklist is complete.

## Stack

React + TypeScript through the Vite-powered Vinext starter; Cloudflare Worker API source with Hono; D1 migration and seed SQL; R2 binding reserved for product images; Paystack behind a payment adapter.

## Local setup

1. Install Node 22+ and run `npm install`.
2. Copy `.env.example` to `.env.local` and keep `APP_MODE=preview`.
3. Run `npm run dev`.
4. Run `npm test` for reservation-model checks.

The current environment could not download npm packages, so the published preview uses the dependency-free static build in `dist/`. The React source remains the intended application surface.

## Database and images

Declare logical bindings `DB` and `PRODUCT_IMAGES` when enabling the Worker runtime. Apply `drizzle/0000_herliyah_core.sql`, then load `db/seed.sql` only in development or staging. Product bytes belong in R2; searchable metadata and ownership stay in D1.

The capacity guard is enforced in SQLite and the reservation service submits the whole basket as one D1 batch. A failed statement rolls the batch back; idempotency keys are unique. Reservation expiry, reconciliation, late-payment reallocation/exception handling and notification retries still require their scheduled handlers before checkout is complete.

## Secrets and external setup

Never commit `.env.local` or any provider key. Configure secrets in the hosting control plane. Use only `sk_test_` Paystack keys in test mode. Configure a managed customer identity provider and a separate server-side admin allowlist; customer signup must never grant admin access.

## Deployment sequence

1. Create separate development, staging and production D1/R2 resources.
2. Apply migrations, load sample seed data only outside production, and configure managed authentication.
3. Add delivery zones, reviewed policies, real merchandise, capacity and preparation settings.
4. Add Paystack test keys and webhook URL; verify raw-body HMAC SHA-512, amount, currency, reference and environment.
5. Run concurrency, callback/webhook idempotency, recovery, accessibility and mobile browser checks.
6. Replace samples, pass the launch gate, then add live credentials through secret management.

Code rollback does not roll back D1 or R2. Use D1 Time Travel and tested exports for recovery, and reconcile intervening Paystack events before any restore.
