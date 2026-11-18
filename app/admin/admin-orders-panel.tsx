"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch, naira } from "./admin-api";

type OrderSummary = {
  id: string;
  order_number: string;
  full_name: string;
  email: string;
  phone: string;
  total_kobo: number;
  payment_status: string;
  order_status: string;
  fulfilment_status: string;
  updated_at: string;
};
type OrderDetail = OrderSummary & {
  address_snapshot_json: string;
  dispatch_min_date?: string;
  dispatch_max_date?: string;
  revised_dispatch_min_date?: string;
  revised_dispatch_max_date?: string;
  delay_message?: string;
  courier_name?: string;
  tracking_reference?: string;
  tracking_url?: string;
  internal_notes?: string;
  items: Array<{
    id: string;
    title_snapshot: string;
    size_snapshot: string;
    colour_snapshot: string;
    quantity: number;
    unit_price_kobo: number;
  }>;
  events: Array<{
    dimension: string;
    to_status: string;
    customer_message?: string;
    created_at: string;
  }>;
};
const nextStatus: Record<string, string> = {
  awaiting_production: "confirmed",
  confirmed: "in_preparation",
  in_preparation: "ready_to_dispatch",
  ready_to_dispatch: "dispatched",
  dispatched: "delivered",
};

export function AdminOrdersPanel({ token }: { token: string }) {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [selected, setSelected] = useState<OrderDetail | null>(null);
  const [filters, setFilters] = useState({ q: "", payment: "", fulfilment: "" });
  const [form, setForm] = useState({
    customerMessage: "",
    courierName: "",
    trackingReference: "",
    trackingUrl: "",
    revisedDispatchMinDate: "",
    revisedDispatchMaxDate: "",
    delayMessage: "",
    internalNotes: "",
  });
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const params = new URLSearchParams(
      Object.entries(filters).filter(([, value]) => value),
    );
    const body = await adminFetch<{ orders: OrderSummary[] }>(
      `/api/admin/orders?${params}`,
      token,
    );
    setOrders(body.orders);
  }, [filters, token]);
  useEffect(() => {
    const timer = window.setTimeout(
      () => void load().catch(() => setMessage("Orders could not be loaded.")),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [load]);
  const open = async (id: string) => {
    const body = await adminFetch<{ order: OrderDetail }>(
      `/api/admin/orders/${id}`,
      token,
    );
    setSelected(body.order);
    setForm((current) => ({
      ...current,
      courierName: body.order.courier_name || "",
      trackingReference: body.order.tracking_reference || "",
      trackingUrl: body.order.tracking_url || "",
      revisedDispatchMinDate: body.order.revised_dispatch_min_date || "",
      revisedDispatchMaxDate: body.order.revised_dispatch_max_date || "",
      delayMessage: body.order.delay_message || "",
      internalNotes: body.order.internal_notes || "",
    }));
  };
  const advance = async () => {
    if (!selected || !nextStatus[selected.fulfilment_status]) return;
    try {
      const body = await adminFetch<{ order: OrderDetail }>(
        `/api/admin/orders/${selected.id}/fulfilment`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            ...form,
            status: nextStatus[selected.fulfilment_status],
          }),
        },
      );
      setSelected(body.order);
      setMessage("Fulfilment update saved and queued for customer email.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed.");
    }
  };
  return (
    <section>
      <header><div><p className="eyebrow">Orders</p><h1>Production & fulfilment</h1></div></header>
      <div className="admin-filters">
        <input placeholder="Order, customer, email or phone" value={filters.q}
          onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} />
        <select value={filters.payment}
          onChange={(event) => setFilters((current) => ({ ...current, payment: event.target.value }))}>
          <option value="">All payment states</option>
          {["initiated", "pending", "succeeded", "failed", "exception"].map((value) => <option key={value}>{value}</option>)}
        </select>
        <select value={filters.fulfilment}
          onChange={(event) => setFilters((current) => ({ ...current, fulfilment: event.target.value }))}>
          <option value="">All fulfilment states</option>
          {Object.keys(nextStatus).concat("delivered").map((value) => <option key={value}>{value}</option>)}
        </select>
      </div>
      {message && <p className="admin-message">{message}</p>}
      <div className="admin-split">
        <div className="admin-card">
          {orders.map((order) => (
            <button className="admin-list-row" key={order.id} onClick={() => void open(order.id)}>
              <span><strong>{order.order_number}</strong><small>{order.full_name} ú {order.email}</small></span>
              <span><b>{naira(order.total_kobo)}</b><small>Payment: {order.payment_status}</small><small>Fulfilment: {order.fulfilment_status}</small></span>
            </button>
          ))}
          {!orders.length && <p>No orders match these filters.</p>}
        </div>
        {selected && (
          <div className="admin-card admin-detail">
            <h2>{selected.order_number}</h2>
            <p><strong>Payment: {selected.payment_status}</strong><br />Fulfilment: {selected.fulfilment_status}</p>
            <p>{selected.full_name}<br />{selected.email}<br />{selected.phone}</p>
            <pre>{JSON.stringify(JSON.parse(selected.address_snapshot_json), null, 2)}</pre>
            <h3>Immutable order items</h3>
            {selected.items.map((item) => (
              <div className="admin-line" key={item.id}>
                <span>{item.title_snapshot}<small>{item.colour_snapshot} ú {item.size_snapshot} ú Qty {item.quantity}</small></span>
                <strong>{naira(item.unit_price_kobo * item.quantity)}</strong>
              </div>
            ))}
            <h3>Courier and revised dispatch</h3>
            <div className="admin-form-grid">
              {Object.entries(form).map(([key, value]) => (
                <label key={key}>{key.replace(/([A-Z])/g, " $1")}
                  <input type={key.includes("Date") ? "date" : "text"} value={value}
                    onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
                </label>
              ))}
            </div>
            <button className="button olive" disabled={!nextStatus[selected.fulfilment_status]} onClick={() => void advance()}>
              {nextStatus[selected.fulfilment_status]
                ? `Move to ${nextStatus[selected.fulfilment_status].replaceAll("_", " ")}`
                : "Fulfilment complete"}
            </button>
            <h3>Audit history</h3>
            {selected.events.map((event) => (
              <p className="admin-history" key={event.created_at + event.to_status}>
                <strong>{event.dimension}: {event.to_status}</strong><br />
                {event.customer_message || "No customer note"} ú {new Date(event.created_at).toLocaleString()}
              </p>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
