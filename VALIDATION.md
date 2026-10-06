# Validation record

## Automated

- Reservation model: whole-basket atomicity, last-unit contention and idempotency replay.
- Static preview checks: navigation targets, required sample notice, ten sample product records and local asset references.
- D1 migration and sample seed executed in an in-memory SQLite database: 10 products and 50 variants loaded.
- Local HTTP smoke checks returned 200 for home, shop, product, cart, checkout and admin routes.
- Headless Edge checked home, shop, product, cart, checkout, account, wishlist and tracking at 360px, 390px, 768px, 1024px and 1440px (40 route/viewport combinations). All passed the horizontal-overflow, header-centering, header-mode, wordmark-wrap and clipped-content checks.
- Full-page screenshots were captured for all eight shopper routes at 360px and 390px. Initial-screen screenshots were captured for home, shop and product at both phone widths.
- The generated screenshots were visually inspected for editorial-image text contrast, model visibility, content-edge consistency, responsive type scale, product-card readability, hero crop and vertical rhythm.
- Product variant selection, add-to-bag, cart rendering, cart persistence after reload and shop search passed at 390px and 1440px. The mobile filter panel also passed category Apply, active-filter display, individual removal and Clear behaviour at 390px.
- No runtime exceptions or browser-console error entries were recorded during the 40-screen sweep.
- Phase 3 reservation recovery tests cover one-time expiry release and ensure consumed reservations cannot be released or committed twice.
- The production build completed after the Phase 2 foundation added D1/R2 bindings, owner-authenticated admin routing, catalog/admin APIs, audited product and capacity updates, and product-image storage.

## Focused mobile product-page pass

- Rechecked the Amara Drape Dress, Tomi Skirt Set (short name) and Eniola Wide Trouser (long name) at both 360px and 390px: six product/viewport combinations passed with no horizontal overflow or clipped purchase controls.
- At every viewport, automation tapped every colour, every available size, the size-guide toggle, quantity, wishlist and Add to Bag. The selected variants, quantity change, wishlist state, cart count and confirmation message were verified.
- Fresh full-page screenshots are stored in `.visual-qa/product-mobile/`, including `full-360-amara.png` and `full-390-amara.png`. The Amara, shortest-name and longest-name captures were visually inspected after the interaction run.
- The focused browser run recorded no console errors. Unit tests (3/3) and the production build also passed after the layout changes.

## Homepage, gallery, browsing and checkout pass

- Headless Edge rendered and captured the storefront at 1366×768, 1440×900, 360×780 and 390×844. The homepage headline and collection action were fully inside the initial viewport at all four sizes, with no horizontal overflow.
- The shop retains all ten clearly labelled sample designs, while the homepage deliberately features the first four. Each sample product exposes one assigned design/colour photograph; replacement merchandise photography is still required before launch.
- The interaction sweep selected gallery thumbnails where present, colour and size, added to bag, increased and decreased cart quantity, navigated through a related design, and returned to the original filtered/search result. Search and filter query state survived both product transitions.
- Checkout validation, saved customer fields after reload, backend-calculated subtotal/delivery/total, guarded duplicate submission and the pending preview confirmation all passed at every viewport. No live payment or inventory reservation was created.
- Four complete end-to-end viewport runs passed with zero browser-console errors. Fresh initial and full-page captures are stored in `.visual-qa/storefront-flow/`.

## Environment limitations

- Browser verification used the live Vinext development server against the same React source. Hosted D1/R2 migration and owner-write checks remain dependent on publication and runtime configuration.
- Private Sites publication depends on the external source endpoint; any publish failure is reported separately in the handoff.

## Manual browser checks required before launch

- Physical-device Safari/Chrome checks before launch; automated Chromium coverage is recorded above.
- Keyboard and assistive-technology checks beyond the automated focus and layout review.
- Paystack test initialize/verify/webhook flows with duplicate and out-of-order events.
- Managed-auth ownership isolation and secure guest-order claim links.
- D1 concurrency, reservation expiry, late success, outbox retry and nonproduction recovery.

No live payment, customer authentication, email, delivery rule or upload flow is represented as complete in the preview.
