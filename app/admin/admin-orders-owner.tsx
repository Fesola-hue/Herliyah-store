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
  payment_status?: string;
  payment_provider?: string;
  payment_environment?: string;
  order_status: string;
  fulfilment_status: string;
  created_at: string;
  dispatch_min_date?: string;
  dispatch_max_date?: string;
  revised_dispatch_min_date?: string;
  revised_dispatch_max_date?: string;
};
type OrderDetail = OrderSummary & {
  address_snapshot_json: string;
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
  payments: Array<{
    status: string;
    provider: string;
    environment: string;
    reference?: string;
    created_at: string;
  }>;
  events: Array<{
    dimension: string;
    to_status: string;
    customer_message?: string;
    created_at: string;
  }>;
};

const paymentLabels: Record<string, string> = {
  initiated: "Unpaid",
  pending: "Payment pending",
  succeeded: "Paid",
  failed: "Payment failed",
  exception: "Payment needs review",
};
const fulfilmentLabels: Record<string, string> = {
  awaiting_payment: "Waiting for payment",
  awaiting_production: "Waiting to be made",
  confirmed: "Confirmed",
  in_preparation: "In preparation",
  ready_to_dispatch: "Ready to dispatch",
  dispatched: "Dispatched",
  delivered: "Delivered",
};
const nextStatus: Record<string, string> = {
  awaiting_production: "confirmed",
  confirmed: "in_preparation",
  in_preparation: "ready_to_dispatch",
  ready_to_dispatch: "dispatched",
  dispatched: "delivered",
};
const label = (map: Record<string, string>, value?: string) =>
  map[value || ""] || (value ? value.replaceAll("_", " ") : "Not recorded");
const isTest = (
  order: Pick<OrderSummary, "payment_environment" | "payment_provider">,
) =>
  order.payment_environment === "test" ||
  order.payment_provider === "simulated";
const shortDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(value))
    : "Not set";
const dispatchText = (order: OrderSummary) => {
  const min = order.revised_dispatch_min_date || order.dispatch_min_date;
  const max = order.revised_dispatch_max_date || order.dispatch_max_date;
  if (!min && !max) return "No dispatch estimate";
  return min === max || !max
    ? shortDate(min || max)
    : `${shortDate(min)} to ${shortDate(max)}`;
};

export function AdminOrdersPanel({ token }: { token: string }) {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [selected, setSelected] = useState<OrderDetail | null>(null);
  const [filters, setFilters] = useState({
    q: "",
    payment: "",
    fulfilment: "",
  });
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
    setOrders(
      (
        await adminFetch<{ orders: OrderSummary[] }>(
          `/api/admin/orders?${params}`,
          token,
        )
      ).orders,
    );
  }, [filters, token]);
  useEffect(() => {
    const timer = window.setTimeout(
      () => void load().catch(() => setMessage("Orders could not be loaded.")),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [load]);

  const open = async (id: string) => {
    const order = (
      await adminFetch<{ order: OrderDetail }>(`/api/admin/orders/${id}`, token)
    ).order;
    setSelected(order);
    setForm({
      customerMessage: "",
      courierName: order.courier_name || "",
      trackingReference: order.tracking_reference || "",
      trackingUrl: order.tracking_url || "",
      revisedDispatchMinDate: order.revised_dispatch_min_date || "",
      revisedDispatchMaxDate: order.revised_dispatch_max_date || "",
      delayMessage: order.delay_message || "",
      internalNotes: order.internal_notes || "",
    });
  };

  const advance = async () => {
    if (!selected || !nextStatus[selected.fulfilment_status]) return;
    const timingChanged =
      form.revisedDispatchMinDate !==
        (selected.revised_dispatch_min_date || "") ||
      form.revisedDispatchMaxDate !==
        (selected.revised_dispatch_max_date || "");
    if (timingChanged && !form.delayMessage.trim())
      return setMessage(
        "Explain the delay or revised dispatch estimate before saving.",
      );
    setMessage("Saving...");
    try {
      const order = (
        await adminFetch<{ order: OrderDetail }>(
          `/api/admin/orders/${selected.id}/fulfilment`,
          token,
          {
            method: "POST",
            body: JSON.stringify({
              ...form,
              status: nextStatus[selected.fulfilment_status],
            }),
          },
        )
      ).order;
      setSelected(order);
      setMessage("Order update saved. Payment status was not changed.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The order could not be updated.",
      );
    }
  };

  if (selected) {
    let address: Record<string, unknown> = {};
    try {
      address = JSON.parse(selected.address_snapshot_json || "{}");
    } catch {
      address = {};
    }
    const next = nextStatus[selected.fulfilment_status];
    const latestPayment = selected.payments?.[0];
    const testOrder = isTest({
      payment_environment:
        latestPayment?.environment || selected.payment_environment,
      payment_provider: latestPayment?.provider || selected.payment_provider,
    });
    return (
      <section className="order-detail-view">
        <button className="back-link" onClick={() => setSelected(null)}>
          ← Back to orders
        </button>
        {message && (
          <p className="admin-message" role="status">
            {message}
          </p>
        )}
        <header>
          <div>
            <p className="eyebrow">Order</p>
            <h1>{selected.order_number}</h1>
          </div>
          {testOrder && (
            <span className="test-badge">Test order · no real payment</span>
          )}
        </header>
        <div className="order-detail-grid">
          <section className="admin-card">
            <h2>Order summary</h2>
            <dl className="order-facts">
              <div>
                <dt>Customer</dt>
                <dd>
                  {selected.full_name}
                  <br />
                  {selected.email}
                  <br />
                  {selected.phone}
                </dd>
              </div>
              <div>
                <dt>Order date</dt>
                <dd>{shortDate(selected.created_at)}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{naira(selected.total_kobo)}</dd>
              </div>
              <div>
                <dt>Payment</dt>
                <dd>
                  {label(paymentLabels, selected.payment_status)}
                  {testOrder ? " (test only)" : ""}
                </dd>
              </div>
              <div>
                <dt>Production and delivery</dt>
                <dd>{label(fulfilmentLabels, selected.fulfilment_status)}</dd>
              </div>
              <div>
                <dt>Estimate</dt>
                <dd>{dispatchText(selected)}</dd>
              </div>
            </dl>
          </section>
          <section className="admin-card">
            <h2>Purchased items</h2>
            {selected.items.map((item) => (
              <div className="order-item-row" key={item.id}>
                <span>
                  <strong>{item.title_snapshot}</strong>
                  <small>
                    {item.colour_snapshot} · {item.size_snapshot} · Quantity{" "}
                    {item.quantity}
                  </small>
                </span>
                <strong>{naira(item.unit_price_kobo * item.quantity)}</strong>
              </div>
            ))}
          </section>
          <section className="admin-card">
            <h2>Delivery details</h2>
            {Object.entries(address).map(([key, value]) => (
              <p key={key}>
                <strong>{key.replaceAll("_", " ")}</strong>
                <br />
                {String(value)}
              </p>
            ))}
          </section>
          <section className="admin-card fulfilment-card">
            <h2>Next action</h2>
            <p>
              Payment and fulfilment are separate. This action never marks a
              payment as received.
            </p>
            {selected.payment_status !== "succeeded" && (
              <p className="admin-warning">
                Fulfilment cannot move forward until the payment provider
                verifies payment.
              </p>
            )}
            {next && (
              <>
                {next === "dispatched" && (
                  <div className="admin-form-grid">
                    <label>
                      Courier name
                      <input
                        value={form.courierName}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            courierName: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Tracking reference
                      <input
                        value={form.trackingReference}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            trackingReference: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Tracking link (optional)
                      <input
                        value={form.trackingUrl}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            trackingUrl: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                )}
                <details>
                  <summary>Revise the dispatch estimate</summary>
                  <div className="admin-form-grid">
                    <label>
                      Earliest dispatch
                      <input
                        type="date"
                        value={form.revisedDispatchMinDate}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            revisedDispatchMinDate: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Latest dispatch
                      <input
                        type="date"
                        value={form.revisedDispatchMaxDate}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            revisedDispatchMaxDate: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Reason for the change
                      <textarea
                        rows={2}
                        value={form.delayMessage}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            delayMessage: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                </details>
                <label>
                  Message for the customer (optional)
                  <textarea
                    rows={2}
                    value={form.customerMessage}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        customerMessage: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Private owner notes (optional)
                  <textarea
                    rows={2}
                    value={form.internalNotes}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        internalNotes: event.target.value,
                      }))
                    }
                  />
                </label>
                <button
                  className="button olive"
                  disabled={selected.payment_status !== "succeeded"}
                  onClick={() => void advance()}
                >
                  Mark as {label(fulfilmentLabels, next)}
                </button>
              </>
            )}
            {!next && (
              <p>
                This order is complete. No further fulfilment action is
                available.
              </p>
            )}
          </section>
          <section className="admin-card">
            <h2>History</h2>
            {selected.events.map((event) => (
              <div
                className="admin-history"
                key={`${event.created_at}-${event.to_status}`}
              >
                <strong>
                  {label(
                    event.dimension === "fulfilment"
                      ? fulfilmentLabels
                      : paymentLabels,
                    event.to_status,
                  )}
                </strong>
                <span>{event.customer_message || "Routine update"}</span>
                <small>{new Date(event.created_at).toLocaleString()}</small>
              </div>
            ))}
          </section>
        </div>
      </section>
    );
  }

  return (
    <section>
      <header className="admin-page-heading">
        <h1>Orders</h1>
      </header>
      <div className="admin-filters order-filters">
        <input
          aria-label="Search orders"
          placeholder="Search order, customer, email or phone"
          value={filters.q}
          onChange={(event) =>
            setFilters((current) => ({ ...current, q: event.target.value }))
          }
        />
        <details>
          <summary>Filters</summary>
          <div>
            <label>
              Payment
              <select
                value={filters.payment}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    payment: event.target.value,
                  }))
                }
              >
                <option value="">All payment states</option>
                {Object.entries(paymentLabels).map(([value, text]) => (
                  <option value={value} key={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Production and delivery
              <select
                value={filters.fulfilment}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    fulfilment: event.target.value,
                  }))
                }
              >
                <option value="">All statuses</option>
                {Object.entries(fulfilmentLabels).map(([value, text]) => (
                  <option value={value} key={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>
      </div>
      {message && (
        <p className="admin-message" role="status">
          {message}
        </p>
      )}
      <div className="admin-card order-list">
        {orders.map((order) => (
          <article className="order-list-row" key={order.id}>
            <div className="order-row-heading">
              <strong>{order.order_number}</strong>
              {isTest(order) && <span className="test-badge">Test order</span>}
            </div>
            <p>
              {order.full_name}
              <br />
              <small>{shortDate(order.created_at)}</small>
            </p>
            <dl>
              <div>
                <dt>Total</dt>
                <dd>{naira(order.total_kobo)}</dd>
              </div>
              <div>
                <dt>Payment</dt>
                <dd>
                  {label(paymentLabels, order.payment_status)}
                  {isTest(order) ? " · test only" : ""}
                </dd>
              </div>
              <div>
                <dt>Production and delivery</dt>
                <dd>{label(fulfilmentLabels, order.fulfilment_status)}</dd>
              </div>
              <div>
                <dt>Dispatch estimate</dt>
                <dd>{dispatchText(order)}</dd>
              </div>
            </dl>
            <button className="button" onClick={() => void open(order.id)}>
              View order
            </button>
          </article>
        ))}
        {!orders.length && <p>No orders match these filters.</p>}
      </div>
    </section>
  );
}
