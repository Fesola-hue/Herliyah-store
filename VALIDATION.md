# Validation record

## Automated

- Reservation model: whole-basket atomicity, last-unit contention and idempotency replay.
- Static preview checks: navigation targets, required sample notice, ten sample product records and local asset references.
- D1 migration and sample seed executed in an in-memory SQLite database: 10 products and 50 variants loaded.
- Local HTTP smoke checks returned 200 for home, shop, product, cart, checkout and admin routes.

## Environment limitations

- No browser surface was available to the verification tool, so screenshot-based checks at 390px and desktop widths could not be completed here.
- Package downloads and the Sites source endpoint were unavailable, so the React/Vite dependency build and private hosted publish could not complete. The dependency-free static preview in `dist/` was used for local flow verification.

## Manual browser checks required before launch

- iPhone Safari and desktop browsing at 390px and desktop widths.
- Keyboard focus, menu, filters, explicit variant selection, unavailable variant state, cart editing and persistence.
- Paystack test initialize/verify/webhook flows with duplicate and out-of-order events.
- Managed-auth ownership isolation and secure guest-order claim links.
- D1 concurrency, reservation expiry, late success, outbox retry and nonproduction recovery.

No live payment, customer authentication, email, delivery rule or upload flow is represented as complete in the preview.
