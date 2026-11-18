import { json, nowIso, writeAudit } from "./admin-shared.ts";

const TRANSITIONS: Record<string, string[]> = {
  awaiting_production: ["confirmed"],
  confirmed: ["in_preparation"],
  in_preparation: ["ready_to_dispatch"],
  ready_to_dispatch: ["dispatched"],
  dispatched: ["delivered"],
  delivered: [],
};

export async function listAdminOrders(
  db: D1Database,
  filters: { query?: string; payment?: string; fulfilment?: string },
) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (filters.query?.trim()) {
    clauses.push(
      "(o.order_number LIKE ? OR o.email LIKE ? OR o.full_name LIKE ? OR o.phone LIKE ?)",
    );
    const query = `%${filters.query.trim()}%`;
    values.push(query, query, query, query);
  }
  if (filters.fulfilment?.trim()) {
    clauses.push("o.fulfilment_status=?");
    values.push(filters.fulfilment.trim());
  }
  if (filters.payment?.trim()) {
    clauses.push(
      "EXISTS (SELECT 1 FROM payment_attempts p WHERE p.order_id=o.id AND p.status=?)",
    );
    values.push(filters.payment.trim());
  }
  return (
    await db
      .prepare(
        `SELECT o.id,o.order_number,o.full_name,o.email,o.phone,o.total_kobo,o.currency,o.order_status,o.fulfilment_status,o.dispatch_min_date,o.dispatch_max_date,o.revised_dispatch_min_date,o.revised_dispatch_max_date,o.created_at,o.updated_at,
        (SELECT status FROM payment_attempts p WHERE p.order_id=o.id ORDER BY p.created_at DESC LIMIT 1) AS payment_status,
        (SELECT provider FROM payment_attempts p WHERE p.order_id=o.id ORDER BY p.created_at DESC LIMIT 1) AS payment_provider,
        (SELECT environment FROM payment_attempts p WHERE p.order_id=o.id ORDER BY p.created_at DESC LIMIT 1) AS payment_environment
        FROM orders o ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
        ORDER BY o.updated_at DESC LIMIT 200`,
      )
      .bind(...values)
      .all()
  ).results;
}

export async function getAdminOrder(db: D1Database, id: string) {
  const [order, items, payments, events, refunds] = await db.batch([
    db.prepare("SELECT * FROM orders WHERE id=?").bind(id),
    db.prepare("SELECT * FROM order_items WHERE order_id=?").bind(id),
    db
      .prepare(
        "SELECT id,provider,reference,amount_kobo,currency,environment,status,failure_reason,created_at,updated_at FROM payment_attempts WHERE order_id=? ORDER BY created_at DESC",
      )
      .bind(id),
    db
      .prepare(
        "SELECT dimension,from_status,to_status,customer_message,created_by,created_at FROM order_status_events WHERE order_id=? ORDER BY created_at DESC",
      )
      .bind(id),
    db.prepare("SELECT * FROM refunds WHERE order_id=? ORDER BY created_at DESC").bind(id),
  ]);
  if (!order.results[0]) return null;
  return {
    ...order.results[0],
    items: items.results,
    payments: payments.results,
    events: events.results,
    refunds: refunds.results,
  };
}

export type FulfilmentInput = {
  status: string;
  customerMessage?: string;
  courierName?: string;
  trackingReference?: string;
  trackingUrl?: string;
  revisedDispatchMinDate?: string;
  revisedDispatchMaxDate?: string;
  delayMessage?: string;
  internalNotes?: string;
};

export async function updateAdminFulfilment(
  db: D1Database,
  actorId: string,
  id: string,
  input: FulfilmentInput,
) {
  const order = await db
    .prepare("SELECT * FROM orders WHERE id=?")
    .bind(id)
    .first<Record<string, unknown>>();
  if (!order) return null;
  const payment = await db
    .prepare(
      "SELECT status FROM payment_attempts WHERE order_id=? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(id)
    .first<{ status: string }>();
  if (payment?.status !== "succeeded")
    throw new Error("verified_payment_required");
  const current = String(order.fulfilment_status);
  if (!(TRANSITIONS[current] || []).includes(input.status))
    throw new Error("invalid_fulfilment_transition");
  if (
    input.status === "dispatched" &&
    (!input.courierName?.trim() || !input.trackingReference?.trim())
  )
    throw new Error("courier_details_required");
  if (
    input.revisedDispatchMinDate &&
    input.revisedDispatchMaxDate &&
    input.revisedDispatchMaxDate < input.revisedDispatchMinDate
  )
    throw new Error("invalid_revised_dispatch_window");
  const timestamp = nowIso();
  const after = {
    status: input.status,
    courierName: input.courierName?.trim() || order.courier_name || null,
    trackingReference:
      input.trackingReference?.trim() || order.tracking_reference || null,
    trackingUrl: input.trackingUrl?.trim() || order.tracking_url || null,
    revisedDispatchMinDate:
      input.revisedDispatchMinDate || order.revised_dispatch_min_date || null,
    revisedDispatchMaxDate:
      input.revisedDispatchMaxDate || order.revised_dispatch_max_date || null,
    delayMessage: input.delayMessage?.trim() || order.delay_message || null,
    internalNotes: input.internalNotes?.trim() || order.internal_notes || null,
  };
  await db.batch([
    db
      .prepare(
        "UPDATE orders SET fulfilment_status=?,courier_name=?,tracking_reference=?,tracking_url=?,revised_dispatch_min_date=?,revised_dispatch_max_date=?,delay_message=?,internal_notes=?,updated_at=? WHERE id=?",
      )
      .bind(
        after.status,
        after.courierName,
        after.trackingReference,
        after.trackingUrl,
        after.revisedDispatchMinDate,
        after.revisedDispatchMaxDate,
        after.delayMessage,
        after.internalNotes,
        timestamp,
        id,
      ),
    db
      .prepare(
        "INSERT INTO order_status_events (id,order_id,dimension,from_status,to_status,customer_message,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        id,
        "fulfilment",
        current,
        input.status,
        input.customerMessage?.trim() || after.delayMessage || null,
        actorId,
        timestamp,
      ),
    db
      .prepare(
        "INSERT OR IGNORE INTO notification_outbox (id,event_key,event_type,payload_json,status,attempts,next_attempt_at,created_at,updated_at) VALUES (?,?,'order.fulfilment_updated',?,'pending',0,?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        `order.fulfilment:${id}:${input.status}`,
        json({ orderId: id, status: input.status }),
        timestamp,
        timestamp,
        timestamp,
      ),
  ]);
  await writeAudit(
    db,
    actorId,
    "order.fulfilment",
    "order",
    id,
    order,
    after,
    input.customerMessage || "Fulfilment update",
  );
  return getAdminOrder(db, id);
}
