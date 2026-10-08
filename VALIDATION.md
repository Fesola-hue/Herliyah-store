# Validation record

This record distinguishes current checks from older visual-preview work.

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
- Email outbox insertion is covered by the payment transaction, but no email provider or retry sender exists.
- Customer identity isolation, cross-device wishlist/order history and guest-order claiming are not implemented.
- Physical iPhone Safari, assistive technology, load/rate-limit, monitoring and backup/restore drills remain required before launch.
