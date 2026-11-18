"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "./admin-api";

type SettingsBody = {
  settings: Record<string, unknown>;
  deliveryZones: Array<{
    id: string;
    name: string;
    fee_kobo: number;
    transit_min_days: number;
    transit_max_days: number;
    transit_day_basis: string;
    active: number;
  }>;
  featuredProducts: Array<{ id: string }>;
};
type Product = {
  id: string;
  title: string;
  status: string;
  is_sample: number;
};

export function AdminSettingsPanel({ token }: { token: string }) {
  const [data, setData] = useState<SettingsBody | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [editors, setEditors] = useState<Record<string, string>>({});
  const [featured, setFeatured] = useState<string[]>([]);
  const [zone, setZone] = useState({
    id: "new",
    name: "",
    feeKobo: 0,
    transitMinDays: 1,
    transitMaxDays: 3,
    transitDayBasis: "business",
    active: true,
  });
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const [settings, catalog] = await Promise.all([
      adminFetch<SettingsBody>("/api/admin/settings", token),
      adminFetch<{ products: Product[] }>("/api/admin/products", token),
    ]);
    setData(settings);
    setProducts(catalog.products);
    setFeatured(settings.featuredProducts.map((product) => product.id));
    setEditors(
      Object.fromEntries(
        ["contact", "size_guide", "policies"].map((key) => [
          key,
          JSON.stringify(settings.settings[key] || {}, null, 2),
        ]),
      ),
    );
  }, [token]);
  useEffect(() => {
    const timer = window.setTimeout(
      () => void load().catch(() => setMessage("Settings could not be loaded.")),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [load]);
  const saveJson = async (key: string) => {
    try {
      await adminFetch(`/api/admin/settings/${key}`, token, {
        method: "PUT",
        body: JSON.stringify({ value: JSON.parse(editors[key] || "{}") }),
      });
      setMessage(`${key.replaceAll("_", " ")} saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    }
  };
  const savePolicy = async (value: string) => {
    await adminFetch("/api/admin/settings/mixed_basket_policy", token, {
      method: "PUT",
      body: JSON.stringify({ value: { mode: value } }),
    });
    setMessage("Mixed-basket policy saved.");
  };
  const saveZone = async () => {
    try {
      await adminFetch(`/api/admin/delivery-zones/${zone.id}`, token, {
        method: "PUT",
        body: JSON.stringify(zone),
      });
      setMessage("Delivery zone saved.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Zone save failed.");
    }
  };
  const saveFeatured = async () => {
    await adminFetch("/api/admin/featured-products", token, {
      method: "PUT",
      body: JSON.stringify({ productIds: featured }),
    });
    setMessage("Homepage featured order saved.");
  };
  const move = (id: string, direction: number) => {
    setFeatured((current) => {
      const index = current.indexOf(id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };
  return (
    <section>
      <header><div><p className="eyebrow">Settings</p><h1>Launch configuration</h1></div></header>
      {message && <p className="admin-message">{message}</p>}
      <div className="admin-settings-grid">
        {["contact", "size_guide", "policies"].map((key) => (
          <section className="admin-card" key={key}>
            <h2>{key.replaceAll("_", " ")}</h2>
            <p>Structured JSON kept versionable and reviewed by the owner.</p>
            <textarea rows={10} value={editors[key] || ""}
              onChange={(event) => setEditors((current) => ({ ...current, [key]: event.target.value }))} />
            <button className="button dark" onClick={() => void saveJson(key)}>Save {key.replaceAll("_", " ")}</button>
          </section>
        ))}
        <section className="admin-card">
          <h2>Mixed-basket shipping</h2>
          <label>Policy
            <select
              defaultValue={String((data?.settings.mixed_basket_policy as { mode?: string })?.mode || "ship_together")}
              onChange={(event) => void savePolicy(event.target.value)}>
              <option value="ship_together">Ship together when the slowest style is ready</option>
              <option value="split_disabled">Do not allow mixed preparation windows</option>
            </select>
          </label>
          <p>Preparation and courier transit remain separate in checkout and tracking.</p>
        </section>
        <section className="admin-card">
          <h2>Delivery zones</h2>
          {(data?.deliveryZones || []).map((item) => (
            <button className="admin-list-row" key={item.id}
              onClick={() => setZone({
                id: item.id,
                name: item.name,
                feeKobo: item.fee_kobo,
                transitMinDays: item.transit_min_days,
                transitMaxDays: item.transit_max_days,
                transitDayBasis: item.transit_day_basis,
                active: Boolean(item.active),
              })}>
              <span><strong>{item.name}</strong><small>?{item.fee_kobo / 100} ú {item.transit_min_days}-{item.transit_max_days} {item.transit_day_basis} days after dispatch</small></span>
            </button>
          ))}
          <div className="admin-form-grid">
            {(["name", "feeKobo", "transitMinDays", "transitMaxDays"] as const).map((key) => (
              <label key={key}>{key.replace(/([A-Z])/g, " $1")}
                <input type={key === "name" ? "text" : "number"} value={zone[key]}
                  onChange={(event) => setZone((current) => ({
                    ...current,
                    [key]: key === "name" ? event.target.value : Number(event.target.value),
                  }))} />
              </label>
            ))}
            <label>Day basis
              <select value={zone.transitDayBasis}
                onChange={(event) => setZone((current) => ({ ...current, transitDayBasis: event.target.value }))}>
                <option value="business">Business days</option><option value="calendar">Calendar days</option>
              </select>
            </label>
            <label><input type="checkbox" checked={zone.active}
              onChange={(event) => setZone((current) => ({ ...current, active: event.target.checked }))} /> Checkout enabled</label>
          </div>
          <button className="button dark" onClick={() => void saveZone()}>Save delivery zone</button>
        </section>
        <section className="admin-card">
          <h2>Homepage featured products</h2>
          {products.filter((product) => product.status === "published" && !product.is_sample).map((product) => {
            const index = featured.indexOf(product.id);
            return (
              <div className="admin-line" key={product.id}>
                <label><input type="checkbox" checked={index >= 0}
                  onChange={(event) => setFeatured((current) =>
                    event.target.checked ? [...current, product.id] : current.filter((id) => id !== product.id)
                  )} /> {product.title}</label>
                {index >= 0 && <span><button onClick={() => move(product.id, -1)}></button><button onClick={() => move(product.id, 1)}></button></span>}
              </div>
            );
          })}
          <button className="button olive" onClick={() => void saveFeatured()}>Save homepage order</button>
        </section>
      </div>
    </section>
  );
}
