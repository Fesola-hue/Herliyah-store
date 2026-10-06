import { Hono, type Context, type Next } from "hono";
import { reserveBasketAtomically } from "./reservation-service";

type Bindings = { DB?: D1Database; PRODUCT_IMAGES?: R2Bucket; PAYSTACK_SECRET_KEY?: string; APP_MODE?: "preview" | "test" | "production"; OWNER_EMAIL?: string };
type ApiContext = Context<{ Bindings: Bindings }>;
export const api = new Hono<{ Bindings: Bindings }>().basePath("/api");

function unavailable(c: ApiContext, service: "database" | "media") {
  console.error(JSON.stringify({ message: `${service}_binding_unavailable`, path: c.req.path }));
  return c.json({ error: `${service}_temporarily_unavailable` }, 503);
}

async function requireOwner(c: ApiContext, next: Next) {
  const email = c.req.header("oai-authenticated-user-email")?.toLowerCase();
  const userId = c.req.header("oai-authenticated-user-id");
  const allowed = new Set((c.env.OWNER_EMAIL ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean));
  if (!allowed.size) return c.json({ error: "owner_access_not_configured" }, 503);
  if (!email || !userId || !allowed.has(email)) return c.json({ error: "forbidden" }, 403);
  await next();
}

api.get("/health", c => c.json({ ok: true, mode: c.env.APP_MODE ?? "preview", payments: c.env.APP_MODE === "test" ? "paystack-test" : "disabled", database: Boolean(c.env.DB), media: Boolean(c.env.PRODUCT_IMAGES) }));

api.get("/catalog", async c => {
  if (!c.env.DB) return unavailable(c, "database");
  const rows = await c.env.DB.prepare(`SELECT p.id,p.slug,p.title,p.description,p.category,p.price_kobo,p.preparation_min_days,p.preparation_max_days,v.id AS variant_id,v.size,v.colour,v.capacity,v.reserved_quantity,v.committed_quantity,v.preorder_open FROM products p JOIN variants v ON v.product_id=p.id WHERE p.status='published' ORDER BY p.created_at,p.id,v.colour,v.size`).all<Record<string, string | number>>();
  return c.json({ products: rows.results });
});

api.get("/media/*", async c => {
  if (!c.env.PRODUCT_IMAGES) return unavailable(c, "media");
  const key = decodeURIComponent(c.req.path.replace(/^\/api\/media\//, ""));
  if (!key || key.includes("..")) return c.json({ error: "invalid_media_key" }, 400);
  const object = await c.env.PRODUCT_IMAGES.get(key);
  if (!object) return c.json({ error: "not_found" }, 404);
  const headers = new Headers(); object.writeHttpMetadata(headers); headers.set("etag", object.httpEtag); headers.set("cache-control", "public, max-age=3600");
  return new Response(object.body, { headers });
});

api.use("/admin/*", requireOwner);
api.get("/admin/overview", async c => {
  if (!c.env.DB) return unavailable(c, "database");
  const [products, orders, capacity] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT id,slug,title,status,price_kobo,preparation_min_days,preparation_max_days,updated_at FROM products ORDER BY updated_at DESC"),
    c.env.DB.prepare("SELECT id,order_number,full_name,order_status,fulfilment_status,total_kobo,updated_at FROM orders ORDER BY updated_at DESC LIMIT 20"),
    c.env.DB.prepare("SELECT product_id,SUM(capacity) AS capacity,SUM(reserved_quantity) AS reserved,SUM(committed_quantity) AS committed FROM variants GROUP BY product_id"),
  ]);
  return c.json({ products: products.results, orders: orders.results, capacity: capacity.results });
});

api.patch("/admin/products/:id", async c => {
  if (!c.env.DB) return unavailable(c, "database");
  const input = await c.req.json<{ title?: string; description?: string; priceKobo?: number; status?: "draft" | "published" | "archived"; preparationMinDays?: number; preparationMaxDays?: number; reason?: string }>();
  if (!input.reason?.trim()) return c.json({ error: "reason_required" }, 400);
  const current = await c.env.DB.prepare("SELECT * FROM products WHERE id=?").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!current) return c.json({ error: "not_found" }, 404);
  const title = input.title?.trim() || String(current.title), description = input.description?.trim() ?? String(current.description), priceKobo = input.priceKobo ?? Number(current.price_kobo), status = input.status ?? String(current.status), min = input.preparationMinDays ?? Number(current.preparation_min_days), max = input.preparationMaxDays ?? Number(current.preparation_max_days);
  if (!Number.isInteger(priceKobo) || priceKobo < 0 || !Number.isInteger(min) || min < 1 || !Number.isInteger(max) || max < min || !["draft","published","archived"].includes(status)) return c.json({ error: "invalid_product" }, 400);
  const now = new Date().toISOString(), actor = c.req.header("oai-authenticated-user-id")!;
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE products SET title=?,description=?,price_kobo=?,status=?,preparation_min_days=?,preparation_max_days=?,updated_at=? WHERE id=?").bind(title, description, priceKobo, status, min, max, now, c.req.param("id")),
    c.env.DB.prepare("INSERT INTO admin_audit_log (id,actor_id,action,entity_type,entity_id,before_json,after_json,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), actor, "product.update", "product", c.req.param("id"), JSON.stringify(current), JSON.stringify({ title, description, priceKobo, status, preparationMinDays:min, preparationMaxDays:max }), input.reason.trim(), now),
  ]);
  return c.json({ ok: true });
});

api.patch("/admin/variants/:id/capacity", async c => {
  if (!c.env.DB) return unavailable(c, "database");
  const input = await c.req.json<{ capacity: number; preorderOpen?: boolean; reason?: string }>();
  if (!Number.isInteger(input.capacity) || input.capacity < 0 || !input.reason?.trim()) return c.json({ error: "invalid_capacity_change" }, 400);
  const current = await c.env.DB.prepare("SELECT * FROM variants WHERE id=?").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!current) return c.json({ error: "not_found" }, 404);
  if (input.capacity < Number(current.reserved_quantity) + Number(current.committed_quantity)) return c.json({ error: "capacity_below_allocated" }, 409);
  const open = input.preorderOpen === undefined ? Number(current.preorder_open) : Number(input.preorderOpen), delta = input.capacity - Number(current.capacity), now = new Date().toISOString(), actor = c.req.header("oai-authenticated-user-id")!;
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE variants SET capacity=?,preorder_open=? WHERE id=?").bind(input.capacity, open, c.req.param("id")),
    c.env.DB.prepare("INSERT INTO capacity_movements (id,variant_id,delta,reason,reference_type,reference_id,actor_id,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), c.req.param("id"), delta, input.reason.trim(), "admin_adjustment", c.req.param("id"), actor, now),
    c.env.DB.prepare("INSERT INTO admin_audit_log (id,actor_id,action,entity_type,entity_id,before_json,after_json,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), actor, "variant.capacity", "variant", c.req.param("id"), JSON.stringify(current), JSON.stringify({ capacity:input.capacity, preorderOpen:Boolean(open) }), input.reason.trim(), now),
  ]);
  return c.json({ ok: true, capacity: input.capacity, preorderOpen: Boolean(open) });
});

api.post("/admin/products/:id/images", async c => {
  if (!c.env.DB) return unavailable(c, "database");
  if (!c.env.PRODUCT_IMAGES) return unavailable(c, "media");
  const contentType = c.req.header("content-type") ?? "";
  if (!/^image\/(jpeg|png|webp|avif)$/.test(contentType)) return c.json({ error: "unsupported_image_type" }, 415);
  const body = await c.req.arrayBuffer();
  if (!body.byteLength || body.byteLength > 8 * 1024 * 1024) return c.json({ error: "image_size_invalid" }, 413);
  const product = await c.env.DB.prepare("SELECT id FROM products WHERE id=?").bind(c.req.param("id")).first();
  if (!product) return c.json({ error: "not_found" }, 404);
  const extension = contentType.split("/")[1].replace("jpeg", "jpg"), imageId = crypto.randomUUID(), key = `products/${c.req.param("id")}/${imageId}.${extension}`;
  await c.env.PRODUCT_IMAGES.put(key, body, { httpMetadata: { contentType } });
  try {
    await c.env.DB.prepare("INSERT INTO product_images (id,product_id,object_key,alt_text,sort_order,is_cover,created_at) VALUES (?,?,?,?,COALESCE((SELECT MAX(sort_order)+1 FROM product_images WHERE product_id=?),0),0,?)").bind(imageId, c.req.param("id"), key, c.req.query("alt")?.trim() || "Product image", c.req.param("id"), new Date().toISOString()).run();
  } catch (error) { await c.env.PRODUCT_IMAGES.delete(key); throw error; }
  return c.json({ id: imageId, url: `/api/media/${encodeURIComponent(key)}` }, 201);
});

api.post("/checkout/reserve", async c => {
  if (!c.env.DB) return unavailable(c, "database");
  if ((c.env.APP_MODE ?? "preview") === "production") return c.json({ error: "production_launch_gate_closed" }, 503);
  const body = await c.req.json<{ idempotencyKey: string; lines: { variantId: string; quantity: number }[] }>();
  const orderId = crypto.randomUUID(), reservationId = crypto.randomUUID();
  try { return c.json(await reserveBasketAtomically(c.env.DB, { orderId, reservationId, idempotencyKey: body.idempotencyKey, expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(), lines: body.lines }), 201); }
  catch (error) { console.error(JSON.stringify({ message: "reservation_failed", orderId, error: error instanceof Error ? error.message : "unknown" })); return c.json({ error: "basket_unavailable" }, 409); }
});
