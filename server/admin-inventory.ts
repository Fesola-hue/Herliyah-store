import { ALLOWED_SIZES, nowIso, writeAudit } from "./admin-shared.ts";
import { getAdminProduct } from "./admin-products.ts";

export type VariantInput = {
  id?: string;
  sku: string;
  size: string;
  colour: string;
  capacity: number;
  preorderOpen?: boolean;
};

export async function replaceAdminVariants(
  db: D1Database,
  actorId: string,
  productId: string,
  variants: VariantInput[],
  reason?: string,
) {
  if (
    !variants.length ||
    variants.some(
      (variant) =>
        !variant.sku?.trim() ||
        !variant.colour?.trim() ||
        !ALLOWED_SIZES.has(variant.size) ||
        !Number.isInteger(variant.capacity) ||
        variant.capacity < 0,
    )
  )
    throw new Error("invalid_variants");
  const existing = await db
    .prepare("SELECT * FROM variants WHERE product_id=?")
    .bind(productId)
    .all<Record<string, unknown>>();
  const existingById = new Map(
    existing.results.map((row) => [String(row.id), row]),
  );
  const incomingIds = new Set(
    variants.map((variant) => variant.id).filter(Boolean),
  );
  const capacityChanged =
    existing.results.some(
      (row) =>
        !incomingIds.has(String(row.id)) ||
        variants.some(
          (variant) =>
            variant.id === row.id &&
            Number(variant.capacity) !== Number(row.capacity),
        ),
    );
  if (capacityChanged && !reason?.trim())
    throw new Error("capacity_reason_required");
  const retained = new Set<string>();
  const statements: D1PreparedStatement[] = [];
  for (const variant of variants) {
    const id =
      variant.id && existingById.has(variant.id)
        ? variant.id
        : crypto.randomUUID();
    retained.add(id);
    const current = existingById.get(id);
    if (current) {
      if (
        variant.capacity <
        Number(current.reserved_quantity) + Number(current.committed_quantity)
      )
        throw new Error("capacity_below_allocated");
      statements.push(
        db
          .prepare(
            "UPDATE variants SET sku=?,size=?,colour=?,capacity=?,preorder_open=? WHERE id=? AND product_id=?",
          )
          .bind(
            variant.sku.trim(),
            variant.size,
            variant.colour.trim(),
            variant.capacity,
            Number(variant.preorderOpen !== false),
            id,
            productId,
          ),
      );
    } else {
      statements.push(
        db
          .prepare(
            "INSERT INTO variants (id,product_id,sku,size,colour,capacity,reserved_quantity,committed_quantity,preorder_open) VALUES (?,?,?,?,?,?,0,0,?)",
          )
          .bind(
            id,
            productId,
            variant.sku.trim(),
            variant.size,
            variant.colour.trim(),
            variant.capacity,
            Number(variant.preorderOpen !== false),
          ),
      );
    }
  }
  for (const current of existing.results) {
    if (!retained.has(String(current.id))) {
      if (Number(current.reserved_quantity) || Number(current.committed_quantity))
        statements.push(
          db
            .prepare("UPDATE variants SET preorder_open=0 WHERE id=?")
            .bind(current.id),
        );
      else
        statements.push(
          db.prepare("DELETE FROM variants WHERE id=?").bind(current.id),
        );
    }
  }
  const timestamp = nowIso();
  statements.push(
    db.prepare("UPDATE products SET updated_at=? WHERE id=?").bind(timestamp, productId),
  );
  await db.batch(statements);
  await writeAudit(
    db,
    actorId,
    "product.variants.replace",
    "product",
    productId,
    existing.results,
    variants,
    capacityChanged
      ? reason!.trim()
      : existing.results.length
        ? "Saved size and colour options"
        : "Added initial size and colour options",
  );
  return getAdminProduct(db, productId);
}

export async function reorderAdminImages(
  db: D1Database,
  actorId: string,
  productId: string,
  images: Array<{
    id: string;
    altText: string;
    colour?: string | null;
    isCover?: boolean;
  }>,
) {
  if (!images.length || images.filter((image) => image.isCover).length !== 1)
    throw new Error("one_cover_required");
  const existing = await db
    .prepare("SELECT id FROM product_images WHERE product_id=?")
    .bind(productId)
    .all<{ id: string }>();
  if (
    images.length !== existing.results.length ||
    images.some(
      (image) => !existing.results.some((row) => row.id === image.id),
    ) ||
    images.some((image) => !image.altText?.trim())
  )
    throw new Error("invalid_images");
  const timestamp = nowIso();
  await db.batch([
    ...images.map((image, index) =>
      db
        .prepare(
          "UPDATE product_images SET sort_order=?,is_cover=?,alt_text=?,colour=? WHERE id=? AND product_id=?",
        )
        .bind(
          index,
          Number(Boolean(image.isCover)),
          image.altText.trim(),
          image.colour?.trim() || null,
          image.id,
          productId,
        ),
    ),
    db.prepare("UPDATE products SET updated_at=? WHERE id=?").bind(timestamp, productId),
  ]);
  await writeAudit(
    db,
    actorId,
    "product.images.reorder",
    "product",
    productId,
    existing.results,
    images,
    "Updated image order and metadata",
  );
  return getAdminProduct(db, productId);
}
