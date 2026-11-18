"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Native storefront links avoid the deployed Vinext Link runtime failure. */

import { useCallback, useEffect, useState } from "react";
import { Home, Package, ReceiptText, Settings } from "lucide-react";
import { adminFetch, type AdminApiError } from "./admin-api";
import { AdminOrdersPanel } from "./admin-orders-owner";
import { AdminProductsPanel } from "./admin-product-workspace";
import { AdminSettingsPanel } from "./admin-settings-owner";

type Overview = {
  products: Array<{ id: string; status: string; is_sample?: number }>;
  orders: Array<{
    id: string;
    order_number: string;
    full_name: string;
    order_status: string;
    fulfilment_status: string;
  }>;
  capacity: Array<{ capacity: number; reserved: number; committed: number }>;
};

export default function AdminDashboard() {
  const [tab, setTab] = useState<
    "overview" | "products" | "orders" | "settings"
  >("overview");
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [state, setState] = useState<
    "loading" | "ready" | "locked" | "disabled"
  >("loading");
  const [message, setMessage] = useState("");
  const [newProductRequest, setNewProductRequest] = useState(0);

  const load = useCallback(async (nextToken: string) => {
    setState("loading");
    try {
      const body = await adminFetch<Overview>("/api/admin/overview", nextToken);
      setOverview(body);
      setState("ready");
      setMessage("");
    } catch (error) {
      const code = (error as AdminApiError).code;
      setState(code === "admin_access_disabled" ? "disabled" : "locked");
      setMessage(
        code === "admin_access_disabled"
          ? "Admin sign-in is not available here."
          : "Please sign in with an approved owner email.",
      );
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved =
        window.sessionStorage.getItem("herliyah-admin-preview-token") || "";
      setToken(saved);
      setTokenDraft(saved);
      void load(saved);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const unlock = (event: React.FormEvent) => {
    event.preventDefault();
    window.sessionStorage.setItem("herliyah-admin-preview-token", tokenDraft);
    setToken(tokenDraft);
    void load(tokenDraft);
  };

  if (state !== "ready")
    return (
      <main className="admin-lock">
        <section>
          <span className="monogram">H</span>
          <p className="eyebrow">Owner workspace</p>
          <h1>
            {state === "loading"
              ? "Checking access."
              : "Admin access is protected."}
          </h1>
          <p>{message || "Validating this session."}</p>
          {state === "locked" && (
            <form onSubmit={unlock}>
              <label>
                Local preview token
                <input
                  type="password"
                  value={tokenDraft}
                  autoComplete="off"
                  onChange={(event) => setTokenDraft(event.target.value)}
                />
              </label>
              <button className="button dark" type="submit">
                Open local dashboard
              </button>
            </form>
          )}
          <p className="admin-help">
            The local access code is available only while testing on this
            computer.
          </p>
          <a href="/">Return to storefront</a>
        </section>
      </main>
    );

  const available = (overview?.capacity || []).reduce(
    (sum, row) =>
      sum + Number(row.capacity) - Number(row.reserved) - Number(row.committed),
    0,
  );
  const attention = (overview?.orders || []).filter(
    (order) =>
      order.order_status === "payment_exception" ||
      [
        "confirmed",
        "in_preparation",
        "ready_to_dispatch",
        "dispatched",
      ].includes(order.fulfilment_status),
  );
  const attentionReason = (order: Overview["orders"][number]) =>
    order.order_status === "payment_exception"
      ? "Payment needs review"
      : order.fulfilment_status === "ready_to_dispatch"
        ? "Ready for courier details"
        : order.fulfilment_status === "dispatched"
          ? "Waiting for delivery confirmation"
          : order.fulfilment_status === "in_preparation"
            ? "Currently being made"
            : "Production can begin";
  const addProduct = () => {
    setNewProductRequest((value) => value + 1);
    setTab("products");
  };
  const navigation = [
    { id: "overview" as const, label: "Home", icon: Home },
    { id: "products" as const, label: "Products", icon: Package },
    { id: "orders" as const, label: "Orders", icon: ReceiptText },
    { id: "settings" as const, label: "Settings", icon: Settings },
  ];

  return (
    <main className="admin-page">
      <aside className="admin-nav">
        <div className="admin-brand">
          <span className="monogram">H</span>
          <span>
            <strong>HERLIYAH</strong>
            <small>Admin</small>
          </span>
        </div>
        <nav id="admin-navigation" aria-label="Owner dashboard">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => setTab(id)}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <a href="/">View store</a>
      </aside>
      <nav className="admin-bottom-nav" aria-label="Admin pages">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <section className="admin-main">
        {tab === "overview" && (
          <>
            <header className="admin-page-heading">
              <div>
                <h1>Home</h1>
              </div>
              <button className="button dark" onClick={addProduct}>
                + Add product
              </button>
            </header>
            <div className="admin-alert">
              <strong>Preview mode. Payments are off.</strong>
            </div>
            <div className="metrics">
              <div>
                <span>Products</span>
                <strong>{overview?.products.length || 0}</strong>
              </div>
              <div>
                <span>Remaining preorder slots</span>
                <strong>{available}</strong>
                <small>Open size and colour options across all products.</small>
              </div>
              <div>
                <span>Orders needing attention</span>
                <strong>{attention.length}</strong>
                <small>Orders still being prepared or delivered.</small>
              </div>
            </div>
            <section className="admin-card overview-attention">
              <div className="card-heading">
                <h2>Orders needing attention</h2>
                <button onClick={() => setTab("orders")}>
                  View all orders
                </button>
              </div>
              {attention.slice(0, 5).map((order) => (
                <button
                  className="admin-list-row"
                  key={order.id}
                  onClick={() => setTab("orders")}
                >
                  <span>
                    <strong>{order.order_number}</strong>
                    <small>{order.full_name}</small>
                  </span>
                  <span>
                    <small>{attentionReason(order)}</small>
                  </span>
                </button>
              ))}
              {!attention.length && <p>No orders need attention right now.</p>}
            </section>
          </>
        )}
        {tab === "products" && (
          <AdminProductsPanel
            token={token}
            newProductRequest={newProductRequest}
          />
        )}
        {tab === "orders" && <AdminOrdersPanel token={token} />}
        {tab === "settings" && <AdminSettingsPanel token={token} />}
      </section>
    </main>
  );
}
