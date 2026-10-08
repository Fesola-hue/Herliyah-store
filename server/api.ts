import { Hono, type Context } from "hono";
import { requireAdmin, type AdminBindings } from "./admin-auth";
import { MockPaymentAdapter, PaystackTestAdapter } from "./payment-adapter";
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

type Bindings = AdminBindings & {
  DB?: D1Database;
  PRODUCT_IMAGES?: R2Bucket;
  PAYSTACK_SECRET_KEY?: string;
  APP_MODE?: "preview" | "test" | "production";
  PUBLIC_APP_ORIGIN?: string;
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

api.get("/health", (c) => {
  const mode = c.env.APP_MODE ?? "preview";
  return c.json({
    ok: true,
    mode,
    payments:
      mode === "test"
        ? "paystack-test"
        : mode === "preview"
          ? "mock"
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
      paymentsEnabled: c.env.APP_MODE === "test",
    });
  } catch (error) {
    return respondError(c, error);
  }
});
api.post("/checkout/start", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  const mode = c.env.APP_MODE ?? "preview";
  if (mode === "production")
    return c.json({ error: "production_launch_gate_closed" }, 503);
  if (mode === "test" && !c.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_"))
    return c.json({ error: "test_payment_not_configured" }, 503);
  try {
    const checkout = await createCheckout(c.env.DB, await c.req.json(), {
      mode,
    });
    let current = await getCheckoutByReference(c.env.DB, checkout.reference);
    if (!current?.authorizationUrl && current?.paymentStatus === "initiated") {
      const origin = (
        c.env.PUBLIC_APP_ORIGIN || new URL(c.req.url).origin
      ).replace(/\/$/, "");
      const adapter =
        mode === "test"
          ? c.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_")
            ? new PaystackTestAdapter(c.env.PAYSTACK_SECRET_KEY)
            : null
          : new MockPaymentAdapter();
      if (!adapter) throw new CheckoutError("test_payment_not_configured", 503);
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
api.post("/checkout/payments/:reference/verify", async (c) => {
  if (!c.env.DB) return unavailable(c, "database");
  if ((c.env.APP_MODE ?? "preview") !== "test")
    return c.json({ error: "test_mode_required" }, 409);
  if (!c.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_"))
    return c.json({ error: "test_payment_not_configured" }, 503);
  try {
    return c.json(
      await applyVerifiedPayment(
        c.env.DB,
        await new PaystackTestAdapter(c.env.PAYSTACK_SECRET_KEY).verify(
          c.req.param("reference"),
        ),
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
    (c.env.APP_MODE ?? "preview") !== "test" ||
    !c.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_")
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
  if (!crypto.subtle.timingSafeEqual(expected, provided))
    return c.json({ error: "invalid_signature" }, 401);
  const text = new TextDecoder().decode(raw),
    event = JSON.parse(text) as {
      event: string;
      data: { id: number | string; reference: string };
    };
  if (event.event !== "charge.success")
    return c.json({ ok: true, ignored: true });
  try {
    const verified = await new PaystackTestAdapter(
      c.env.PAYSTACK_SECRET_KEY,
    ).verify(event.data.reference);
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
      "INSERT INTO product_images (id,product_id,object_key,alt_text,sort_order,is_cover,created_at) VALUES (?,?,?,?,COALESCE((SELECT MAX(sort_order)+1 FROM product_images WHERE product_id=?),0),0,?)",
    )
      .bind(
        imageId,
        c.req.param("id"),
        key,
        c.req.query("alt")?.trim() || "Product image",
        c.req.param("id"),
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
