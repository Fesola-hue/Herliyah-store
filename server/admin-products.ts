import { ALLOWED_SIZES, json, nowIso, slugify, writeAudit } from "./admin-shared.ts";

export type ProductInput = {
  title?: string;
  slug?: string;
  description?: string;
  category?: string;
  priceKobo?: number;
  careInstructions?: string;
  measurements?: Record<string, string>;
  sizeGuideKey?: string;
  preparationMinDays?: number;
  preparationMaxDays?: number;
  preparationDayBasis?: "business" | "calendar";
  specificDispatchDate?: string | null;
};

export async function listAdminProducts(db: D1Database) {
  return (
    await db
      .prepare(
        `SELECT p.*,
        (SELECT COUNT(*) FROM variants v WHERE v.product_id=p.id) AS variant_count,
        (SELECT COUNT(*) FROM product_images i WHERE i.product_id=p.id) AS image_count,
        (SELECT object_key FROM product_images i WHERE i.product_id=p.id ORDER BY i.is_cover DESC,i.sort_order,i.id LIMIT 1) AS cover_object_key,
        (SELECT COALESCE(SUM(v.capacity-v.reserved_quantity-v.committed_quantity),0) FROM variants v WHERE v.product_id=p.id AND v.preorder_open=1) AS available_capacity
        FROM products p ORDER BY CASE p.status WHEN 'draft' THEN 0 WHEN 'published' THEN 1 ELSE 2 END,p.updated_at DESC`,
      )
      .all()
  ).results.map((product) => ({
    ...product,
    cover_url: product.cover_object_key
      ? String(product.cover_object_key).startsWith("public:")
        ? `/${String(product.cover_object_key).slice(7).split("#")[0]}`
        : `/api/media/${encodeURIComponent(String(product.cover_object_key))}`
      : null,
  }));
}

export async function getAdminProduct(db: D1Database, id: string) {
  const [product, images, variants, audit] = await db.batch([
    db.prepare("SELECT * FROM products WHERE id=?").bind(id),
    db.prepare("SELECT id,object_key,alt_text,sort_order,is_cover,colour,created_at FROM product_images WHERE product_id=? ORDER BY sort_order,id").bind(id),
    db.prepare("SELECT id,sku,size,colour,capacity,reserved_quantity,committed_quantity,preorder_open FROM variants WHERE product_id=? ORDER BY colour,CASE size WHEN 'XS' THEN 1 WHEN 'S' THEN 2 WHEN 'M' THEN 3 WHEN 'L' THEN 4 WHEN 'XL' THEN 5 ELSE 9 END").bind(id),
    db.prepare("SELECT action,actor_id,before_json,after_json,reason,created_at FROM admin_audit_log WHERE entity_type='product' AND entity_id=? ORDER BY created_at DESC LIMIT 30").bind(id),
  ]);
  const row = product.results[0];
  if (!row) return null;
  return {
    ...row,
    images: images.results.map((image) => ({
      ...image,
      url: String(image.object_key).startsWith("public:")
        ? `/${String(image.object_key).slice(7).split("#")[0]}`
        : `/api/media/${encodeURIComponent(String(image.object_key))}`,
    })),
    variants: variants.results,
    audit: audit.results,
  };
}

export async function createAdminProduct(
  db: D1Database,
  actorId: string,
  input: ProductInput,
) {
  const id = crypto.randomUUID();
  const title = input.title?.trim() || "Untitled style";
  const slug = slugify(input.slug || title) || `style-${id.slice(0, 8)}`;
  const timestamp = nowIso();
  await db.batch([
    db
      .prepare(
        `INSERT INTO products
        (id,slug,title,description,category,price_kobo,status,is_sample,preparation_min_days,preparation_max_days,preparation_day_basis,preparation_trigger,care_instructions,measurements_json,size_guide_key,specific_dispatch_date,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'draft',0,?,?,?,'verified_payment',?,?,?,?,?,?)`,
      )
      .bind(
        id,
        slug,
        title,
        input.description?.trim() || "",
        input.category?.trim() || "",
        Number.isInteger(input.priceKobo) ? input.priceKobo : 0,
        input.preparationMinDays ?? 1,
        input.preparationMaxDays ?? input.preparationMinDays ?? 1,
        input.preparationDayBasis ?? "business",
        input.careInstructions?.trim() || "",
        json(input.measurements || {}),
        input.sizeGuideKey?.trim() || "brand-default",
        input.specificDispatchDate || null,
        timestamp,
        timestamp,
      ),
    db.prepare("INSERT INTO admin_audit_log (id,actor_id,action,entity_type,entity_id,before_json,after_json,reason,created_at) VALUES (?,?,?,?,?,NULL,?,?,?)")
      .bind(crypto.randomUUID(), actorId, "product.create", "product", id, json({ title, slug, status: "draft" }), "Created draft", timestamp),
  ]);
  return getAdminProduct(db, id);
}

export async function updateAdminProduct(
  db: D1Database,
  actorId: string,
  id: string,
  input: ProductInput,
  reason: string,
) {
  const current = await db
    .prepare("SELECT * FROM products WHERE id=?")
    .bind(id)
    .first<Record<string, unknown>>();
  if (!current) return null;
  const title = input.title?.trim() ?? String(current.title);
  const slug = input.slug === undefined ? String(current.slug) : slugify(input.slug);
  const priceKobo = input.priceKobo ?? Number(current.price_kobo);
  const min = input.preparationMinDays ?? Number(current.preparation_min_days);
  const max = input.preparationMaxDays ?? Number(current.preparation_max_days);
  const basis = input.preparationDayBasis ?? String(current.preparation_day_basis);
  if (
    !title ||
    !slug ||
    !Number.isInteger(priceKobo) ||
    priceKobo < 0 ||
    !Number.isInteger(min) ||
    min < 1 ||
    !Number.isInteger(max) ||
    max < min ||
    !["business", "calendar"].includes(basis)
  )
    throw new Error("invalid_product");
  const after = {
    title,
    slug,
    description: input.description?.trim() ?? String(current.description),
    category: input.category?.trim() ?? String(current.category),
    priceKobo,
    careInstructions:
      input.careInstructions?.trim() ?? String(current.care_instructions),
    measurements:
      input.measurements ?? JSON.parse(String(current.measurements_json || "{}")),
    sizeGuideKey: input.sizeGuideKey?.trim() ?? String(current.size_guide_key),
    preparationMinDays: min,
    preparationMaxDays: max,
    preparationDayBasis: basis,
    specificDispatchDate:
      input.specificDispatchDate === undefined
        ? current.specific_dispatch_date
        : input.specificDispatchDate || null,
  };
  const timestamp = nowIso();
  await db
    .prepare(
      `UPDATE products SET title=?,slug=?,description=?,category=?,price_kobo=?,care_instructions=?,measurements_json=?,size_guide_key=?,preparation_min_days=?,preparation_max_days=?,preparation_day_basis=?,specific_dispatch_date=?,updated_at=? WHERE id=?`,
    )
    .bind(
      after.title,
      after.slug,
      after.description,
      after.category,
      after.priceKobo,
      after.careInstructions,
      json(after.measurements),
      after.sizeGuideKey,
      after.preparationMinDays,
      after.preparationMaxDays,
      after.preparationDayBasis,
      after.specificDispatchDate,
      timestamp,
      id,
    )
    .run();
  await writeAudit(
    db,
    actorId,
    "product.update",
    "product",
    id,
    current,
    after,
    reason,
  );
  return getAdminProduct(db, id);
}

export async function productPublicationErrors(db: D1Database, id: string) {
  const product = await getAdminProduct(db, id);
  if (!product) return ["Product not found"];
  const errors: string[] = [];
  if (Boolean(product.is_sample))
    errors.push("Sample products cannot be published as merchandise");
  if (!String(product.title).trim()) errors.push("Product name is required");
  if (!String(product.slug).trim()) errors.push("Slug is required");
  if (!String(product.description).trim()) errors.push("Description is required");
  if (!String(product.category).trim()) errors.push("Category is required");
  if (Number(product.price_kobo) <= 0)
    errors.push("A positive NGN price is required");
  if (!String(product.care_instructions).trim())
    errors.push("Care instructions are required");
  if (!String(product.size_guide_key).trim())
    errors.push("A size guide is required");
  if (!product.images.length) errors.push("At least one image is required");
  if (
    product.images.length &&
    !product.images.some((image) => Boolean(image.is_cover))
  )
    errors.push("Choose a cover image");
  if (product.images.some((image) => !String(image.alt_text).trim()))
    errors.push("Every image needs alt text");
  if (!product.variants.length)
    errors.push("At least one purchasable variant is required");
  if (
    product.variants.some(
      (variant) => !ALLOWED_SIZES.has(String(variant.size)),
    )
  )
    errors.push("Sizes must use XS, S, M, L or XL");
  if (product.variants.some((variant) => !String(variant.colour).trim()))
    errors.push("Every variant needs a colour");
  if (
    !product.specific_dispatch_date &&
    (Number(product.preparation_min_days) < 1 ||
      Number(product.preparation_max_days) <
        Number(product.preparation_min_days))
  )
    errors.push("Configure a preparation range or a specific dispatch date");
  return errors;
}

export async function changeAdminProductStatus(
  db: D1Database,
  actorId: string,
  id: string,
  status: "draft" | "published" | "archived",
  reason: string,
) {
  const current = await db
    .prepare("SELECT * FROM products WHERE id=?")
    .bind(id)
    .first<Record<string, unknown>>();
  if (!current) return null;
  if (status === "published") {
    const errors = await productPublicationErrors(db, id);
    if (errors.length) return { ok: false as const, errors };
  }
  const timestamp = nowIso();
  await db
    .prepare(
      "UPDATE products SET status=?,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,?) ELSE published_at END,archived_at=CASE WHEN ?='archived' THEN ? ELSE NULL END,updated_at=? WHERE id=?",
    )
    .bind(status, status, timestamp, status, timestamp, timestamp, id)
    .run();
  await writeAudit(
    db,
    actorId,
    `product.${status}`,
    "product",
    id,
    current,
    { status },
    reason,
  );
  return { ok: true as const, product: await getAdminProduct(db, id) };
}
