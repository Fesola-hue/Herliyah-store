"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch, naira } from "./admin-api";

type JsonObject = Record<string, unknown>;
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
  cover_url?: string | null;
};
type GuideRow = {
  size: string;
  bust: string;
  waist: string;
  hips: string;
  [key: string]: string;
};
type Section = "contact" | "size" | "policies" | "delivery" | "featured";

const objectValue = (value: unknown): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
const stringValue = (value: unknown) =>
  typeof value === "string" ? value : "";
const contactFields = [
  ["email", "Email"],
  ["phone", "Phone"],
  ["whatsapp", "WhatsApp"],
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["tiktok", "TikTok"],
] as const;
const policyFields = [
  ["shipping", "Delivery policy"],
  ["returns", "Returns policy"],
  ["exchanges", "Exchange policy"],
  ["privacy", "Privacy policy"],
  ["terms", "Terms and conditions"],
] as const;

function rowsFromGuide(raw: unknown) {
  const guide = objectValue(raw);
  const source = Array.isArray(guide.rows)
    ? guide.rows
    : Array.isArray(guide.sizes)
      ? guide.sizes
      : Array.isArray(guide.chart)
        ? guide.chart
        : [];
  return source.map((item) => {
    const row = objectValue(item);
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, stringValue(value)]),
    ) as GuideRow;
  });
}

function guideRowsKey(raw: unknown) {
  const guide = objectValue(raw);
  return Array.isArray(guide.rows)
    ? "rows"
    : Array.isArray(guide.sizes)
      ? "sizes"
      : Array.isArray(guide.chart)
        ? "chart"
        : "rows";
}

const emptyZone = () => ({
  id: "new",
  name: "",
  feeNaira: "",
  transitMinDays: 1,
  transitMaxDays: 3,
  transitDayBasis: "business",
  active: true,
});

export function AdminSettingsPanel({ token }: { token: string }) {
  const [data, setData] = useState<SettingsBody | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [active, setActive] = useState<Section>("contact");
  const [contact, setContact] = useState<JsonObject>({});
  const [guideOriginal, setGuideOriginal] = useState<JsonObject>({});
  const [guideRows, setGuideRows] = useState<GuideRow[]>([]);
  const [guideUnit, setGuideUnit] = useState("in");
  const [policies, setPolicies] = useState<JsonObject>({});
  const [featured, setFeatured] = useState<string[]>([]);
  const [zone, setZone] = useState(emptyZone());
  const [editingZone, setEditingZone] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [settings, catalog] = await Promise.all([
      adminFetch<SettingsBody>("/api/admin/settings", token),
      adminFetch<{ products: Product[] }>("/api/admin/products", token),
    ]);
    setData(settings);
    setProducts(catalog.products);
    setContact(objectValue(settings.settings.contact));
    const rawGuide = objectValue(settings.settings.size_guide);
    setGuideOriginal(rawGuide);
    setGuideRows(rowsFromGuide(rawGuide));
    setGuideUnit(stringValue(rawGuide.unit) || "in");
    setPolicies(objectValue(settings.settings.policies));
    setFeatured(settings.featuredProducts.map((product) => product.id));
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        void load().catch(() =>
          setMessage("Store settings could not be loaded."),
        ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [load]);

  const saveSetting = async (key: string, value: unknown, success: string) => {
    setMessage("Saving...");
    try {
      await adminFetch(`/api/admin/settings/${key}`, token, {
        method: "PUT",
        body: JSON.stringify({ value }),
      });
      setMessage(success);
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The setting could not be saved.",
      );
    }
  };

  const saveGuide = () => {
    const rowsKey = guideRowsKey(guideOriginal);
    void saveSetting(
      "size_guide",
      { ...guideOriginal, unit: guideUnit, [rowsKey]: guideRows },
      "Size guide saved.",
    );
  };

  const saveZone = async () => {
    const fee = Number(zone.feeNaira);
    if (!zone.name.trim() || !Number.isFinite(fee) || fee < 0)
      return setMessage("Add a delivery area and a valid delivery fee.");
    setMessage("Saving...");
    try {
      await adminFetch(`/api/admin/delivery-zones/${zone.id}`, token, {
        method: "PUT",
        body: JSON.stringify({
          id: zone.id,
          name: zone.name,
          feeKobo: Math.round(fee * 100),
          transitMinDays: Number(zone.transitMinDays),
          transitMaxDays: Number(zone.transitMaxDays),
          transitDayBasis: zone.transitDayBasis,
          active: zone.active,
        }),
      });
      setMessage(
        zone.id === "new" ? "Delivery area added." : "Delivery area updated.",
      );
      setZone(emptyZone());
      setEditingZone(false);
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The delivery area could not be saved.",
      );
    }
  };

  const eligible = products.filter(
    (product) => product.status === "published" && !product.is_sample,
  );
  const ineligible = products.filter(
    (product) => product.status !== "published" || product.is_sample,
  );
  const orderedFeatured = useMemo(
    () =>
      featured
        .map((id) => eligible.find((product) => product.id === id))
        .filter(Boolean) as Product[],
    [eligible, featured],
  );
  const move = (id: string, direction: number) =>
    setFeatured((current) => {
      const index = current.indexOf(id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length)
        return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });

  return (
    <section className="settings-workspace">
      <header className="admin-page-heading">
        <h1>Settings</h1>
      </header>
      <nav className="settings-tabs" aria-label="Store setting sections">
        {(
          [
            ["contact", "Contact"],
            ["size", "Size guide"],
            ["policies", "Policies"],
            ["delivery", "Delivery"],
            ["featured", "Featured products"],
          ] as Array<[Section, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            className={active === id ? "active" : ""}
            onClick={() => setActive(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <label className="settings-mobile-select">
        Settings section
        <select
          value={active}
          onChange={(event) => setActive(event.target.value as Section)}
        >
          <option value="contact">Contact</option>
          <option value="size">Size guide</option>
          <option value="policies">Policies</option>
          <option value="delivery">Delivery</option>
          <option value="featured">Featured products</option>
        </select>
      </label>
      {message && (
        <p className="admin-message" role="status">
          {message}
        </p>
      )}

      {active === "contact" && (
        <section className="admin-card settings-section">
          <h2>Customer contact details</h2>
          <p>These details can appear in customer help and policy areas.</p>
          <div className="admin-form-grid">
            {contactFields.map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  value={stringValue(contact[key])}
                  onChange={(event) =>
                    setContact((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <button
            className="button dark"
            onClick={() =>
              void saveSetting("contact", contact, "Contact details saved.")
            }
          >
            Save contact details
          </button>
        </section>
      )}

      {active === "size" && (
        <section className="admin-card settings-section">
          <h2>Customer size guide</h2>
          <p>
            This measurement chart is separate from each product&apos;s XS–XL
            choices. Enter only approved brand measurements; no conversions are
            invented.
          </p>
          <label className="compact-field">
            Measurement unit
            <select
              value={guideUnit}
              onChange={(event) => setGuideUnit(event.target.value)}
            >
              <option value="in">Inches</option>
              <option value="cm">Centimetres</option>
            </select>
          </label>
          <div className="size-guide-editor">
            {guideRows.map((row, index) => (
              <div className="size-guide-row" key={`${row.size}-${index}`}>
                {(
                  [
                    ["size", "Size"],
                    ["bust", "Bust"],
                    ["waist", "Waist"],
                    ["hips", "Hips"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      value={row[key] || ""}
                      onChange={(event) =>
                        setGuideRows((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, [key]: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
                <button
                  onClick={() =>
                    setGuideRows((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  Remove row
                </button>
              </div>
            ))}
            {!guideRows.length && (
              <p>
                No chart rows are saved yet. Add a row when the approved chart
                is ready.
              </p>
            )}
          </div>
          <div className="admin-actions">
            <button
              onClick={() =>
                setGuideRows((current) => [
                  ...current,
                  { size: "", bust: "", waist: "", hips: "" },
                ])
              }
            >
              Add size row
            </button>
            <button className="button dark" onClick={saveGuide}>
              Save size guide
            </button>
          </div>
          <div className="size-guide-preview">
            <h3>Customer preview</h3>
            {guideRows.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Size</th>
                    <th>Bust</th>
                    <th>Waist</th>
                    <th>Hips</th>
                  </tr>
                </thead>
                <tbody>
                  {guideRows.map((row, index) => (
                    <tr key={index}>
                      <td>{row.size}</td>
                      <td>
                        {row.bust} {guideUnit}
                      </td>
                      <td>
                        {row.waist} {guideUnit}
                      </td>
                      <td>
                        {row.hips} {guideUnit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>The chart will appear here.</p>
            )}
          </div>
        </section>
      )}

      {active === "policies" && (
        <section className="admin-card settings-section">
          <h2>Customer policies</h2>
          <p>
            Use clear, approved wording. Each policy is saved without changing
            unshown settings.
          </p>
          {policyFields.map(([key, label]) => (
            <label key={key}>
              {label}
              <textarea
                rows={5}
                value={stringValue(policies[key])}
                onChange={(event) =>
                  setPolicies((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
          <button
            className="button dark"
            onClick={() =>
              void saveSetting("policies", policies, "Policies saved.")
            }
          >
            Save policies
          </button>
          <hr />
          <h3>Orders with different preparation times</h3>
          <label>
            How should these orders ship?
            <select
              value={
                stringValue(
                  objectValue(data?.settings.mixed_basket_policy).mode,
                ) || "ship_together"
              }
              onChange={(event) =>
                void saveSetting(
                  "mixed_basket_policy",
                  {
                    ...objectValue(data?.settings.mixed_basket_policy),
                    mode: event.target.value,
                  },
                  "Mixed-basket delivery setting saved.",
                )
              }
            >
              <option value="ship_together">
                Ship together when the slowest style is ready
              </option>
              <option value="split_disabled">
                Do not allow mixed preparation windows
              </option>
            </select>
          </label>
        </section>
      )}

      {active === "delivery" && (
        <section className="admin-card settings-section">
          <div className="card-heading">
            <div>
              <h2>Delivery areas</h2>
              <p>
                Delivery time starts after the clothing is ready and dispatched.
              </p>
            </div>
            <button
              onClick={() => {
                setZone(emptyZone());
                setEditingZone(true);
              }}
            >
              + Add delivery area
            </button>
          </div>
          {(data?.deliveryZones || []).map((item) => (
            <button
              className="admin-list-row"
              key={item.id}
              onClick={() => {
                setZone({
                  id: item.id,
                  name: item.name,
                  feeNaira: String(item.fee_kobo / 100),
                  transitMinDays: item.transit_min_days,
                  transitMaxDays: item.transit_max_days,
                  transitDayBasis: item.transit_day_basis,
                  active: Boolean(item.active),
                });
                setEditingZone(true);
              }}
            >
              <span>
                <strong>{item.name}</strong>
                <small>
                  {naira(item.fee_kobo)} · {item.transit_min_days}–
                  {item.transit_max_days} {item.transit_day_basis} days after
                  dispatch
                </small>
              </span>
              <span className="text-link">Edit</span>
            </button>
          ))}
          {editingZone && (
            <div className="delivery-zone-editor">
              <h3>
                {zone.id === "new" ? "Add delivery area" : `Edit ${zone.name}`}
              </h3>
              <div className="admin-form-grid">
                <label>
                  Delivery area
                  <input
                    value={zone.name}
                    onChange={(event) =>
                      setZone((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Delivery fee (₦)
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={zone.feeNaira}
                    onChange={(event) =>
                      setZone((current) => ({
                        ...current,
                        feeNaira: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Minimum delivery days
                  <input
                    type="number"
                    min="0"
                    value={zone.transitMinDays}
                    onChange={(event) =>
                      setZone((current) => ({
                        ...current,
                        transitMinDays: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  Maximum delivery days
                  <input
                    type="number"
                    min="0"
                    value={zone.transitMaxDays}
                    onChange={(event) =>
                      setZone((current) => ({
                        ...current,
                        transitMaxDays: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  How days are counted
                  <select
                    value={zone.transitDayBasis}
                    onChange={(event) =>
                      setZone((current) => ({
                        ...current,
                        transitDayBasis: event.target.value,
                      }))
                    }
                  >
                    <option value="business">Business days</option>
                    <option value="calendar">Calendar days</option>
                  </select>
                </label>
                <label className="owner-checkbox">
                  <input
                    type="checkbox"
                    checked={zone.active}
                    onChange={(event) =>
                      setZone((current) => ({
                        ...current,
                        active: event.target.checked,
                      }))
                    }
                  />
                  Allow orders to this delivery area
                </label>
              </div>
              <div className="admin-actions">
                <button className="button dark" onClick={() => void saveZone()}>
                  {zone.id === "new"
                    ? "Add delivery area"
                    : "Save delivery area"}
                </button>
                <button onClick={() => setEditingZone(false)}>Cancel</button>
              </div>
            </div>
          )}
        </section>
      )}

      {active === "featured" && (
        <section className="admin-card settings-section">
          <h2>Homepage featured products</h2>
          <p>
            These products appear in the featured collection on the storefront.
            Only published, non-sample products are eligible.
          </p>
          {eligible.map((product) => {
            const selected = featured.includes(product.id);
            return (
              <div className="featured-product-row" key={product.id}>
                {product.cover_url ? (
                  <img src={product.cover_url} alt="" />
                ) : (
                  <span className="product-thumb-placeholder">H</span>
                )}
                <label>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(event) =>
                      setFeatured((current) =>
                        event.target.checked
                          ? [...current, product.id]
                          : current.filter((id) => id !== product.id),
                      )
                    }
                  />
                  {product.title}
                </label>
                {selected && (
                  <span className="featured-order-actions">
                    <button
                      disabled={featured.indexOf(product.id) === 0}
                      onClick={() => move(product.id, -1)}
                    >
                      Move up
                    </button>
                    <button
                      disabled={
                        featured.indexOf(product.id) === featured.length - 1
                      }
                      onClick={() => move(product.id, 1)}
                    >
                      Move down
                    </button>
                  </span>
                )}
              </div>
            );
          })}
          {!eligible.length && <p>No products are eligible yet.</p>}
          {!!ineligible.length && (
            <details>
              <summary>
                Why other products are not shown ({ineligible.length})
              </summary>
              {ineligible.map((product) => (
                <p key={product.id}>
                  <strong>{product.title}</strong>.{" "}
                  {product.is_sample
                    ? "Sample products are staging-only"
                    : product.status === "archived"
                      ? "Archived"
                      : "Not published"}
                </p>
              ))}
            </details>
          )}
          <p>
            <strong>Current homepage order:</strong>{" "}
            {orderedFeatured.map((product) => product.title).join(" → ") ||
              "No featured products selected"}
          </p>
          <div className="admin-actions">
            <button
              className="button dark"
              onClick={async () => {
                setMessage("Saving...");
                try {
                  await adminFetch("/api/admin/featured-products", token, {
                    method: "PUT",
                    body: JSON.stringify({ productIds: featured }),
                  });
                  setMessage("Homepage featured products saved.");
                  await load();
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "Featured products could not be saved.",
                  );
                }
              }}
            >
              Save homepage order
            </button>
            <a className="button" href="/" target="_blank">
              Preview homepage
            </a>
          </div>
        </section>
      )}
    </section>
  );
}
