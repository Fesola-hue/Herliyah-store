# HERLIYAH launch checklist

## 1. Features completed and verified

- [x] Protected owner dashboard for products, images, variants, capacity, orders, fulfilment, settings, zones, policies, and homepage features.
- [x] Draft, edit, preview, publish, unpublish, and archive lifecycle with publish-time completeness validation.
- [x] Multiple image upload, ordering, cover choice, alt text, and colour assignment.
- [x] Configurable XS-XL variants, per-variant capacity/availability, care, measurements, NGN prices, and dispatch timing.
- [x] Searchable/filterable actual orders; payment status remains separate and owner actions cannot verify payment.
- [x] Forward-only fulfilment updates, courier/tracking details, revised estimates, customer messages, and audit history.
- [x] Immutable order price, delivery-rule, lead-time, and original dispatch snapshots.
- [x] Private guest tracking requiring order ID/number plus high-entropy token.
- [x] Optional OIDC/PKCE accounts, customer-scoped order history, and cross-device wishlists.
- [x] Transactional email outbox with idempotency, retries, and failure recording.
- [x] Preview simulation separated from provider-tested payments; production requires provider selection, verification flag, and a matching live secret.
- [x] Automated flow covers incomplete publish rejection, image reorder/cover, production catalog visibility, simulated verified order, all fulfilment states, guest tracking, audit history, bad tracking token, and local-admin denial.
- [x] Browser E2E confirms D1-backed selection, checkout, simulated confirmation, consumed reservation, cleared cart, responsive width, and no browser errors.

## 2. External services still needing configuration

- [ ] Create separate staging and production D1/R2 resources and apply all migrations.
- [ ] Configure Cloudflare Access for `/admin/*` and `/api/admin/*`; set issuer, audience, and owner email allowlist.
- [ ] Configure a customer OIDC application with `/account` as its callback and add a 32+ character session secret.
- [ ] Verify an email-sending domain, configure Resend, and test confirmation/update delivery and retries.
- [ ] Add a Paystack `sk_test_` key and reachable staging webhook; complete provider-level callback, webhook, and reconciliation tests. Only then set the production provider, verified flag, and live secret.
- [ ] Configure monitoring/alerts, rate limiting, backup/restore, and scheduled-trigger observation.

## 3. Business decisions still needing approval

- [x] Final payment provider: Paystack selected for launch.
- [ ] Full-upfront-payment rule and 20-minute capacity hold.
- [ ] Mixed-basket dispatch-together versus split-shipment policy.
- [ ] Delivery zones, fees, courier estimates, and business/calendar-day basis.
- [ ] Approved XS-XL brand size guide and measurement wording.
- [ ] Returns, exchanges, privacy, terms, preorder, and delivery policies.
- [ ] Customer-facing email, phone, WhatsApp, and social details.

## 4. Product content the owner must enter before launch

- [ ] Final product names, descriptions, categories, and NGN prices.
- [ ] Final photography, ordered gallery, one cover, alt text, and colour assignments.
- [ ] Offered colours and XS-XL sizes, unique SKUs, capacity, and open/closed state for every variant.
- [ ] Measurements, fit notes, care instructions, and size-guide assignment.
- [ ] Preparation range and day basis, or a specific dispatch date, for every style.
- [ ] Homepage featured selection and order.
- [ ] Remove or leave unpublished every placeholder; never copy the sample seed into production.
