import { Hono, type Context } from "hono";
import { requireAdmin, type AdminBindings } from "./admin-auth.ts";
import {
  changeAdminProductStatus,
  createAdminProduct,
  getAdminProduct,
  listAdminProducts,
  type ProductInput,
  updateAdminProduct,
} from "./admin-products.ts";
import {
  reorderAdminImages,
  replaceAdminVariants,
  type VariantInput,
} from "./admin-inventory.ts";
import {
  getAdminOrder,
  listAdminOrders,
  type FulfilmentInput,
  updateAdminFulfilment,
} from "./admin-orders.ts";
import {
  getAdminSettings,
  saveAdminDeliveryZone,
  saveAdminFeaturedProducts,
  saveAdminSetting,
  type DeliveryZoneInput,
} from "./admin-settings.ts";
import { MockPaymentAdapter, PaystackAdapter, PaystackTestAdapter } from "./payment-adapter.ts";
import {
  clearCustomerCookie,
  customerAuthConfigured,
  exchangeCustomerCode,
  requireCustomer,
  type CustomerAuthBindings,
} from "./customer-auth.ts";
import {
  getCustomerOrders,
  getCustomerWishlist,
  replaceCustomerWishlist,
} from "./customer-service.ts";
import {
  processNotificationOutbox,
  type NotificationBindings,
} from "./notification-service.ts";
import {
  applyVerifiedPayment,
  CheckoutError,
  createCheckout,
  failPaymentInitialization,
  getCatalog,
  getCheckoutByReference,
  getGuestOrder,
  quoteCheckout,
  reconcileExpiredPayments,
  releaseExpiredReservations,
  savePaymentInitialization,
  sha256Hex,
} from "./checkout-service.mjs";

type Bindings = AdminBindings & CustomerAuthBindings & NotificationBindings & {
  DB?: D1Database;
  PRODUCT_IMAGES?: R2Bucket;
  PAYSTACK_SECRET_KEY?: string;
  APP_MODE?: "preview" | "test" | "production";
  PUBLIC_APP_ORIGIN?: string;
  PAYMENT_PROVIDER?: "disabled" | "paystack";
  PAYMENT_PROVIDER_VERIFIED?: "true" | "false";
};
type ApiContext = Context<{
  Bindings: Bindings;
  Variables: { adminId: string };
}>;
export const api = new Hono<{
  Bindings: Bindings;
  Variables: { adminId: string };
}>().basePath("/api");
const unavailable = (c: ApiContext, service: "database" | "media") =>
  c.json({ error: `${service}_temporarily_unavailable` }, 503);
const respondError = (c: ApiContext, error: unknown) =>
  error instanceof CheckoutError
    ? c.json({ error: error.code }, error.status as 400)
    : c.json({ error: "internal_error" }, 500);
function paystackFor(env: Bindings) {
  const mode = env.APP_MODE ?? "preview";
  if (mode === "test" && env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_"))
    return new PaystackAdapter(env.PAYSTACK_SECRET_KEY, "test");
  if (
    mode === "production" &&
    env.PAYMENT_PROVIDER === "paystack" &&
    env.PAYMENT_PROVIDER_VERIFIED === "true" &&
    env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_")
  )
    return new PaystackAdapter(env.PAYSTACK_SECRET_KEY, "live");
  return null;
}
const paymentsEnabled = (env: Bindings) =>
  (env.APP_MODE ?? "preview") === "preview" || Boolean(paystackFor(env));
function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1)
    mismatch |= left[index] ^ right[index % right.length];
  return mismatch === 0;
}

api.get("/health", (c) => {
  const mode = c.env.APP_MODE ?? "preview";
  return c.json({
    ok: true,
    mode,
    payments:
      mode === "preview"
        ? "simulated"
        : paystackFor(c.env)
          ? mode === "test"
            ? "paystack-test-verified"
            : "paystack-live-enabled"
          : "disabled",
    database: Boolean(c.env.DB),
    media: Boolean(c.env.PRODUCT_IMAGES),
    adminAuth: c.env.ADMIN_AUTH_MODE ?? "disabled",
  });
});
api.get("/catalog", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  try {
    return c.json({
      products: await getCatalog(c.env.DB, c.env.APP_MODE ?? "preview"),
    });
  } catch (error) {
    return respondError(c, error);
  }
});
api.get("/delivery-options", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  const zones = await c.env.DB
    .prepare(
      "SELECT id,name,fee_kobo AS feeKobo,transit_min_days AS transitMinDays,transit_max_days AS transitMaxDays,transit_day_basis AS transitDayBasis FROM delivery_zones WHERE active=1 ORDER BY name",
    )
    .all();
  return c.json({ zones: zones.results });
});
api.get("/media/*", async (c) => {
  if (!c.env.PRODUCT_IMAGES) return unavailable(c, "media");
  const key = decodeURIComponent(c.req.path.replace(/^\/api\/media\//, ""));
  if (!key || key.includes(".."))
    return c.json({ error: "invalid_media_key" }, 400);
  const object = await c.env.PRODUCT_IMAGES.get(key);
  if (!object) return c.json({ error: "not_found" }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=3600");
  return new Response(object.body, { headers });
});

api.post("/checkout/quote", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  try {
    return c.json({
      ...(await quoteCheckout(
        c.env.DB,
        await c.req.json(),
        c.env.APP_MODE ?? "preview",
      )),
      paymentsEnabled: paymentsEnabled(c.env),
    });
  } catch (error) {
    return respondError(c, error);
  }
});
api.post("/checkout/start", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  const mode = c.env.APP_MODE ?? "preview";
  if (mode !== "preview" && !paystackFor(c.env))
    return c.json({ error: "payment_provider_not_verified" }, 503);
  try {
    const checkout = await createCheckout(c.env.DB, await c.req.json(), {
      mode,
      provider: mode === "preview" ? "simulation" : c.env.PAYMENT_PROVIDER || "paystack",
    });
    let current = await getCheckoutByReference(c.env.DB, checkout.reference);
    if (!current?.authorizationUrl && current?.paymentStatus === "initiated") {
      const origin = (
        c.env.PUBLIC_APP_ORIGIN || new URL(c.req.url).origin
      ).replace(/\/$/, "");
      const adapter = mode === "preview" ? new MockPaymentAdapter() : paystackFor(c.env);
      if (!adapter) throw new CheckoutError("payment_provider_not_verified", 503);
      const order = await c.env.DB.prepare(
        "SELECT email FROM orders WHERE id=?",
      )
        .bind(current.orderId)
        .first<{ email: string }>();
      try {
        current = await savePaymentInitialization(
          c.env.DB,
          checkout.reference,
          await adapter.initialize({
            email: order?.email ?? "",
            amountKobo: current.amountKobo,
            reference: checkout.reference,
            callbackUrl: `${origin}/checkout/callback?reference=${encodeURIComponent(checkout.reference)}`,
          }),
        );
      } catch {
        await failPaymentInitialization(
          c.env.DB,
          checkout.reference,
          "provider_initialization_failed",
        );
        throw new CheckoutError("payment_initialization_failed", 502);
      }
    }
    return c.json(
      {
        ...current,
        accessToken: checkout.accessToken ?? null,
        replayed: checkout.replayed,
      },
      checkout.replayed ? 200 : 201,
    );
  } catch (error) {
    return respondError(c, error);
  }
});
api.get("/checkout/status/:reference", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  const checkout = await getCheckoutByReference(
    c.env.DB,
    c.req.param("reference"),
  );
  return checkout ? c.json(checkout) : c.json({ error: "not_found" }, 404);
});
api.get("/orders/:id", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  const order = await getGuestOrder(
    c.env.DB,
    c.req.param("id"),
    c.req.query("token"),
  );
  return order ? c.json(order) : c.json({ error: "not_found" }, 404);
});
api.post("/orders/track", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  const input = await c.req.json<{ order: string; token: string }>();
  if (!input.order?.trim() || !input.token?.trim())
    return c.json({ error: "invalid_tracking_credentials" }, 400);
  const order = await getGuestOrder(
    c.env.DB,
    input.order.trim(),
    input.token.trim(),
  );
  return order ? c.json(order) : c.json({ error: "not_found" }, 404);
});

api.get("/auth/config", (c) =>
  c.json({
    enabled: customerAuthConfigured(c.env),
    authorizationUrl: c.env.CUSTOMER_AUTHORIZATION_URL,
    clientId: c.env.CUSTOMER_AUTH_CLIENT_ID,
    audience: c.env.CUSTOMER_AUTH_AUDIENCE,
  }),
);
api.post("/auth/exchange", async (c) => {
  try {
    const result = await exchangeCustomerCode(c.env, await c.req.json());
    c.header("set-cookie", result.cookie);
    return c.json({ customer: result.customer });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "authentication_failed" },
      401,
    );
  }
});
api.post("/auth/logout", (c) => {
  c.header("set-cookie", clearCustomerCookie);
  return c.json({ ok: true });
});
api.get("/customer/me", async (c) => {
  try {
    return c.json({ customer: await requireCustomer(c.req.raw, c.env) });
  } catch {
    return c.json({ customer: null });
  }
});
api.get("/customer/orders", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  try {
    const customer = await requireCustomer(c.req.raw, c.env);
    return c.json({ orders: await getCustomerOrders(c.env.DB, customer.id) });
  } catch {
    return c.json({ error: "customer_unauthorized" }, 401);
  }
});
api.get("/customer/wishlist", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  try {
    const customer = await requireCustomer(c.req.raw, c.env);
    return c.json({ productIds: await getCustomerWishlist(c.env.DB, customer.id) });
  } catch {
    return c.json({ error: "customer_unauthorized" }, 401);
  }
});
api.put("/customer/wishlist", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  try {
    const customer = await requireCustomer(c.req.raw, c.env);
    const input = await c.req.json<{ productIds: unknown }>();
    return c.json({
      productIds: await replaceCustomerWishlist(c.env.DB, customer.id, input.productIds),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_wishlist";
    return c.json({ error: message }, message === "customer_unauthorized" ? 401 : 400);
  }
});
api.post("/checkout/payments/:reference/verify", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  const adapter = paystackFor(c.env);
  if (!adapter) return c.json({ error: "payment_provider_not_verified" }, 503);
  try {
    return c.json(
      await applyVerifiedPayment(
        c.env.DB,
        await adapter.verify(c.req.param("reference")),
      ),
    );
  } catch (error) {
    return respondError(c, error);
  }
});
api.post("/checkout/payments/:reference/simulate-success", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  if ((c.env.APP_MODE ?? "preview") !== "preview")
    return c.json({ error: "not_available" }, 404);
  const attempt = await c.env.DB.prepare(
    "SELECT amount_kobo,currency,environment FROM payment_attempts WHERE reference=?",
  )
    .bind(c.req.param("reference"))
    .first<{ amount_kobo: number; currency: "NGN"; environment: "test" }>();
  if (!attempt) return c.json({ error: "not_found" }, 404);
  return c.json(
    await applyVerifiedPayment(
      c.env.DB,
      {
        reference: c.req.param("reference"),
        status: "succeeded",
        amountKobo: attempt.amount_kobo,
        currency: attempt.currency,
        environment: attempt.environment,
      },
      {
        eventId: `preview:${c.req.param("reference")}`,
        eventType: "preview.simulated",
        payloadHash: "preview",
      },
    ),
  );
});

api.post("/paystack/webhook", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  if (
    (c.env.APP_MODE ?? "preview") === "preview" ||
    !paystackFor(c.env) ||
    !c.env.PAYSTACK_SECRET_KEY
  )
    return c.json({ error: "not_available" }, 404);
  const raw = await c.req.arrayBuffer(),
    signature = c.req.header("x-paystack-signature") ?? "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(c.env.PAYSTACK_SECRET_KEY),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, raw));
  const provided = /^[0-9a-f]{128}$/i.test(signature)
    ? new Uint8Array(
        signature.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
      )
    : new Uint8Array(64);
  if (!constantTimeEqual(expected, provided))
    return c.json({ error: "invalid_signature" }, 401);
  const text = new TextDecoder().decode(raw),
    event = JSON.parse(text) as {
      event: string;
      data: { id: number | string; reference: string };
    };
  if (event.event !== "charge.success")
    return c.json({ ok: true, ignored: true });
  try {
    const verified = await paystackFor(c.env)!.verify(event.data.reference);
    return c.json({
      ok: true,
      ...(await applyVerifiedPayment(c.env.DB, verified, {
        eventId: `paystack:${event.data.id}:${event.event}`,
        eventType: event.event,
        payloadHash: await sha256Hex(text),
      })),
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "paystack_webhook_failed",
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
    return c.json({ error: "webhook_processing_failed" }, 500);
  }
});

api.use("/admin/*", requireAdmin);
api.get("/admin/products", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  return c.json({ products: await listAdminProducts(c.env.DB) });
});
api.post("/admin/products", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  try {
    const product = await createAdminProduct(
      c.env.DB,
      c.get("adminId"),
      await c.req.json<ProductInput>(),
    );
    return c.json({ product }, 201);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "invalid_product" },
      400,
    );
  }
});
api.get("/admin/products/:id", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  const product = await getAdminProduct(c.env.DB, c.req.param("id"));
  return product ? c.json({ product }) : c.json({ error: "not_found" }, 404);
});
api.put("/admin/products/:id", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  const input = await c.req.json<ProductInput & { reason?: string }>();
  try {
    const product = await updateAdminProduct(
      c.env.DB,
      c.get("adminId"),
      c.req.param("id"),
      input,
      input.reason?.trim() || "Saved product details",
    );
    return product
      ? c.json({ product })
      : c.json({ error: "not_found" }, 404);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "invalid_product" },
      400,
    );
  }
});
api.post("/admin/products/:id/status", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  const input = await c.req.json<{
    status: "draft" | "published" | "archived";
    reason?: string;
  }>();
  if (!["draft", "published", "archived"].includes(input.status))
    return c.json({ error: "invalid_status_change" }, 400);
  const result = await changeAdminProductStatus(
    c.env.DB,
    c.get("adminId"),
    c.req.param("id"),
    input.status,
    input.reason?.trim() || `Changed product status to ${input.status}`,
  );
  if (!result) return c.json({ error: "not_found" }, 404);
  return result.ok ? c.json(result) : c.json(result, 422);
});
api.put("/admin/products/:id/variants", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  const input = await c.req.json<{ variants: VariantInput[]; reason?: string }>();
  try {
    return c.json({
      product: await replaceAdminVariants(
        c.env.DB,
        c.get("adminId"),
        c.req.param("id"),
        input.variants,
        input.reason,
      ),
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "invalid_variants" },
      400,
    );
  }
});
api.put("/admin/products/:id/images", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  try {
    const input = await c.req.json<{
      images: Array<{
        id: string;
        altText: string;
        colour?: string | null;
        isCover?: boolean;
      }>;
    }>();
    return c.json({
      product: await reorderAdminImages(
        c.env.DB,
        c.get("adminId"),
        c.req.param("id"),
        input.images,
      ),
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "invalid_images" },
      400,
    );
  }
});
api.get("/admin/overview", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  const [products, orders, capacity] = await c.env.DB.batch([
    c.env.DB.prepare(
      "SELECT id,slug,title,status,price_kobo,preparation_min_days,preparation_max_days,updated_at FROM products ORDER BY updated_at DESC",
    ),
    c.env.DB.prepare(
      "SELECT id,order_number,full_name,order_status,fulfilment_status,total_kobo,updated_at FROM orders ORDER BY updated_at DESC LIMIT 20",
    ),
    c.env.DB.prepare(
      "SELECT product_id,SUM(capacity) AS capacity,SUM(reserved_quantity) AS reserved,SUM(committed_quantity) AS committed FROM variants GROUP BY product_id",
    ),
  ]);
  return c.json({
    products: products.results,
    orders: orders.results,
    capacity: capacity.results,
  });
});
api.patch("/admin/products/:id", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  const input = await c.req.json<{
    title?: string;
    description?: string;
    priceKobo?: number;
    status?: "draft" | "published" | "archived";
    preparationMinDays?: number;
    preparationMaxDays?: number;
    reason?: string;
  }>();
  if (!input.reason?.trim()) return c.json({ error: "reason_required" }, 400);
  const current = await c.env.DB.prepare("SELECT * FROM products WHERE id=?")
    .bind(c.req.param("id"))
    .first<Record<string, unknown>>();
  if (!current) return c.json({ error: "not_found" }, 404);
  const title = input.title?.trim() || String(current.title),
    description = input.description?.trim() ?? String(current.description),
    priceKobo = input.priceKobo ?? Number(current.price_kobo),
    status = input.status ?? String(current.status),
    min = input.preparationMinDays ?? Number(current.preparation_min_days),
    max = input.preparationMaxDays ?? Number(current.preparation_max_days);
  if (
    !Number.isInteger(priceKobo) ||
    priceKobo < 0 ||
    !Number.isInteger(min) ||
    min < 1 ||
    !Number.isInteger(max) ||
    max < min ||
    !["draft", "published", "archived"].includes(status)
  )
    return c.json({ error: "invalid_product" }, 400);
  const now = new Date().toISOString(),
    actor = c.get("adminId");
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE products SET title=?,description=?,price_kobo=?,status=?,preparation_min_days=?,preparation_max_days=?,updated_at=? WHERE id=?",
    ).bind(
      title,
      description,
      priceKobo,
      status,
      min,
      max,
      now,
      c.req.param("id"),
    ),
    c.env.DB.prepare(
      "INSERT INTO admin_audit_log (id,actor_id,action,entity_type,entity_id,before_json,after_json,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    ).bind(
      crypto.randomUUID(),
      actor,
      "product.update",
      "product",
      c.req.param("id"),
      JSON.stringify(current),
      JSON.stringify({
        title,
        description,
        priceKobo,
        status,
        preparationMinDays: min,
        preparationMaxDays: max,
      }),
      input.reason.trim(),
      now,
    ),
  ]);
  return c.json({ ok: true });
});
api.patch("/admin/variants/:id/capacity", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  const input = await c.req.json<{
    capacity: number;
    preorderOpen?: boolean;
    reason?: string;
  }>();
  if (
    !Number.isInteger(input.capacity) ||
    input.capacity < 0 ||
    !input.reason?.trim()
  )
    return c.json({ error: "invalid_capacity_change" }, 400);
  const current = await c.env.DB.prepare("SELECT * FROM variants WHERE id=?")
    .bind(c.req.param("id"))
    .first<Record<string, unknown>>();
  if (!current) return c.json({ error: "not_found" }, 404);
  if (
    input.capacity <
    Number(current.reserved_quantity) + Number(current.committed_quantity)
  )
    return c.json({ error: "capacity_below_allocated" }, 409);
  const open =
      input.preorderOpen === undefined
        ? Number(current.preorder_open)
        : Number(input.preorderOpen),
    delta = input.capacity - Number(current.capacity),
    now = new Date().toISOString(),
    actor = c.get("adminId");
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE variants SET capacity=?,preorder_open=? WHERE id=?",
    ).bind(input.capacity, open, c.req.param("id")),
    c.env.DB.prepare(
      "INSERT INTO capacity_movements (id,variant_id,delta,reason,reference_type,reference_id,actor_id,created_at) VALUES (?,?,?,?,?,?,?,?)",
    ).bind(
      crypto.randomUUID(),
      c.req.param("id"),
      delta,
      input.reason.trim(),
      "admin_adjustment",
      c.req.param("id"),
      actor,
      now,
    ),
    c.env.DB.prepare(
      "INSERT INTO admin_audit_log (id,actor_id,action,entity_type,entity_id,before_json,after_json,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    ).bind(
      crypto.randomUUID(),
      actor,
      "variant.capacity",
      "variant",
      c.req.param("id"),
      JSON.stringify(current),
      JSON.stringify({ capacity: input.capacity, preorderOpen: Boolean(open) }),
      input.reason.trim(),
      now,
    ),
  ]);
  return c.json({
    ok: true,
    capacity: input.capacity,
    preorderOpen: Boolean(open),
  });
});
api.post("/admin/products/:id/images", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  if (!c.env.PRODUCT_IMAGES) return unavailable(c, "media");
  const contentType = c.req.header("content-type") ?? "";
  if (!/^image\/(jpeg|png|webp|avif)$/.test(contentType))
    return c.json({ error: "unsupported_image_type" }, 415);
  const body = await c.req.arrayBuffer();
  if (!body.byteLength || body.byteLength > 8 * 1024 * 1024)
    return c.json({ error: "image_size_invalid" }, 413);
  const product = await c.env.DB.prepare("SELECT id FROM products WHERE id=?")
    .bind(c.req.param("id"))
    .first();
  if (!product) return c.json({ error: "not_found" }, 404);
  const extension = contentType.split("/")[1].replace("jpeg", "jpg"),
    imageId = crypto.randomUUID(),
    key = `products/${c.req.param("id")}/${imageId}.${extension}`;
  await c.env.PRODUCT_IMAGES.put(key, body, { httpMetadata: { contentType } });
  try {
    await c.env.DB.prepare(
      "INSERT INTO product_images (id,product_id,object_key,alt_text,sort_order,is_cover,colour,created_at) VALUES (?,?,?,?,COALESCE((SELECT MAX(sort_order)+1 FROM product_images WHERE product_id=?),0),CASE WHEN EXISTS(SELECT 1 FROM product_images WHERE product_id=?) THEN 0 ELSE 1 END,?,?)",
    )
      .bind(
        imageId,
        c.req.param("id"),
        key,
        c.req.query("alt")?.trim() || "Product image",
        c.req.param("id"),
        c.req.param("id"),
        c.req.query("colour")?.trim() || null,
        new Date().toISOString(),
      )
      .run();
  } catch (error) {
    await c.env.PRODUCT_IMAGES.delete(key);
    throw error;
  }
  return c.json(
    { id: imageId, url: `/api/media/${encodeURIComponent(key)}` },
    201,
  );
});
api.post("/admin/reconcile-expired", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  const mode = c.env.APP_MODE ?? "preview";
  if (mode === "test") {
    if (!c.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_"))
      return c.json({ error: "test_payment_not_configured" }, 503);
    const adapter = new PaystackTestAdapter(c.env.PAYSTACK_SECRET_KEY);
    return c.json(
      await reconcileExpiredPayments(c.env.DB, (reference: string) =>
        adapter.verify(reference),
      ),
    );
  }
  if (mode === "preview")
    return c.json(await releaseExpiredReservations(c.env.DB));
  return c.json({ error: "production_launch_gate_closed" }, 503);
});
api.post("/admin/notifications/process", async (c) =>
  c.json(await processNotificationOutbox(c.env)),
);
api.get("/admin/orders", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  return c.json({
    orders: await listAdminOrders(c.env.DB, {
      query: c.req.query("q"),
      payment: c.req.query("payment"),
      fulfilment: c.req.query("fulfilment"),
    }),
  });
});
api.get("/admin/orders/:id", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  const order = await getAdminOrder(c.env.DB, c.req.param("id"));
  return order ? c.json({ order }) : c.json({ error: "not_found" }, 404);
});
api.post("/admin/orders/:id/fulfilment", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  try {
    const order = await updateAdminFulfilment(
      c.env.DB,
      c.get("adminId"),
      c.req.param("id"),
      await c.req.json<FulfilmentInput>(),
    );
    return order ? c.json({ order }) : c.json({ error: "not_found" }, 404);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "invalid_update" },
      409,
    );
  }
});
api.get("/admin/settings", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  return c.json(await getAdminSettings(c.env.DB));
});
api.put("/admin/settings/:key", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  try {
    const input = await c.req.json<{ value: unknown }>();
    await saveAdminSetting(
      c.env.DB,
      c.get("adminId"),
      c.req.param("key"),
      input.value,
    );
    return c.json({ ok: true });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "invalid_setting" },
      400,
    );
  }
});
api.put("/admin/delivery-zones/:id", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  try {
    const input = await c.req.json<DeliveryZoneInput>();
    const id = await saveAdminDeliveryZone(c.env.DB, c.get("adminId"), {
      ...input,
      id: c.req.param("id") === "new" ? undefined : c.req.param("id"),
    });
    return c.json({ ok: true, id });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "invalid_zone" },
      400,
    );
  }
});
api.put("/admin/featured-products", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  try {
    const input = await c.req.json<{ productIds: string[] }>();
    await saveAdminFeaturedProducts(
      c.env.DB,
      c.get("adminId"),
      input.productIds,
    );
    return c.json({ ok: true });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "invalid_featured" },
      400,
    );
  }
});
