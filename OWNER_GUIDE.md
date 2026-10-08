# HERLIYAH owner guide

## Current owner access

The public `/admin` page is deliberately locked. No ChatGPT-host header grants access. Admin API writes are disabled unless Cloudflare Access JWT verification and the owner email allowlist are fully configured as documented in `README.md`.

The protected API foundation can list products/orders/capacity, edit a product, adjust a variant's capacity and upload a product image. Changes require a reason and create audit/capacity records. This is not yet a finished dashboard: there is no authenticated owner UI for these operations, product creation, image ordering, order progress or dispatch.

## Checkout operations

Capacity represents production allocation, not stock on a shelf. Checkout holds the complete basket for 20 minutes. A five-minute scheduled task verifies expired Paystack attempts before releasing their capacity. Provider uncertainty keeps the hold for a later reconciliation rather than risking a paid-but-released order. A late successful payment reallocates the whole basket if possible; otherwise the order becomes `payment_exception` and must be reviewed/refunded or manually fulfilled.

Increasing or reopening capacity requires a reason and audit entry. A refund does not automatically restore capacity. Delays should keep the original promise, record a revised estimate and notify the customer. Production and courier delivery are separate progress dimensions.

## Owner decisions still required

Provide final logo and photography; real product names, descriptions, prices, sizes, care and capacity; preparation rules; delivery zones, fees and transit estimates; combined-basket policy; returns/exchanges; contact details; owner email; Cloudflare Access policy; Paystack account/test key; verified email sender; and final policies.

The current rules—full upfront payment, a 20-minute reservation, one Lagos sample delivery fee, and shipping a mixed basket when the slowest style is ready—remain assumptions until approved.
