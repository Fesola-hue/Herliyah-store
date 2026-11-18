import { json, nowIso, slugify, writeAudit } from "./admin-shared.ts";

export async function getAdminSettings(db: D1Database) {
  const [settings, zones, featured] = await db.batch([
    db.prepare("SELECT key,value_json,updated_at FROM store_settings ORDER BY key"),
    db.prepare("SELECT * FROM delivery_zones ORDER BY name"),
    db.prepare("SELECT id,title,slug,status,featured_order FROM products WHERE featured_order IS NOT NULL ORDER BY featured_order"),
  ]);
  return {
    settings: Object.fromEntries(
      settings.results.map((row) => [
        String(row.key),
        JSON.parse(String(row.value_json)),
      ]),
    ),
    deliveryZones: zones.results,
    featuredProducts: featured.results,
  };
}

export async function saveAdminSetting(
  db: D1Database,
  actorId: string,
  key: string,
  value: unknown,
) {
  const allowed = new Set([
    "contact",
    "size_guide",
    "policies",
    "mixed_basket_policy",
    "checkout",
  ]);
  if (!allowed.has(key)) throw new Error("unsupported_setting");
  const before = await db
    .prepare("SELECT value_json FROM store_settings WHERE key=?")
    .bind(key)
    .first<{ value_json: string }>();
  const timestamp = nowIso();
  await db
    .prepare(
      "INSERT INTO store_settings (key,value_json,updated_by,updated_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
    )
    .bind(key, json(value), actorId, timestamp)
    .run();
  await writeAudit(
    db,
    actorId,
    "settings.update",
    "setting",
    key,
    before ? JSON.parse(before.value_json) : null,
    value,
    "Owner settings update",
  );
}

export type DeliveryZoneInput = {
  id?: string;
  name: string;
  feeKobo: number;
  transitMinDays: number;
  transitMaxDays: number;
  transitDayBasis?: string;
  active?: boolean;
};

export async function saveAdminDeliveryZone(
  db: D1Database,
  actorId: string,
  input: DeliveryZoneInput,
) {
  if (
    !input.name?.trim() ||
    !Number.isInteger(input.feeKobo) ||
    input.feeKobo < 0 ||
    !Number.isInteger(input.transitMinDays) ||
    input.transitMinDays < 1 ||
    !Number.isInteger(input.transitMaxDays) ||
    input.transitMaxDays < input.transitMinDays ||
    !["business", "calendar"].includes(input.transitDayBasis || "business")
  )
    throw new Error("invalid_delivery_zone");
  const id = input.id?.trim() || slugify(input.name) || crypto.randomUUID();
  const before = await db
    .prepare("SELECT * FROM delivery_zones WHERE id=?")
    .bind(id)
    .first();
  await db
    .prepare(
      "INSERT INTO delivery_zones (id,name,fee_kobo,transit_min_days,transit_max_days,active,transit_day_basis) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,fee_kobo=excluded.fee_kobo,transit_min_days=excluded.transit_min_days,transit_max_days=excluded.transit_max_days,active=excluded.active,transit_day_basis=excluded.transit_day_basis",
    )
    .bind(
      id,
      input.name.trim(),
      input.feeKobo,
      input.transitMinDays,
      input.transitMaxDays,
      Number(Boolean(input.active)),
      input.transitDayBasis || "business",
    )
    .run();
  await writeAudit(
    db,
    actorId,
    "delivery_zone.update",
    "delivery_zone",
    id,
    before,
    input,
    "Owner delivery configuration",
  );
  return id;
}

export async function saveAdminFeaturedProducts(
  db: D1Database,
  actorId: string,
  productIds: string[],
) {
  if (new Set(productIds).size !== productIds.length)
    throw new Error("duplicate_featured_product");
  const products = productIds.length
    ? await db
        .prepare(
          `SELECT id,status,is_sample FROM products WHERE id IN (${productIds.map(() => "?").join(",")})`,
        )
        .bind(...productIds)
        .all<Record<string, unknown>>()
    : { results: [] as Record<string, unknown>[] };
  if (
    products.results.length !== productIds.length ||
    products.results.some(
      (product) => product.status !== "published" || Boolean(product.is_sample),
    )
  )
    throw new Error("featured_products_must_be_published");
  const before = await db
    .prepare("SELECT id FROM products WHERE featured_order IS NOT NULL ORDER BY featured_order")
    .all<{ id: string }>();
  const timestamp = nowIso();
  await db.batch([
    ...before.results.map((product) =>
      db.prepare("UPDATE products SET featured_order=NULL WHERE id=?").bind(product.id),
    ),
    ...productIds.map((id, index) =>
      db
        .prepare("UPDATE products SET featured_order=?,updated_at=? WHERE id=?")
        .bind(index, timestamp, id),
    ),
  ]);
  await writeAudit(
    db,
    actorId,
    "homepage.featured.update",
    "setting",
    "featured_products",
    before.results.map((item) => item.id),
    productIds,
    "Owner homepage ordering",
  );
}
