# HERLIYAH: Product brief and build specification

Version: 1.1 | Date: 6 October 2026 | Status: Ready to start development; business decisions below remain open.

## 1. What we are building

A custom, mobile-first clothing store for HERLIYAH. The first collection has approximately ten designs, with multiple sizes and quantities per design. Products are preordered, with a preparation time that varies by style. Customers can browse, choose a specific variant, pay through Paystack, and receive an order confirmation with the promised preparation window. Checkout is guest-first; optional accounts offer order tracking and saved wishlists. The owner can manage products, photographs, preorder capacity, and orders from a simple dashboard without editing code.

Build now using clearly identified sample products and imagery. Product photography is not a prerequisite for development. Real payments and fulfilment remain disabled until the launch checklist is complete.

This is a real ecommerce product, not only a landing page. A polished interface with simulated checkout does not count as a completed store.

## 2. Confirmed direction and working assumptions

**Confirmed:** custom build; brand name HERLIYAH; luxurious, charismatic, classic appearance; supplied cream and olive wordmark; approximately ten designs with size variants; preorder sales with style-dependent lead times; Paystack payment processing; manual delivery; guest-first checkout; optional customer accounts for order tracking and wishlists; placeholders acceptable during development.

**Working assumptions, configurable:** Nigeria-first; NGN currency; full upfront payment for preorders; one owner/admin initially; manual courier fulfilment. Preorder quantity limits represent available production/allocation capacity, not finished garments. Confirm how the owner sets capacity before launch. Do not implement deposits, instalments, international checkout, or custom measurements without a further decision.

**Design reference:** the generated desktop/mobile homepage concept is a direction to explore, not an approved final design. Its clothing, models, product names, and headline are samples, not claims about actual merchandise. Obtain the original logo file for the final site; do not extract a logo from a screenshot if a better source exists.

## 3. First-release scope

| Area | Required behaviour |
|---|---|
| Homepage | Brand identity, collection introduction, featured products, clear shopping action, concise brand story, useful footer |
| Shop | Published designs, prices, availability, filters by size/category where useful, sorting, friendly empty states |
| Product page | Image gallery, description, price, variant choice, size guide, care information, clear preorder badge and style-specific preparation window, delivery/returns links, quantity selection |
| Cart | Edit/remove items, persistent local cart, item and subtotal display, capacity revalidation |
| Checkout | Guest details, address, configured delivery option and fee, final total, Paystack payment |
| Confirmation | Secure guest order access, payment state, purchased items and preparation-window snapshots, production and delivery progress |
| Customer accounts | Optional signup/login, verified ownership of orders, order history/progress, persistent wishlist; never required to purchase |
| Admin | Secure login, product editing, image upload/reordering, variants, capacity adjustments, order management, settings |
| Notifications | Customer confirmation and owner new-order email with retry support |
| Operations | Payment reconciliation, reservations, audit history, backups, error monitoring |

**Defer:** reviews, loyalty, discounts, gift cards, abandoned-cart campaigns, live courier integrations, international currency, multi-warehouse stock, marketplace features, AI tools, advanced analytics. Keep the model extensible without building these now.

## 4. Design and usability

- Cream base, olive accents, dark readable text. Initial tokens: cream `#FFF0D6`, olive `#73891B`; tune contrast before shipping.
- Keep HERLIYAH as the full wordmark. Use a simple **H** monogram as the initial small icon/favicon, with HER as an alternative to preview. Match the wordmark's serif character; do not squeeze the full name into a favicon. Provide SVG and browser/app icon sizes and verify legibility at 16px and 32px. These are brand assets, not a replacement for the wordmark.
- Fashion serif for the wordmark/headings, readable body type, generous spacing, strong photography, restrained motion. Avoid a generic dashboard aesthetic on the storefront.
- Luxury should come through layout, typography, imagery, and detail, rather than excessive decoration.
- Prioritise phones, including iPhone Safari. Product grids use two columns where readable; product pages and checkout stack cleanly.
- Inputs use at least 16px text to avoid mobile focus zoom. Touch controls should be comfortably sized; keyboard navigation, visible focus, labelled inputs, descriptive image alternatives, and accessible dialogs are required.
- Respect reduced motion. Do not autoplay heavy media or hide shopping actions behind animation.
- No fake reviews, unsupported sustainability claims, invented delivery promises, scarcity timers, or fabricated customer numbers.
- Sample content belongs in development/staging only. Sample prices must be marked as samples and replaced before launch.

## 5. Customer journeys

### Browse and choose

Homepage → shop/product → choose size and colour if relevant → quantity → add to bag. A product cannot be added without an explicit valid variant. Never silently choose a size. Unavailable combinations are visibly disabled. Provide a size guide and measurement units; do not invent the brand's actual measurements.

Each design has a stable product ID and URL slug. Preorder capacity belongs to the purchasable variant (for example Design A / Medium / Olive), not the product total. If sizes share production capacity, the owner must choose a shared style/batch capacity model; do not multiply the same capacity across sizes. Different colours may have different images and availability.

### Cart and checkout

The browser cart remembers variant IDs and quantities. Show the preorder notice and each item's preparation window in the cart and checkout. Adding an item does not reserve capacity. The server recalculates prices, validates published products and availability, and computes delivery at checkout. Browser-provided totals are never authoritative.

Required fields: full name, email, phone, delivery address, city/area and state. Postal code is optional unless needed for the configured service. Order note and landmark are optional. Collect only information needed for the order. Marketing opt-in, if introduced later, must be separate.

Show item subtotal, delivery charge, any configured taxes, and final NGN total before payment. Do not invent a tax rate. Support only destinations with configured delivery rules; show a clear unsupported-location message instead of charging a placeholder fee. Require acknowledgement of published purchasing terms and clearly disclosed preorder timing. Separate preparation time from courier transit time; never label production days as days until arrival.

### Payment result

Return page checks the server's order status. A browser redirect or popup success alone is insufficient to show a paid order. Pending transactions show a calm message and a retry-status action without initiating another charge automatically. Failed/abandoned checkout preserves the cart for retry after capacity is revalidated.

## 6. Preorder capacity, timing and reservations: release-critical

### Style-specific timing

Every published preorder design requires a minimum/maximum preparation time, day basis (business or calendar days), and start trigger. Initial proposal: production time begins after verified payment. Actual durations, day basis and holiday rules need owner confirmation; do not invent final values.

Show, for example, “Preorder · Ready to dispatch in [X–Y] business days after payment” with courier delivery time separately, once the owner supplies those values. Snapshot the displayed lead time, policy version and calculated dispatch window on each order item. Later product edits must not change an existing promise. Use Africa/Lagos for business date calculations; store event timestamps in UTC.

Default basket policy for implementation: ship all items together when the slowest style is ready. Disclose this before payment and base the order dispatch estimate on the latest item window. Owner must confirm this policy before launch. Split shipping and multiple delivery charges are deferred.

When a delay occurs, the owner records a revised estimate and customer-facing explanation; preserve the original promise and notify the customer. Do not silently move the original date. Tracking is manually updated production/delivery progress, not live GPS or courier integration.

### Allocation limits

Use an auditable capacity ledger, active reservations and committed paid allocations. Available preorder capacity = configured capacity minus committed allocations minus active reservations. Available capacity must never become negative. Label unavailable variants “Preorders closed” rather than implying finished stock sold out.

1. On payment initiation, validate the whole cart, required timing configuration and capacity, then reserve the entire basket atomically. If any item is insufficient, reserve nothing.
2. Create immutable order snapshots and a unique payment attempt reference. Checkout idempotency keys prevent duplicate orders/holds.
3. Initial reservation duration: 20 minutes, configurable; it does not prove a provider payment cannot succeed later.
4. Verified success converts the hold into a committed paid preorder exactly once. It does not deduct imaginary finished stock.
5. Payment initialisation failure releases holds. Browser closure alone does not; reconciliation/expiry jobs handle this.
6. Reconcile provider status before expiry release. Provider uncertainty follows a retry/manual-review path.
7. If successful payment arrives after release, attempt atomic whole-basket reallocation. If capacity is unavailable, retain the successful payment, mark allocation/fulfilment as exception, alert the owner and resolve through refund or customer-approved alternative. Never accept beyond capacity automatically.
8. Admin capacity edits cannot invalidate committed orders/active holds. Increases and reopening require explicit owner action and an audit entry.
9. Cancellation requires an explicit capacity-release decision based on production stage. Refund alone does not restore capacity; cancelled work already in production may still consume resources.
10. Production completion does not automatically reopen capacity. The owner resets or increases the relevant production batch/limit deliberately.

Codex must demonstrate atomic reservation on D1. Separate read/update calls are unsafe. A conditional update affecting zero rows must fail the entire basket rather than leave partial holds. Use constraints/guards and transactional batches where appropriate; resolve any implementation limitation before completing checkout.

### Optional accounts and wishlists

Guest checkout remains the default. Provide sign in/create account in navigation and an optional invitation after purchase; never block checkout with registration. Use a managed customer authentication provider with verified email and account recovery, separate from admin privileges.

Guests receive secure order access and can track the same production/delivery stages without signing up. An account gives a central order history and persistent wishlist. Guest access never requires an account retroactively.

Link a guest order only after verifying control of its checkout email or a secure claim link. A typed matching email is not proof. Enforce ownership on every account/order API request and prevent linking orders to a different verified identity without a secure support flow.

Wishlist supports save/remove designs, persists across devices for signed-in customers, and links to product pages. A guest save action may prompt sign-in; preserve the intended save after successful login. Saving does not reserve capacity or guarantee availability. Show archived/unavailable items gracefully; allow removal. No marketing emails from wishlist activity.

## 7. Payments and order states

Paystack processes payments; our backend owns order totals, confirmation, inventory changes, and fulfilment eligibility.

- Use server-side transaction initialisation and verification. Store monetary amounts as integer kobo, currency NGN.
- Validate webhook authenticity using Paystack's documented signature procedure on the raw request body.
- Match reference, amount, currency, success status, and expected test/live environment against the stored payment attempt. A mismatch creates an exception; it cannot fulfil an order.
- Make webhook processing, callback verification, scheduled reconciliation, and notification dispatch idempotent. Persist enough state to recover after a crash.
- Separate payment attempts from orders so a failed attempt can be retried without losing history. If more than one attempt succeeds, record and flag the extra payment; never fulfil twice.
- Never expose secret keys to the frontend, logs, repository, or documentation. Do not store card details.

Keep these state dimensions separate:

| Dimension | Suggested states |
|---|---|
| Order | awaiting_payment, confirmed, cancelled, closed |
| Payment attempt | initiated, pending, succeeded, failed, exception |
| Reservation | active, consumed, released |
| Fulfilment | awaiting_production, in_production, quality_check, ready_to_dispatch, dispatched, delivered, cancelled, delayed, exception |
| Refund record | requested, pending, succeeded, failed |

Show customer-friendly labels. Paid orders retain their payment history even when cancelled/refunded. Only confirmed payments with allocated preorder capacity are eligible to enter production. Dispatch additionally requires production completion.

Refunds can be executed manually in Paystack for version one. Admin records the provider reference and confirmed status; recording a refund is not the same as sending money. Do not expose a misleading automatic refund button without a real integration.

## 8. Admin experience

An authenticated mobile-friendly dashboard with Products, Inventory, Orders, and Settings. One owner login initially; no public admin registration, shared default password, or client-side-only authentication. Use an established managed authentication/access solution; confirm the provider during setup, enforce access on every admin API route, and document account recovery.

### Products and photographs

Create/edit title, slug, description, price, category, care information, size-guide association, images and variants. Configure style-specific lead-time range, day basis, preorder open/closed state and capacity; publishing or accepting checkout without these is blocked. Draft/published/archived states; unpublished products cannot be purchased via direct API requests. Preview before publishing. Archiving preserves historical orders. Products referenced by orders must not be destructively deleted.

Upload, reorder, set cover photo, add alternative text, and remove unused photos. Validate file type and size, generate optimised images/thumbnails, retain consistent aspect ratios. Reject executable content and unsafe SVG uploads for version one. Paginate lists rather than loading every asset.

### Inventory

View available preorder capacity, active holds and committed allocations per variant or configured style/batch. Adjust capacity with a reason and audit entry. Allow a configurable low-capacity threshold. Validate nonnegative whole numbers. Keep admin actions usable from a phone.

### Orders

Search/filter by order number, date, payment and fulfilment status. View customer delivery details, immutable purchased item snapshots, totals, payment attempts, and exception history. Move eligible orders through production, quality check, ready-to-dispatch, dispatched and delivered; track per-item readiness for mixed-style orders, record delays/revised windows, and optionally add courier/tracking reference and internal notes. Do not allow a manual status toggle to fabricate a Paystack payment success.

Provide order CSV export for owner use, including protection against spreadsheet formula injection. Customer information must never be exposed through public product endpoints.

### Settings

Manage brand/contact details, published policy content, delivery zones/fees and checkout availability. Technical credentials remain server-managed secrets. Provide a checkout pause control while still allowing browsing.

## 9. Delivery, policies and notifications

Manual dispatch is sufficient initially. Configure explicit delivery zones and fees; courier API work is deferred. Store the delivery rule and fee as an order snapshot so later changes do not alter existing orders. Production timing is set per style; transit estimates are configured separately per delivery zone. Shipping estimates, return windows, exchange conditions, contact channel and handling of lost/damaged deliveries require owner input before launch.

Build editable About, Contact, Delivery, Returns/Exchanges, Privacy and Terms pages. Development placeholders must say they need owner review; do not publish them as final business promises.

Use a transactional email provider selected during setup (for example Resend). Send a customer confirmation and owner alert after confirmed payment/capacity allocation. Exception payments receive appropriate acknowledgement, not a false dispatch promise. Send dispatch notice if tracking/delivery information is recorded. Store an outbox with unique event keys and retry failed sends; email failure must not roll back a paid order or charge the customer again. Verify the sending domain before production.

Guest order access uses a high-entropy token or equivalent secure mechanism; sequential order numbers alone must not expose order details. Do not place customer data in URLs. Protect order/status endpoints from enumeration and rate-limit them.

## 10. Proposed technical architecture

| Component | Choice |
|---|---|
| Storefront/admin | React + TypeScript; Vite build; intentional custom styling |
| API/hosting | Cloudflare Workers; Hono for API routing |
| Data | Cloudflare D1 with versioned SQL migrations |
| Product images | Cloudflare R2, optimised derivatives, CDN delivery |
| Payment processing | Paystack hosted checkout and server verification/webhooks |
| Background work | Worker scheduled jobs for reconciliation, reservation expiry and email retries |
| Authentication | Managed customer authentication plus separately enforced owner/admin access; choose provider before protected writes |
| Code/version history | GitHub |
| Transactional email | Provider selected during setup; sending-domain verification required |

Use separate development, staging and production databases, storage and credentials. Local/demo mode uses mock data and a payment adapter; it must never be able to call live Paystack accidentally. Preview mode shows a persistent sample-store notice. Test mode uses Paystack test credentials. Production mode rejects sample products and refuses checkout when required configuration is absent.

Deployment instructions must include environment-variable names without secret values, migrations, scheduled jobs, webhook setup, image storage, account ownership, and rollback/recovery. Domain, hosting, Paystack and email accounts should belong to the sister/business, with collaborator access where needed.

### Minimum data model

Products; product_images; variants (unique SKU and unique product/size/colour combination); capacity_movements; production_batches if using shared limits; customers/auth identity mappings; wishlists; wishlist_items; secure order_claims; order_status_events; orders; order_items (immutable name/SKU/size/colour/price and lead-time/dispatch-window snapshots); reservations; reservation_items; payment_attempts; refunds; delivery_zones; notification_outbox; admin_audit_log; store_settings.

Use foreign keys, unique payment references and idempotency keys, timestamps, appropriate indexes, and bounded pagination. Order snapshots survive edits to products/prices/addresses and delivery settings. Store timestamps in UTC and display owner-facing dates in Africa/Lagos.

## 11. Reliability, security and performance

- Serve static assets through the CDN; never publicly cache checkout, admin, order details or customer information.
- Compress responsive product images, reserve dimensions to prevent layout shifts, lazy-load below the fold, and prioritise the hero image. Target a mobile LCP of 2.5 seconds or less under a documented representative test setup.
- Validate all inputs on the server, use parameterised SQL, restrict admin writes and upload permissions, and use secure session handling and CSRF protections where applicable.
- Rate-limit login, checkout, uploads and public status lookup. Persist checkout state so a refresh cannot create a second charge.
- Protect logs: no secrets, full payment payload dumps or unnecessary customer data. Correlate errors using order/payment IDs.
- Monitor payment exceptions, failed jobs, emails and application errors. Define owner alerts and a manual recovery path.
- Use D1 recovery plus scheduled exports as appropriate, and preserve R2 media separately. Test recovery against nonproduction data; rollback of code must not erase orders. Never restore an old production database without reconciling intervening payments/orders.
- Document provider limits and measured capacity. Managed hosting is not unlimited scaling; set available budget/usage alerts and measure before expanding infrastructure.
- Aim for accessible WCAG AA interactions/contrast. No horizontal overflow at 360px; verify at 390px and desktop sizes too.
- Product metadata, canonical URLs, sitemap and valid product structured data use real published information. Verify product URLs produce useful crawlable metadata; a generic React shell is insufficient for production SEO.

## 12. Build sequence and deliverables

### Phase 1: Foundation and visual storefront

Repository, project structure, theme tokens, responsive homepage/shop/product/cart, mock product adapter, ten clearly labelled sample preorder designs with size variants and sample preparation windows, H favicon/monogram, account/wishlist/tracking screens, routes, image placeholders, loading/empty/error states. Use licensed or generated sample imagery; never imply it is actual merchandise. Deliver a working preview and document what is simulated.

### Phase 2: Database and admin

Migrations, real product/inventory APIs, managed admin and customer login, product/image editing, timing/capacity configuration, publishing, capacity adjustments, wishlist persistence, secure guest-order claiming, account order history and audit trail. Replace mock data through an adapter rather than rewriting the storefront. Demonstrate that admin changes persist and appear on the storefront.

### Phase 3: Checkout and payments in test mode

Delivery configuration, server-calculated totals, atomic capacity reservations, mixed-style dispatch estimates, Paystack test integration, webhooks/verification, reconciliation, secure order pages, order dashboard, email outbox. Prove the entire purchase flow before enabling real money.

### Phase 4: Production readiness

Replace sample content, configure real owner accounts, policies, fees and domain; complete security, mobile, concurrency, recovery and payment checks. Production launch is blocked until checklist items are complete. Supply an owner handover guide.

For every phase, Codex reports implemented behaviour, validation evidence, unresolved issues, and the next step. Never describe an unfinished or mocked feature as complete.

## 13. Acceptance checks

- A shopper can choose a variant, add/edit/remove items, refresh, and retain the cart.
- Closed or capacity-exhausted preorder variants cannot be purchased, including through direct API requests or stale carts.
- Every preorder displays its preparation window before payment and in confirmation; production and transit are separate.
- Mixed-style baskets calculate and disclose combined shipment timing correctly. Product timing edits do not rewrite past orders; delays preserve original estimates.
- Guest checkout works without signup. Guest links and signed-in dashboards show owner-entered progress with timestamps, never fictitious live courier tracking.
- Account A cannot view/claim Account B's orders. Matching unverified email cannot claim a guest order.
- Signed-in wishlists persist across devices; guest sign-in preserves the intended save. Saved items do not reserve capacity.
- Tampered browser prices/delivery totals are ignored; the server calculates the final amount.
- Two simultaneous purchases for the last unit cannot both allocate it. A multi-item basket with one unavailable item creates no partial reservation.
- Repeated checkout submissions initialise one attempt for a given idempotency key.
- Duplicate/out-of-order webhook and callback requests never commit capacity, fulfil, or send confirmation twice.
- Invalid signatures, mismatched amounts/currencies and test/live mismatches cannot confirm fulfilment.
- Payment success while the browser is closed still records the order. Provider/network uncertainty shows pending, not a fabricated failure.
- Late success after reservation expiry follows reallocation or exception handling and alerts the owner.
- Email-provider failure leaves payment/order intact and retries safely.
- Historical orders retain their original price, variant and delivery details after admin edits.
- Anonymous visitors cannot access admin operations, other people's orders, customer exports or private images.
- Owner can create a product, upload/reorder pictures, publish, adjust preorder capacity/timing, update production progress, and dispatch an eligible order on a phone.
- Verify iPhone Safari plus a desktop browser, keyboard controls, contrast, slow-network states, and image loading.
- Run a documented staging load test against agreed traffic targets using mocked provider calls; inspect latency, errors and database limits. No invented visitor-capacity claims.
- Verify nonproduction backup recovery and deployment rollback instructions.

## 14. Owner decisions and launch checklist

Development can start now. These answers are needed at the relevant phase, not all before the first screen:

- Actual product names, prices, preorder capacity per variant or shared production batch, measurements, descriptions and care instructions.
- Preparation range for each style, business/calendar days, holiday treatment and confirmation that timing begins at verified payment.
- Confirm full upfront payment and the proposed combined-shipping policy for mixed-style baskets.
- H monogram direction (initial choice) or HER alternative.
- Delivery locations, fees, courier process, timing, and whether pickup is offered. Pickup is not enabled by default.
- Return/exchange/refund rules and final approved policy text.
- Business contact details, support channel, brand story, original logo and final photographs.
- Owner's Paystack account activation, settlement details and live credentials entered securely.
- Owner admin email, chosen authentication provider and recovery setup.
- Domain, email provider, verified sender, and hosting budget.
- Reservation policy confirmation and treatment of delayed bank-transfer payments.
- Final approval of storefront design and sample replacement.

**Launch gate:** no sample merchandise, working admin and customer authentication, verified guest-order claiming, real preorder capacity/lead times and delivery rules, owner-approved policies, verified live payment configuration, tested reconciliation/idempotency, working email, confirmed mixed-style shipping policy, monitoring/recovery, and checkout smoke test. Until then, keep the build in preview/test mode.

## 15. Instructions to Codex

Use this file as the product source of truth. Start with Phase 1 and continue through independent work without waiting for photographs. Preserve the intended production architecture even while using mock adapters. List assumptions openly and make business rules configurable.

Do not add deferred features or unnecessary services. Do not silently reduce scope to a static showcase. Do not embed credentials or enable live payment during placeholder development. Raise concrete blockers when they arise; complete work that does not depend on missing owner decisions. Update this brief when an agreed decision changes.

Required handover: source code, migrations and seed data, example environment configuration, deployment/setup README, validation notes, and an owner guide. Keep this brief in the project as `PRODUCT.md` if that naming fits the repository.

## 16. Official implementation references

Consult current official documentation during implementation; these links are starting points, not substitutes for testing.

- Cloudflare web apps: https://developers.cloudflare.com/use-cases/web-apps/
- D1 database API and batches: https://developers.cloudflare.com/d1/worker-api/d1-database/
- D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- D1 recovery: https://developers.cloudflare.com/d1/reference/time-travel/
- Paystack payment acceptance: https://paystack.com/docs/payments/accept-payments/
- Paystack verification: https://paystack.com/docs/payments/verify-payments/
- Paystack webhooks: https://paystack.com/docs/payments/webhooks/

Paystack verification and webhook guidance checked on 6 October 2026. No specific hosting price or unlimited-capacity guarantee is assumed.
