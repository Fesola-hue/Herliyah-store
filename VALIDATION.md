# Validation record

This record distinguishes current checks from older visual-preview work.

## Operational-store checks (11 October 2026)

- `npm test`: all 15 tests pass. The new real-D1 scenario creates an incomplete owner draft and confirms publication is blocked, completes its content/variants/images, reorders the gallery and cover, publishes it, finds the non-sample product in the production catalog, places and verifies a simulated order, advances every fulfilment state through delivered, checks courier/payment/tracking data, rejects a bad guest token, and confirms audit records. A separate security test rejects missing/wrong local tokens and rejects the local token on a deployed hostname.
- The previous 13 checkout/reservation tests still pass, including concurrent last-unit protection, atomic basket rollback, idempotency, duplicate payment events, expiry, reconciliation uncertainty, and late-payment exceptions.
- `npm run test:e2e` passes against the live local Vinext Worker and migrated D1: product selection, cart, delivery-zone quote, checkout, explicit preview payment, server confirmation, consumed reservation, cleared cart, no overflow, and no browser-console errors.
- `npm run build` completes all Vinext/Vite environments. `npm run lint` has no functional errors after the final run; remaining warnings concern existing native `<img>` usage and terse QA-script expressions.
- The existing local D1 predated the Wrangler journal, so replaying migration 0000 was correctly refused. Its schema was inspected and only additive `0003_store_operations.sql` was applied successfully (24 statements); existing local rows were retained.
- Production catalog queries exclude every `is_sample=1` row. Publication validation also rejects sample rows, missing content, missing/invalid images, invalid sizes/variants, and missing timing.
- Guest tracking requires a SHA-256-matched high-entropy token. Account order history is scoped by signed customer ID and verified provider subject. Local admin tokens require preview mode plus localhost; deployed admin remains Cloudflare Access JWT + email allowlist.
- Email events are persisted with the order change, claimed before sending, use provider idempotency keys, and retry exponentially up to eight attempts. No configured provider means no false “sent” state.

## Current backend and checkout checks (8 October 2026)

- `npm test`: passed all 13 tests. Eight tests run against an actual Miniflare D1 service with the real migrations and seed. They cover atomic creation, multi-line rollback, competing last-unit reservations, idempotent checkout replay, duplicate payment events, one-time expiry release, late-success reallocation, late-success exception, and retaining capacity during provider verification uncertainty. Five earlier reservation-model tests also pass.
- `npm run lint`: exited 0 with no errors. It reports 13 non-blocking warnings: nine existing native product-image elements (an image-optimisation follow-up) and four terse expressions in browser QA scripts. No lint rule was disabled.
- `npm run build`: completed all five Vinext/Vite environments successfully after the Worker schedule, Hono routes and admin JWT verifier were included.
- A clean temporary D1 applied all three migrations through Wrangler's journal. The journal's no-op repeat behaviour was also verified before the final refund migration was added.
- Local D1 migrations and sample seed were applied with Wrangler. `/api/catalog` returned all 10 sample products, D1 variants and assigned sample images.
- Direct HTTP journey passed: product/variant selection data was read from D1, the server recalculated a ₦97,000 total, created an order/reservation/payment attempt, preview confirmation consumed the hold, and the status API returned confirmed/succeeded/consumed.
- `npm run test:e2e` passed against the live Vinext development server in headless Edge. It selected a D1-backed product variant, added it to the cart, entered checkout details, created the order, completed preview payment, observed “Your preorder is confirmed”, verified an empty cart/no horizontal overflow/no browser errors, and confirmed D1/API order `confirmed`, payment `succeeded`, reservation `consumed`.

The browser E2E used the preview payment adapter, not Paystack. It validates the application and D1 journey after the provider-verification boundary; it does not prove Paystack network, dashboard or webhook delivery.

## Earlier responsive checks

- Headless Edge previously checked home, shop, product, cart, checkout, account, wishlist and tracking at 360, 390, 768, 1024 and 1440 pixel widths for overflow and clipping.
- Focused product interaction previously exercised colours, available sizes, size guide, quantity, wishlist and add-to-cart at 360/390 pixels.
- Storefront screenshots were visually reviewed for hero crop, model visibility, editorial contrast, content edges, typography and product cards.

These older checks predate the D1 catalog/checkout changes. The focused checkout E2E was rerun after those changes, but the full multi-route screenshot matrix was not rerun.

## Blocked or unverified

- Real Paystack test initialization, callback verification, signed webhook delivery and scheduled reconciliation require an owner `sk_test_` credential and reachable staging URL. The code rejects live keys.
- Cloudflare Access denial/allowance with a real issuer and owner account requires the Access application/audience and owner email.
- Hosted D1/R2 migrations, R2 uploads, scheduled triggers and production resource binding have not been exercised on a deployed Worker.
- Resend delivery and retry behaviour require a verified sender and API key for an external staging test; the sender/retry implementation is complete locally.
- Customer OIDC login requires an external identity application to exercise provider redirects; server sessions, identity isolation, linked order history, and wishlist persistence are implemented.
- Physical iPhone Safari, assistive technology, load/rate-limit, monitoring and backup/restore drills remain required before launch.
