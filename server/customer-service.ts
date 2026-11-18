export async function getCustomerOrders(db: D1Database, customerId: string) {
  const orders = await db
    .prepare(
      "SELECT id,order_number,email,full_name,total_kobo,currency,order_status,fulfilment_status,dispatch_min_date,dispatch_max_date,revised_dispatch_min_date,revised_dispatch_max_date,delay_message,courier_name,tracking_reference,tracking_url,created_at,updated_at FROM orders WHERE customer_id=? ORDER BY created_at DESC",
    )
    .bind(customerId)
    .all<Record<string, unknown>>();
  const output = [];
  for (const order of orders.results) {
    const items = await db
      .prepare(
        "SELECT title_snapshot,size_snapshot,colour_snapshot,quantity,unit_price_kobo,original_dispatch_window_json FROM order_items WHERE order_id=?",
      )
      .bind(order.id)
      .all();
    output.push({ ...order, items: items.results });
  }
  return output;
}

export async function getCustomerWishlist(db: D1Database, customerId: string) {
  const result = await db
    .prepare(
      "SELECT wi.product_id FROM wishlist_items wi JOIN wishlists w ON w.id=wi.wishlist_id JOIN products p ON p.id=wi.product_id WHERE w.customer_id=? AND p.status='published' AND p.is_sample=0 ORDER BY wi.created_at",
    )
    .bind(customerId)
    .all<{ product_id: string }>();
  return result.results.map((row) => row.product_id);
}

export async function replaceCustomerWishlist(
  db: D1Database,
  customerId: string,
  productIds: unknown,
) {
  if (!Array.isArray(productIds) || productIds.length > 200)
    throw new Error("invalid_wishlist");
  const unique = [...new Set(productIds.filter((id): id is string => typeof id === "string"))];
  const wishlist = await db
    .prepare("SELECT id FROM wishlists WHERE customer_id=?")
    .bind(customerId)
    .first<{ id: string }>();
  if (!wishlist) throw new Error("wishlist_not_found");
  const statements = [
    db.prepare("DELETE FROM wishlist_items WHERE wishlist_id=?").bind(wishlist.id),
  ];
  const now = new Date().toISOString();
  for (const id of unique) {
    statements.push(
      db
        .prepare(
          "INSERT INTO wishlist_items (wishlist_id,product_id,created_at) SELECT ?,id,? FROM products WHERE id=? AND status='published' AND is_sample=0",
        )
        .bind(wishlist.id, now, id),
    );
  }
  await db.batch(statements);
  return getCustomerWishlist(db, customerId);
}
