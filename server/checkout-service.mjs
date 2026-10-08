const encoder = new TextEncoder();

export class CheckoutError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export async function sha256Hex(value) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function makeSecretToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function aggregateLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0)
    throw new CheckoutError("empty_basket");
  const quantities = new Map();
  for (const line of lines) {
    if (
      !line ||
      typeof line.variantId !== "string" ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 20
    )
      throw new CheckoutError("invalid_quantity");
    quantities.set(
      line.variantId,
      (quantities.get(line.variantId) ?? 0) + line.quantity,
    );
  }
  return [...quantities].map(([variantId, quantity]) => ({
    variantId,
    quantity,
  }));
}

function validateCustomer(customer) {
  const required = ["fullName", "email", "phone", "address", "city", "state"];
  if (
    !customer ||
    required.some(
      (key) => typeof customer[key] !== "string" || !customer[key].trim(),
    )
  )
    throw new CheckoutError("invalid_customer");
  if (!/^\S+@\S+\.\S+$/.test(customer.email))
    throw new CheckoutError("invalid_email");
  return Object.fromEntries(
    Object.entries(customer).map(([key, value]) => [
      key,
      typeof value === "string" ? value.trim() : value,
    ]),
  );
}

export async function getCatalog(db, mode = "preview") {
  const sampleClause = mode === "production" ? "AND p.is_sample=0" : "";
  const rows = await db
    .prepare(
      `SELECT p.id,p.slug,p.title,p.description,p.category,p.price_kobo,p.is_sample,p.preparation_min_days,p.preparation_max_days,p.preparation_day_basis,v.id AS variant_id,v.size,v.colour,v.capacity,v.reserved_quantity,v.committed_quantity,v.preorder_open,i.object_key,i.alt_text,i.sort_order,i.is_cover FROM products p JOIN variants v ON v.product_id=p.id LEFT JOIN product_images i ON i.product_id=p.id WHERE p.status='published' ${sampleClause} ORDER BY p.created_at,p.id,v.colour,v.size,i.sort_order`,
    )
    .all();
  const byId = new Map();
  for (const row of rows.results) {
    let product = byId.get(row.id);
    if (!product) {
      product = {
        id: row.id,
        slug: row.slug,
        name: row.title,
        category: row.category,
        description: row.description,
        priceKobo: Number(row.price_kobo),
        image: "",
        images: [],
        published: true,
        sample: Boolean(row.is_sample),
        accent: row.colour,
        preparation: {
          min: Number(row.preparation_min_days),
          max: Number(row.preparation_max_days),
          basis: `${row.preparation_day_basis} days`,
        },
        variants: [],
      };
      byId.set(row.id, product);
    }
    if (!product.variants.some((item) => item.id === row.variant_id))
      product.variants.push({
        id: row.variant_id,
        size: row.size,
        colour: row.colour,
        capacity: Math.max(
          0,
          Number(row.capacity) -
            Number(row.reserved_quantity) -
            Number(row.committed_quantity),
        ),
        open: Boolean(row.preorder_open),
      });
    if (row.object_key) {
      const src = String(row.object_key).startsWith("public:")
        ? `/${String(row.object_key).slice(7).split("#")[0]}`
        : `/api/media/${encodeURIComponent(row.object_key)}`;
      if (!product.images.some((item) => item.src === src))
        product.images.push({
          src,
          alt: row.alt_text || `Image for ${row.title}`,
          colour: row.colour,
        });
      if (!product.image || row.is_cover) product.image = src;
    }
  }
  return [...byId.values()].map((product) => ({
    ...product,
    image: product.image || "/file.svg",
    images: product.images.length
      ? product.images
      : [{ src: "/file.svg", alt: `Image pending for ${product.name}` }],
  }));
}

export async function quoteCheckout(db, input, mode = "preview") {
  const lines = aggregateLines(input.lines);
  const placeholders = lines.map(() => "?").join(",");
  const sampleClause = mode === "production" ? "AND p.is_sample=0" : "";
  const result = await db
    .prepare(
      `SELECT v.id AS variant_id,v.sku,v.size,v.colour,v.capacity,v.reserved_quantity,v.committed_quantity,v.preorder_open,p.id AS product_id,p.title,p.price_kobo,p.status,p.is_sample,p.preparation_min_days,p.preparation_max_days,p.preparation_day_basis,(SELECT object_key FROM product_images WHERE product_id=p.id ORDER BY is_cover DESC,sort_order LIMIT 1) AS object_key FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id IN (${placeholders}) ${sampleClause}`,
    )
    .bind(...lines.map((line) => line.variantId))
    .all();
  const byVariant = new Map(result.results.map((row) => [row.variant_id, row]));
  const items = [];
  for (const line of lines) {
    const row = byVariant.get(line.variantId);
    const available = row
      ? Number(row.capacity) -
        Number(row.reserved_quantity) -
        Number(row.committed_quantity)
      : 0;
    if (
      !row ||
      row.status !== "published" ||
      !row.preorder_open ||
      available < line.quantity
    )
      throw new CheckoutError("basket_unavailable", 409);
    const objectKey = String(row.object_key || "");
    const image = objectKey.startsWith("public:")
      ? `/${objectKey.slice(7).split("#")[0]}`
      : objectKey
        ? `/api/media/${encodeURIComponent(objectKey)}`
        : "/file.svg";
    items.push({
      productId: row.product_id,
      variantId: row.variant_id,
      sku: row.sku,
      name: row.title,
      image,
      colour: row.colour,
      size: row.size,
      quantity: line.quantity,
      unitPriceKobo: Number(row.price_kobo),
      lineTotalKobo: Number(row.price_kobo) * line.quantity,
      preparationMinDays: Number(row.preparation_min_days),
      preparationMaxDays: Number(row.preparation_max_days),
      preparationDayBasis: row.preparation_day_basis,
    });
  }
  const zoneId = input.deliveryZoneId || "lagos";
  const zone = await db
    .prepare(
      "SELECT id,name,fee_kobo,transit_min_days,transit_max_days FROM delivery_zones WHERE id=? AND active=1",
    )
    .bind(zoneId)
    .first();
  if (!zone) throw new CheckoutError("unsupported_delivery_zone", 422);
  const subtotalKobo = items.reduce((sum, item) => sum + item.lineTotalKobo, 0),
    deliveryFeeKobo = Number(zone.fee_kobo);
  return {
    currency: "NGN",
    items,
    subtotalKobo,
    deliveryFeeKobo,
    totalKobo: subtotalKobo + deliveryFeeKobo,
    deliveryZone: {
      id: zone.id,
      name: zone.name,
      transitMinDays: Number(zone.transit_min_days),
      transitMaxDays: Number(zone.transit_max_days),
    },
    courierEstimate: `${zone.transit_min_days}–${zone.transit_max_days} business days after dispatch`,
  };
}

async function existingCheckout(db, idempotencyKey) {
  return db
    .prepare(
      "SELECT pa.id AS payment_attempt_id,pa.order_id,pa.reference,pa.status AS payment_status,pa.authorization_url,pa.amount_kobo,o.order_number,o.order_status,o.fulfilment_status FROM payment_attempts pa JOIN orders o ON o.id=pa.order_id WHERE pa.idempotency_key=?",
    )
    .bind(idempotencyKey)
    .first();
}

export async function createCheckout(
  db,
  input,
  { mode = "preview", now = new Date() } = {},
) {
  if (
    typeof input.idempotencyKey !== "string" ||
    input.idempotencyKey.length < 8 ||
    input.idempotencyKey.length > 128
  )
    throw new CheckoutError("invalid_idempotency_key");
  const replay = await existingCheckout(db, input.idempotencyKey);
  if (replay) return { ...replay, replayed: true };
  const customer = validateCustomer(input.customer),
    quote = await quoteCheckout(db, input, mode);
  const orderId = crypto.randomUUID(),
    reservationId = crypto.randomUUID(),
    attemptId = crypto.randomUUID(),
    reference = `hly_${crypto.randomUUID().replaceAll("-", "")}`;
  const accessToken = makeSecretToken(),
    tokenHash = await sha256Hex(accessToken),
    createdAt = now.toISOString(),
    expiresAt = new Date(now.getTime() + 20 * 60_000).toISOString();
  const orderNumber = `HLY-${now.getUTCFullYear()}-${orderId.slice(0, 8).toUpperCase()}`;
  const address = {
    address: customer.address,
    city: customer.city,
    state: customer.state,
    landmark: customer.landmark || "",
    note: customer.note || "",
  };
  const statements = [
    db
      .prepare(
        "INSERT INTO orders (id,order_number,email,full_name,phone,address_snapshot_json,subtotal_kobo,delivery_kobo,total_kobo,currency,order_status,fulfilment_status,delivery_rule_snapshot_json,guest_access_token_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'NGN','awaiting_payment','awaiting_payment',?,?,?,?)",
      )
      .bind(
        orderId,
        orderNumber,
        customer.email.toLowerCase(),
        customer.fullName,
        customer.phone,
        JSON.stringify(address),
        quote.subtotalKobo,
        quote.deliveryFeeKobo,
        quote.totalKobo,
        JSON.stringify(quote.deliveryZone),
        tokenHash,
        createdAt,
        createdAt,
      ),
    ...quote.items.map((item) =>
      db
        .prepare(
          "INSERT INTO order_items (id,order_id,variant_id,quantity,title_snapshot,sku_snapshot,size_snapshot,colour_snapshot,unit_price_kobo,lead_time_snapshot_json,original_dispatch_window_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          orderId,
          item.variantId,
          item.quantity,
          item.name,
          item.sku,
          item.size,
          item.colour,
          item.unitPriceKobo,
          JSON.stringify({
            min: item.preparationMinDays,
            max: item.preparationMaxDays,
            basis: item.preparationDayBasis,
            trigger: "verified_payment",
          }),
          JSON.stringify({ status: "calculated_after_payment" }),
        ),
    ),
    db
      .prepare(
        "INSERT INTO reservations (id,order_id,status,expires_at,created_at) VALUES (?,?,'active',?,?)",
      )
      .bind(reservationId, orderId, expiresAt, createdAt),
    ...quote.items.flatMap((item) => [
      db
        .prepare(
          "UPDATE variants SET reserved_quantity=reserved_quantity+? WHERE id=?",
        )
        .bind(item.quantity, item.variantId),
      db
        .prepare(
          "INSERT INTO reservation_items (reservation_id,variant_id,quantity) VALUES (?,?,?)",
        )
        .bind(reservationId, item.variantId, item.quantity),
    ]),
    db
      .prepare(
        "INSERT INTO payment_attempts (id,order_id,provider,reference,idempotency_key,amount_kobo,currency,environment,status,created_at,updated_at) VALUES (?,?,'paystack',?,?,?,'NGN','test','initiated',?,?)",
      )
      .bind(
        attemptId,
        orderId,
        reference,
        input.idempotencyKey,
        quote.totalKobo,
        createdAt,
        createdAt,
      ),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    const concurrent = await existingCheckout(db, input.idempotencyKey);
    if (concurrent) return { ...concurrent, replayed: true };
    console.error(
      JSON.stringify({
        message: "checkout_transaction_failed",
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
    throw new CheckoutError("basket_unavailable", 409);
  }
  return {
    order_id: orderId,
    order_number: orderNumber,
    payment_attempt_id: attemptId,
    reference,
    payment_status: "initiated",
    order_status: "awaiting_payment",
    fulfilment_status: "awaiting_payment",
    amount_kobo: quote.totalKobo,
    accessToken,
    expiresAt,
    replayed: false,
    quote,
  };
}

export async function savePaymentInitialization(db, reference, result) {
  await db
    .prepare(
      "UPDATE payment_attempts SET status='pending',authorization_url=?,access_code=?,updated_at=? WHERE reference=? AND status IN ('initiated','pending')",
    )
    .bind(
      result.authorizationUrl,
      result.accessCode,
      new Date().toISOString(),
      reference,
    )
    .run();
  return getCheckoutByReference(db, reference);
}

export async function failPaymentInitialization(db, reference, reason) {
  const attempt = await db
    .prepare("SELECT order_id FROM payment_attempts WHERE reference=?")
    .bind(reference)
    .first();
  if (!attempt) return;
  const reservation = await db
    .prepare("SELECT id FROM reservations WHERE order_id=? AND status='active'")
    .bind(attempt.order_id)
    .first();
  const rows = reservation
    ? await db
        .prepare(
          "SELECT variant_id,quantity FROM reservation_items WHERE reservation_id=?",
        )
        .bind(reservation.id)
        .all()
    : { results: [] };
  await db.batch([
    ...rows.results.map((row) =>
      db
        .prepare(
          "UPDATE variants SET reserved_quantity=reserved_quantity-? WHERE id=? AND reserved_quantity>=?",
        )
        .bind(row.quantity, row.variant_id, row.quantity),
    ),
    ...(reservation
      ? [
          db
            .prepare(
              "UPDATE reservations SET status='released' WHERE id=? AND status='active'",
            )
            .bind(reservation.id),
        ]
      : []),
    db
      .prepare(
        "UPDATE payment_attempts SET status='failed',failure_reason=?,updated_at=? WHERE reference=? AND status!='succeeded'",
      )
      .bind(reason, new Date().toISOString(), reference),
    db
      .prepare(
        "UPDATE orders SET order_status='payment_failed',updated_at=? WHERE id=? AND order_status!='confirmed'",
      )
      .bind(new Date().toISOString(), attempt.order_id),
  ]);
}

export async function getCheckoutByReference(db, reference) {
  return db
    .prepare(
      "SELECT pa.id AS paymentAttemptId,pa.order_id AS orderId,pa.reference,pa.status AS paymentStatus,pa.authorization_url AS authorizationUrl,pa.amount_kobo AS amountKobo,pa.failure_reason AS failureReason,o.order_number AS orderNumber,o.order_status AS orderStatus,o.fulfilment_status AS fulfilmentStatus,r.status AS reservationStatus,r.expires_at AS reservationExpiresAt FROM payment_attempts pa JOIN orders o ON o.id=pa.order_id LEFT JOIN reservations r ON r.order_id=o.id WHERE pa.reference=?",
    )
    .bind(reference)
    .first();
}

export async function getGuestOrder(db, orderId, accessToken) {
  if (!accessToken) return null;
  const tokenHash = await sha256Hex(accessToken);
  const order = await db
    .prepare(
      "SELECT id,order_number,email,subtotal_kobo,delivery_kobo,total_kobo,currency,order_status,fulfilment_status,created_at,updated_at FROM orders WHERE id=? AND guest_access_token_hash=?",
    )
    .bind(orderId, tokenHash)
    .first();
  if (!order) return null;
  const items = await db
    .prepare(
      "SELECT quantity,title_snapshot,size_snapshot,colour_snapshot,unit_price_kobo,lead_time_snapshot_json FROM order_items WHERE order_id=?",
    )
    .bind(orderId)
    .all();
  return { ...order, items: items.results };
}

export async function applyVerifiedPayment(
  db,
  verified,
  { eventId, eventType = "verification", payloadHash = "server-verified" } = {},
) {
  const attempt = await db
    .prepare(
      "SELECT id,order_id,amount_kobo,currency,environment,status FROM payment_attempts WHERE reference=?",
    )
    .bind(verified.reference)
    .first();
  if (!attempt) throw new CheckoutError("payment_not_found", 404);
  if (eventId) {
    const prior = await db
      .prepare("SELECT outcome FROM payment_events WHERE provider_event_id=?")
      .bind(eventId)
      .first();
    if (prior) return { status: prior.outcome, replayed: true };
  }
  if (
    Number(attempt.amount_kobo) !== verified.amountKobo ||
    attempt.currency !== verified.currency ||
    attempt.environment !== verified.environment
  ) {
    await markPaymentException(
      db,
      attempt,
      verified,
      "verification_mismatch",
      eventId,
      eventType,
      payloadHash,
    );
    return { status: "payment_exception", replayed: false };
  }
  if (verified.status !== "succeeded") {
    const next = verified.status === "failed" ? "failed" : "pending";
    await db
      .prepare(
        "UPDATE payment_attempts SET status=?,provider_payload_json=?,updated_at=? WHERE id=? AND status!='succeeded'",
      )
      .bind(
        next,
        JSON.stringify(verified),
        new Date().toISOString(),
        attempt.id,
      )
      .run();
    return { status: next, replayed: false };
  }
  if (attempt.status === "succeeded")
    return { status: "confirmed", replayed: true };
  const reservation = await db
    .prepare("SELECT id,status FROM reservations WHERE order_id=?")
    .bind(attempt.order_id)
    .first();
  const rows = reservation
    ? await db
        .prepare(
          "SELECT variant_id,quantity FROM reservation_items WHERE reservation_id=?",
        )
        .bind(reservation.id)
        .all()
    : { results: [] };
  if (!reservation || !rows.results.length) {
    await markPaymentException(
      db,
      attempt,
      verified,
      "reservation_missing",
      eventId,
      eventType,
      payloadHash,
    );
    return { status: "payment_exception", replayed: false };
  }
  const now = new Date().toISOString();
  const allocation =
    reservation.status === "active"
      ? rows.results.map((row) =>
          db
            .prepare(
              "UPDATE variants SET reserved_quantity=reserved_quantity-?,committed_quantity=committed_quantity+? WHERE id=? AND reserved_quantity>=?",
            )
            .bind(row.quantity, row.quantity, row.variant_id, row.quantity),
        )
      : rows.results.map((row) =>
          db
            .prepare(
              "UPDATE variants SET committed_quantity=committed_quantity+? WHERE id=?",
            )
            .bind(row.quantity, row.variant_id),
        );
  try {
    await db.batch([
      ...allocation,
      db
        .prepare("UPDATE reservations SET status='consumed' WHERE id=?")
        .bind(reservation.id),
      db
        .prepare(
          "UPDATE payment_attempts SET status='succeeded',provider_payload_json=?,updated_at=? WHERE id=? AND status!='succeeded'",
        )
        .bind(JSON.stringify(verified), now, attempt.id),
      db
        .prepare(
          "UPDATE orders SET order_status='confirmed',fulfilment_status='awaiting_production',updated_at=? WHERE id=?",
        )
        .bind(now, attempt.order_id),
      db
        .prepare(
          "INSERT INTO order_status_events (id,order_id,dimension,from_status,to_status,customer_message,created_by,created_at) VALUES (?,?, 'order',?,'confirmed','Payment verified and preorder capacity allocated.','system',?)",
        )
        .bind(
          crypto.randomUUID(),
          attempt.order_id,
          reservation.status === "active" ? "awaiting_payment" : "payment_late",
          now,
        ),
      db
        .prepare(
          "INSERT OR IGNORE INTO notification_outbox (id,event_key,event_type,payload_json,status,attempts,created_at) VALUES (?,?, 'order.confirmed',?,'pending',0,?)",
        )
        .bind(
          crypto.randomUUID(),
          `order.confirmed:${attempt.order_id}`,
          JSON.stringify({ orderId: attempt.order_id }),
          now,
        ),
      ...(eventId
        ? [
            db
              .prepare(
                "INSERT INTO payment_events (id,provider,provider_event_id,reference,event_type,payload_hash,outcome,created_at) VALUES (?,'paystack',?,?,?,?, 'confirmed',?)",
              )
              .bind(
                crypto.randomUUID(),
                eventId,
                verified.reference,
                eventType,
                payloadHash,
                now,
              ),
          ]
        : []),
    ]);
    return {
      status: "confirmed",
      replayed: false,
      late: reservation.status === "released",
    };
  } catch {
    await markPaymentException(
      db,
      attempt,
      verified,
      reservation.status === "released"
        ? "late_payment_capacity_unavailable"
        : "allocation_failed",
      eventId,
      eventType,
      payloadHash,
    );
    return { status: "payment_exception", replayed: false };
  }
}

async function markPaymentException(
  db,
  attempt,
  verified,
  reason,
  eventId,
  eventType,
  payloadHash,
) {
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        "UPDATE payment_attempts SET status='exception',failure_reason=?,provider_payload_json=?,updated_at=? WHERE id=?",
      )
      .bind(reason, JSON.stringify(verified), now, attempt.id),
    db
      .prepare(
        "UPDATE orders SET order_status='payment_exception',fulfilment_status='exception',updated_at=? WHERE id=?",
      )
      .bind(now, attempt.order_id),
    db
      .prepare(
        "INSERT INTO order_status_events (id,order_id,dimension,from_status,to_status,customer_message,created_by,created_at) VALUES (?,?, 'payment',NULL,'exception','Payment needs owner review. No production allocation was confirmed.','system',?)",
      )
      .bind(crypto.randomUUID(), attempt.order_id, now),
    ...(eventId
      ? [
          db
            .prepare(
              "INSERT OR IGNORE INTO payment_events (id,provider,provider_event_id,reference,event_type,payload_hash,outcome,created_at) VALUES (?,'paystack',?,?,?,?, 'payment_exception',?)",
            )
            .bind(
              crypto.randomUUID(),
              eventId,
              verified.reference,
              eventType,
              payloadHash,
              now,
            ),
        ]
      : []),
  ]);
}

export async function releaseExpiredReservations(
  db,
  now = new Date().toISOString(),
  excludedOrderIds = [],
) {
  const excluded = new Set(excludedOrderIds);
  const expired = await db
    .prepare(
      "SELECT id,order_id FROM reservations WHERE status='active' AND expires_at<=? ORDER BY expires_at",
    )
    .bind(now)
    .all();
  const released = [];
  for (const reservation of expired.results) {
    if (excluded.has(reservation.order_id)) continue;
    const rows = await db
      .prepare(
        "SELECT variant_id,quantity FROM reservation_items WHERE reservation_id=?",
      )
      .bind(reservation.id)
      .all();
    try {
      await db.batch([
        ...rows.results.map((row) =>
          db
            .prepare(
              "UPDATE variants SET reserved_quantity=reserved_quantity-? WHERE id=? AND reserved_quantity>=?",
            )
            .bind(row.quantity, row.variant_id, row.quantity),
        ),
        db
          .prepare(
            "UPDATE reservations SET status='released' WHERE id=? AND status='active' AND expires_at<=?",
          )
          .bind(reservation.id, now),
        db
          .prepare(
            "UPDATE orders SET order_status='payment_expired',updated_at=? WHERE id=? AND order_status='awaiting_payment'",
          )
          .bind(now, reservation.order_id),
      ]);
      released.push(reservation.id);
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "reservation_release_failed",
          reservationId: reservation.id,
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
  return { released: released.length, reservationIds: released };
}

export async function reconcileExpiredPayments(
  db,
  verifyPayment,
  now = new Date().toISOString(),
) {
  const expired = await db
    .prepare(
      "SELECT r.order_id,p.reference FROM reservations r JOIN payment_attempts p ON p.order_id=r.order_id WHERE r.status='active' AND r.expires_at<=? AND p.status IN ('initiated','pending') ORDER BY r.expires_at",
    )
    .bind(now)
    .all();
  const deferredOrderIds = [];
  const outcomes = [];
  for (const row of expired.results) {
    try {
      const verified = await verifyPayment(row.reference);
      const outcome = await applyVerifiedPayment(db, verified, {
        eventId: `reconcile:${row.reference}:${verified.status}`,
        eventType: "reconciliation",
        payloadHash: await sha256Hex(JSON.stringify(verified)),
      });
      outcomes.push({ reference: row.reference, ...outcome });
    } catch (error) {
      deferredOrderIds.push(row.order_id);
      outcomes.push({
        reference: row.reference,
        status: "verification_deferred",
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  const release = await releaseExpiredReservations(db, now, deferredOrderIds);
  return {
    checked: expired.results.length,
    released: release.released,
    deferred: deferredOrderIds.length,
    outcomes,
  };
}
