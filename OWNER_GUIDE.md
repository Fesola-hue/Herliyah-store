# HERLIYAH owner guide

## Safe owner access

For local testing, set `APP_MODE=preview`, `ADMIN_AUTH_MODE=preview-token`, and put a random `ADMIN_PREVIEW_TOKEN` of at least 16 characters in `.dev.vars`. Open `/admin` and enter the token. This path is accepted only on `localhost` or `127.0.0.1`; it cannot weaken a deployment.

Staging and production use Cloudflare Access. Protect `/admin/*` and `/api/admin/*`, set the Access issuer/audience and owner allowlist, then set `ADMIN_AUTH_MODE=cloudflare-access`. The dashboard manages products, images, variants, orders, delivery settings, policies, contact information, and homepage features.

## First collection workflow

Create a draft in **Products**. Complete the name, slug, description, category, NGN price, care, measurements, brand size-guide key, and preparation range or specific dispatch date. Upload multiple images, give each descriptive alt text and an optional colour, order them, and choose one cover. Configure only the XS-XL variants offered for the style, with a unique SKU, capacity, and open/closed state.

Preview before publishing. Publishing is blocked until required content, a cover, image alt text, variants, and timing are valid. Sample seed products cannot be published as real merchandise. Unpublish returns a product to draft; archive removes it from sale while preserving history.

## Checkout operations

Capacity represents production allocation, not stock on a shelf. Checkout holds the complete basket for 20 minutes. A five-minute scheduled task verifies expired Paystack attempts before releasing their capacity. Provider uncertainty keeps the hold for a later reconciliation rather than risking a paid-but-released order. A late successful payment reallocates the whole basket if possible; otherwise the order becomes `payment_exception` and must be reviewed/refunded or manually fulfilled.

Search and filter actual orders in **Orders**. Payment and fulfilment are separate. Only server-verified successful payment permits the sequence: confirmed, in preparation, ready to dispatch, dispatched, delivered. Dispatch requires manual courier details and a tracking reference. Revised dispatch estimates and customer delay messages never overwrite the original order timing snapshot. All changes create order events, audit history, and retryable email notifications.

Increasing or reopening capacity requires a reason and audit entry. A refund does not automatically restore capacity. Delays should keep the original promise, record a revised estimate and notify the customer. Production and courier delivery are separate progress dimensions.

## Customer access and notifications

Guest tracking requires both the order ID/number and its high-entropy token; email or order number alone is insufficient. Optional accounts use provider-neutral OIDC Authorization Code + PKCE, a verified email, and an HTTP-only store session. Signed-in customers see only orders linked to their customer ID and get a cross-device wishlist.

The email outbox retries confirmations and fulfilment updates with exponential backoff and idempotency. Set `EMAIL_PROVIDER=resend`, `EMAIL_FROM`, and the API-key secret to enable delivery. Without those values, notifications stay pending rather than being shown as sent.

## Payment launch gate

Paystack is the chosen HERLIYAH launch provider. Preview payments are explicitly simulated. Test mode accepts only a Paystack `sk_test_` key. Production defaults closed and opens only when `PAYMENT_PROVIDER=paystack`, `PAYMENT_PROVIDER_VERIFIED=true`, and an `sk_live_` secret are all configured after staging approval. The adapter boundary remains replaceable without mixing provider-specific payment logic into orders.

## Owner decisions still required

Provide final logo and photography; real product names, descriptions, prices, sizes, care and capacity; preparation rules; delivery zones, fees and transit estimates; combined-basket policy; returns/exchanges; contact details; owner email; Cloudflare Access policy; Paystack account/test key; verified email sender; and final policies.

The current rules—full upfront payment, a 20-minute reservation, one Lagos sample delivery fee, and shipping a mixed basket when the slowest style is ready—remain assumptions until approved.
