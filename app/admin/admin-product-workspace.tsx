"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminFetch, naira, type AdminApiError } from "./admin-api";

type ProductSummary = {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published" | "archived";
  price_kobo: number;
  variant_count: number;
  image_count: number;
  available_capacity: number;
  is_sample: number;
  cover_url?: string | null;
};
type ProductImage = {
  id: string;
  url: string;
  alt_text: string;
  colour?: string;
  is_cover: number;
};
type Variant = {
  id?: string;
  sku: string;
  size: string;
  colour: string;
  capacity: number;
  reserved_quantity?: number;
  committed_quantity?: number;
  preorder_open: number;
};
type ProductDetail = ProductSummary & {
  description: string;
  category: string;
  care_instructions: string;
  measurements_json: string;
  size_guide_key: string;
  preparation_min_days: number;
  preparation_max_days: number;
  preparation_day_basis: "business" | "calendar";
  specific_dispatch_date?: string;
  images: ProductImage[];
  variants: Variant[];
};
type MeasurementUnit = "cm" | "in";

const standardMeasurements = [
  ["bust", "Bust"],
  ["waist", "Waist"],
  ["hips", "Hips"],
  ["garmentLength", "Garment length"],
  ["sleeveLength", "Sleeve length"],
  ["inseam", "Inside leg / inseam"],
] as const;
const standardKeys = new Set(standardMeasurements.map(([key]) => key));

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const skuPart = (value: string, fallback: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
const makeSku = (
  product: Pick<ProductDetail, "slug">,
  colour: string,
  size: string,
  index: number,
) =>
  `HLY-${skuPart(product.slug, "STYLE")}-${skuPart(colour, "COLOUR")}-${size}-${index + 1}`;

function parseMeasurements(raw: string) {
  let source: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      source = parsed as Record<string, unknown>;
  } catch {
    source = {};
  }
  let unit: MeasurementUnit =
    source.unit === "in" || source.unit === "inches" ? "in" : "cm";
  const values: Record<string, string> = {};
  Object.entries(source).forEach(([key, rawValue]) => {
    if (key === "unit" || key === "_unit") return;
    let value =
      typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue);
    const match = value.trim().match(/^(.+?)\s*(cm|in|inches)$/i);
    if (match) {
      value = match[1].trim();
      if (!source.unit && !source._unit)
        unit = match[2].toLowerCase() === "cm" ? "cm" : "in";
    }
    values[key] = value;
  });
  return { unit, values };
}

function measurementJson(
  unit: MeasurementUnit,
  values: Record<string, string>,
) {
  const kept = Object.fromEntries(
    Object.entries(values).filter(([, value]) => value.trim()),
  );
  return JSON.stringify({ unit, ...kept });
}

function friendlyError(error: unknown) {
  const api = error as AdminApiError;
  const details = api?.details as { errors?: string[] } | undefined;
  if (details?.errors?.length) return details.errors.join(" • ");
  const messages: Record<string, string> = {
    capacity_reason_required:
      "Please explain why the maximum accepted orders are changing.",
    capacity_below_allocated:
      "This maximum is below orders already reserved or confirmed.",
    invalid_variants:
      "Check that every size has a colour, a valid maximum and a unique SKU.",
    invalid_images: "Every photo needs alt text and exactly one cover photo.",
    one_cover_required: "Choose exactly one cover photo.",
    invalid_product: "Check the product details and dispatch timing.",
  };
  return (
    messages[api?.code] || api?.message || "The change could not be saved."
  );
}

export function AdminProductsPanel({
  token,
  newProductRequest = 0,
}: {
  token: string;
  newProductRequest?: number;
}) {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [savedProduct, setSavedProduct] = useState<ProductDetail | null>(null);
  const [capacityReason, setCapacityReason] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const handledCreateRequest = useRef(0);

  const adopt = useCallback((next: ProductDetail) => {
    setProduct(next);
    setSavedProduct(next);
    setSlugEdited(false);
  }, []);
  const load = useCallback(async () => {
    const body = await adminFetch<{ products: ProductSummary[] }>(
      "/api/admin/products",
      token,
    );
    setProducts(body.products);
  }, [token]);
  const fetchProduct = useCallback(
    async (id: string) => {
      const body = await adminFetch<{ product: ProductDetail }>(
        `/api/admin/products/${id}`,
        token,
      );
      return body.product;
    },
    [token],
  );
  const open = async (id: string) => {
    if (
      product &&
      savedProduct &&
      JSON.stringify(product) !== JSON.stringify(savedProduct) &&
      !window.confirm("Discard the unsaved changes to this product?")
    )
      return;
    adopt(await fetchProduct(id));
    setCapacityReason("");
    setPreview(false);
    setMessage("");
  };
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        void load().catch(() => setMessage("Products could not be loaded.")),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [load]);

  const dirty = useMemo(
    () =>
      Boolean(
        product &&
          savedProduct &&
          JSON.stringify(product) !== JSON.stringify(savedProduct),
      ),
    [product, savedProduct],
  );
  const capacityChanged = useMemo(() => {
    if (!product || !savedProduct) return false;
    const savedById = new Map(
      savedProduct.variants
        .filter((variant) => variant.id)
        .map((variant) => [variant.id, variant]),
    );
    return (
      savedProduct.variants.some(
        (variant) =>
          variant.id &&
          !product.variants.some((item) => item.id === variant.id),
      ) ||
      product.variants.some((variant) => {
        const saved = variant.id ? savedById.get(variant.id) : undefined;
        return saved && Number(saved.capacity) !== Number(variant.capacity);
      })
    );
  }, [product, savedProduct]);

  const create = async () => {
    const body = await adminFetch<{ product: ProductDetail }>(
      "/api/admin/products",
      token,
      { method: "POST", body: JSON.stringify({ title: "New product" }) },
    );
    adopt(body.product);
    setMessage(
      "New private draft created. Add the product details, then save.",
    );
    setPreview(false);
    await load();
  };
  useEffect(() => {
    if (newProductRequest <= handledCreateRequest.current) return;
    handledCreateRequest.current = newProductRequest;
    void create();
    // A dashboard request should create exactly one private draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newProductRequest]);
  const patchProduct = (key: keyof ProductDetail, value: unknown) =>
    setProduct((current) => current && { ...current, [key]: value });
  const changeName = (name: string) =>
    setProduct((current) =>
      current
        ? {
            ...current,
            title: name,
            slug: slugEdited ? current.slug : slugify(name),
          }
        : current,
    );

  const saveProduct = async () => {
    if (!product) return null;
    if (capacityChanged && !capacityReason.trim()) {
      setMessage("Please explain the capacity change before saving.");
      return null;
    }
    setSaving(true);
    setMessage("Saving...");
    try {
      await adminFetch(`/api/admin/products/${product.id}`, token, {
        method: "PUT",
        body: JSON.stringify({
          title: product.title,
          slug: product.slug,
          description: product.description,
          category: product.category,
          priceKobo: Math.round(Number(product.price_kobo)),
          careInstructions: product.care_instructions,
          measurements: JSON.parse(product.measurements_json || "{}"),
          sizeGuideKey: product.size_guide_key || "brand-default",
          preparationMinDays: Number(product.preparation_min_days),
          preparationMaxDays: Number(product.preparation_max_days),
          preparationDayBasis: product.preparation_day_basis,
          specificDispatchDate: product.specific_dispatch_date || null,
        }),
      });
      if (product.variants.length) {
        await adminFetch(`/api/admin/products/${product.id}/variants`, token, {
          method: "PUT",
          body: JSON.stringify({
            reason: capacityReason.trim() || undefined,
            variants: product.variants.map((variant) => ({
              ...variant,
              capacity: Number(variant.capacity),
              preorderOpen: Boolean(variant.preorder_open),
            })),
          }),
        });
      }
      if (product.images.length) {
        await adminFetch(`/api/admin/products/${product.id}/images`, token, {
          method: "PUT",
          body: JSON.stringify({
            images: product.images.map((image) => ({
              id: image.id,
              altText: image.alt_text,
              colour: image.colour || null,
              isCover: Boolean(image.is_cover),
            })),
          }),
        });
      }
      const refreshed = await fetchProduct(product.id);
      adopt(refreshed);
      setCapacityReason("");
      setMessage(
        refreshed.status === "published"
          ? "Changes saved. The live product is up to date."
          : "Draft saved privately. It is not visible in the online shop.",
      );
      await load();
      return refreshed;
    } catch (error) {
      setMessage(friendlyError(error));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const upload = async (files: FileList | null) => {
    if (!product || !files?.length) return;
    setSaving(true);
    try {
      for (const file of Array.from(files)) {
        await adminFetch(
          `/api/admin/products/${product.id}/images?alt=${encodeURIComponent(product.title || "Product photo")}`,
          token,
          {
            method: "POST",
            body: file,
            headers: { "content-type": file.type },
          },
        );
      }
      const refreshed = await fetchProduct(product.id);
      setProduct((current) =>
        current ? { ...current, images: refreshed.images } : refreshed,
      );
      setSavedProduct((current) =>
        current ? { ...current, images: refreshed.images } : refreshed,
      );
      setMessage(
        "Photos uploaded. Add useful descriptions and choose the cover photo.",
      );
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: "draft" | "published" | "archived") => {
    if (!product) return;
    const ready = dirty ? await saveProduct() : product;
    if (!ready) return;
    setSaving(true);
    try {
      const body = await adminFetch<{ product: ProductDetail }>(
        `/api/admin/products/${ready.id}/status`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            status,
            reason:
              status === "published"
                ? "Published by owner"
                : status === "draft"
                  ? "Unpublished by owner"
                  : "Archived by owner",
          }),
        },
      );
      adopt(body.product);
      setMessage(
        status === "published"
          ? "Product published. It is now visible in the online shop."
          : status === "draft"
            ? "Product unpublished. It is now a private saved draft."
            : "Product archived and removed from the online shop.",
      );
      await load();
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter((item) => {
    const matchesSearch = item.title
      .toLowerCase()
      .includes(search.trim().toLowerCase());
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "sample"
        ? Boolean(item.is_sample)
        : item.status === statusFilter && !item.is_sample);
    return matchesSearch && matchesStatus;
  });

  if (product && savedProduct)
    return (
      <section className="product-editor-view">
        <button
          className="back-link"
          onClick={() => {
            if (
              !dirty ||
              window.confirm("Discard the unsaved changes to this product?")
            ) {
              setProduct(null);
              setSavedProduct(null);
              setPreview(false);
              setMessage("");
            }
          }}
        >
          ← Back to products
        </button>
        {message && (
          <p className="admin-message" role="status">
            {message}
          </p>
        )}
        <ProductEditor
          product={product}
          savedProduct={savedProduct}
          setProduct={setProduct}
          dirty={dirty}
          capacityChanged={capacityChanged}
          capacityReason={capacityReason}
          setCapacityReason={setCapacityReason}
          preview={preview}
          setPreview={setPreview}
          saving={saving}
          slugEdited={slugEdited}
          setSlugEdited={setSlugEdited}
          patchProduct={patchProduct}
          changeName={changeName}
          saveProduct={saveProduct}
          upload={upload}
          changeStatus={changeStatus}
        />
      </section>
    );

  return (
    <section>
      <header className="admin-page-heading">
        <div>
          <h1>Products</h1>
        </div>
        <button className="button dark" onClick={() => void create()}>
          + Add product
        </button>
      </header>
      {message && (
        <p className="admin-message" role="status">
          {message}
        </p>
      )}
      <div className="admin-filters product-list-filters">
        <input
          aria-label="Search products"
          placeholder="Search products"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Filter products by status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All products</option>
          <option value="draft">Private drafts</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
          <option value="sample">Sample products</option>
        </select>
      </div>
      <p className="admin-help">
        Samples are staging-only and cannot take real orders.
      </p>
      <div className="admin-split">
        <div className="admin-card">
          {filteredProducts.map((item) => (
            <button
              className="admin-list-row product-list-row"
              key={item.id}
              onClick={() => void open(item.id)}
            >
              {item.cover_url ? (
                <img src={item.cover_url} alt="" />
              ) : (
                <span className="product-thumb-placeholder" aria-hidden="true">
                  H
                </span>
              )}
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.is_sample
                    ? "Sample, staging only"
                    : item.status === "published"
                      ? "Published"
                      : item.status === "draft"
                        ? "Private draft"
                        : "Archived"}
                  {" · "}
                  {item.variant_count}{" "}
                  {item.variant_count === 1
                    ? "size/colour option"
                    : "size/colour options"}
                  {" · "}
                  {item.image_count}{" "}
                  {item.image_count === 1 ? "photo" : "photos"}
                </small>
              </span>
              <span>
                <b>
                  {item.price_kobo > 0
                    ? naira(item.price_kobo)
                    : "Price not set"}
                </b>
                <small>
                  {item.available_capacity} remaining preorder slots
                </small>
                <span className="text-link">Edit</span>
              </span>
            </button>
          ))}
          {!filteredProducts.length && (
            <p>No products match this search and filter.</p>
          )}
        </div>
      </div>
    </section>
  );
}

type EditorProps = {
  product: ProductDetail;
  savedProduct: ProductDetail;
  setProduct: React.Dispatch<React.SetStateAction<ProductDetail | null>>;
  dirty: boolean;
  capacityChanged: boolean;
  capacityReason: string;
  setCapacityReason: (value: string) => void;
  preview: boolean;
  setPreview: (value: boolean) => void;
  saving: boolean;
  slugEdited: boolean;
  setSlugEdited: (value: boolean) => void;
  patchProduct: (key: keyof ProductDetail, value: unknown) => void;
  changeName: (value: string) => void;
  saveProduct: () => Promise<ProductDetail | null>;
  upload: (files: FileList | null) => Promise<void>;
  changeStatus: (status: "draft" | "published" | "archived") => Promise<void>;
};

function ProductEditor(props: EditorProps) {
  const { product } = props;
  const [timingMode, setTimingMode] = useState<"range" | "date">(
    product.specific_dispatch_date ? "date" : "range",
  );
  const measurements = parseMeasurements(product.measurements_json);
  const setMeasurement = (key: string, value: string) =>
    props.patchProduct(
      "measurements_json",
      measurementJson(measurements.unit, {
        ...measurements.values,
        [key]: value,
      }),
    );
  const setMeasurementUnit = (unit: MeasurementUnit) =>
    props.patchProduct(
      "measurements_json",
      measurementJson(unit, measurements.values),
    );
  const unknownMeasurements = Object.entries(measurements.values).filter(
    ([key]) => !standardKeys.has(key),
  );

  if (props.preview)
    return (
      <ProductPreview
        product={product}
        onBack={() => props.setPreview(false)}
      />
    );

  const statusText = props.dirty
    ? product.status === "published"
      ? "Unsaved changes. The shop still shows the last saved version"
      : "Unsaved changes"
    : product.status === "published"
      ? "Published. Visible in the online shop"
      : product.status === "draft"
        ? "Saved draft. Private"
        : "Archived. Not visible in the online shop";

  return (
    <div className="admin-card admin-detail owner-product-editor">
      <div className="owner-editor-heading">
        <div>
          <p className={`product-state product-state-${product.status}`}>
            {statusText}
          </p>
          <h2>{product.title || "New product"}</h2>
        </div>
      </div>

      <section className="owner-editor-section">
        <h3>Product details</h3>
        <div className="admin-form-grid">
          <label>
            Product name
            <input
              value={product.title}
              onChange={(event) => props.changeName(event.target.value)}
              placeholder="For example, Ayo Draped Dress"
            />
          </label>
          <label>
            Category
            <select
              value={product.category}
              onChange={(event) =>
                props.patchProduct("category", event.target.value)
              }
            >
              <option value="">Choose a category</option>
              <option>Dresses</option>
              <option>Sets</option>
              <option>Separates</option>
              <option>Occasion</option>
            </select>
          </label>
          <label>
            Price (₦)
            <input
              type="number"
              min="0"
              step="1"
              value={product.price_kobo / 100}
              onChange={(event) =>
                props.patchProduct(
                  "price_kobo",
                  Math.round((Number(event.target.value) || 0) * 100),
                )
              }
            />
            <small>
              Enter the amount in naira. HERLIYAH handles kobo automatically.
            </small>
          </label>
        </div>
        <label>
          Product description
          <textarea
            rows={5}
            value={product.description}
            onChange={(event) =>
              props.patchProduct("description", event.target.value)
            }
            placeholder="Describe the shape, fabric, feel and styling details customers should know."
          />
        </label>
        <details className="owner-advanced-field">
          <summary>Web address (generated automatically)</summary>
          <label>
            Product page address
            <div className="slug-field">
              <span>/product/</span>
              <input
                value={product.slug}
                onChange={(event) => {
                  props.setSlugEdited(true);
                  props.patchProduct("slug", slugify(event.target.value));
                }}
              />
            </div>
          </label>
          {props.slugEdited && (
            <button
              type="button"
              onClick={() => {
                props.setSlugEdited(false);
                props.patchProduct("slug", slugify(product.title));
              }}
            >
              Use the product name again
            </button>
          )}
        </details>
      </section>

      <section className="owner-editor-section">
        <h3>Photos</h3>
        <p>
          Upload the product views customers need. Choose one cover and describe
          each photo.
        </p>
        <label className="admin-upload">
          Add photos
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            disabled={props.saving}
            onChange={(event) => void props.upload(event.target.files)}
          />
        </label>
        {product.images.map((image, index) => (
          <div className="admin-image-row" key={image.id}>
            <img src={image.url} alt="" />
            <label>
              Photo description
              <input
                value={image.alt_text}
                onChange={(event) =>
                  updateImage(props, image.id, { alt_text: event.target.value })
                }
              />
            </label>
            <label>
              Colour shown
              <input
                value={image.colour || ""}
                onChange={(event) =>
                  updateImage(props, image.id, { colour: event.target.value })
                }
              />
            </label>
            <label>
              <input
                type="radio"
                name="cover"
                checked={Boolean(image.is_cover)}
                onChange={() => chooseCover(props, image.id)}
              />
              Cover photo
            </label>
            <span className="image-order-actions">
              <button
                disabled={index === 0}
                onClick={() => reorderImage(props, index, -1)}
              >
                Move earlier
              </button>
              <button
                disabled={index === product.images.length - 1}
                onClick={() => reorderImage(props, index, 1)}
              >
                Move later
              </button>
            </span>
          </div>
        ))}
      </section>

      <section className="owner-editor-section">
        <div className="owner-section-heading">
          <div>
            <h3>Sizes, colours and availability</h3>
            <p>Add one row for every size and colour customers can choose.</p>
          </div>
          <button onClick={() => addVariant(props)}>Add size / colour</button>
        </div>
        {product.variants.map((variant, index) => (
          <div className="owner-variant-card" key={variant.id || index}>
            <label>
              Colour
              <input
                value={variant.colour}
                onChange={(event) =>
                  updateVariant(props, index, { colour: event.target.value })
                }
              />
            </label>
            <label>
              Size
              <select
                value={variant.size}
                onChange={(event) =>
                  updateVariant(props, index, { size: event.target.value })
                }
              >
                {["XS", "S", "M", "L", "XL"].map((size) => (
                  <option key={size}>{size}</option>
                ))}
              </select>
            </label>
            <label>
              Maximum orders you can accept
              <input
                type="number"
                min="0"
                value={variant.capacity}
                onChange={(event) =>
                  updateVariant(props, index, {
                    capacity: Number(event.target.value),
                  })
                }
              />
              {!!variant.id && (
                <small>
                  {Number(variant.reserved_quantity || 0) +
                    Number(variant.committed_quantity || 0)}{" "}
                  already reserved or confirmed
                </small>
              )}
            </label>
            <label className="owner-checkbox">
              <input
                type="checkbox"
                checked={Boolean(variant.preorder_open)}
                onChange={(event) =>
                  updateVariant(props, index, {
                    preorder_open: Number(event.target.checked),
                  })
                }
              />
              Accepting orders
            </label>
            <details className="owner-advanced-field">
              <summary>SKU (generated automatically)</summary>
              <input
                aria-label="SKU"
                value={variant.sku}
                onChange={(event) =>
                  updateVariant(props, index, { sku: event.target.value })
                }
              />
              <button
                type="button"
                onClick={() =>
                  updateVariant(props, index, {
                    sku: makeSku(product, variant.colour, variant.size, index),
                  })
                }
              >
                Regenerate SKU
              </button>
            </details>
            <button onClick={() => removeVariant(props, index)}>
              Remove option
            </button>
          </div>
        ))}
        {props.capacityChanged && (
          <label className="capacity-reason">
            Why is the maximum changing?
            <textarea
              rows={2}
              value={props.capacityReason}
              onChange={(event) => props.setCapacityReason(event.target.value)}
              placeholder="For example, more fabric became available."
            />
            <small>This note is kept in the audit history.</small>
          </label>
        )}
      </section>

      <section className="owner-editor-section">
        <div className="owner-section-heading">
          <div>
            <h3>Measurements</h3>
            <p>
              Enter only the garment measurements that help customers choose.
            </p>
          </div>
          <label>
            Measurement unit
            <select
              value={measurements.unit}
              onChange={(event) =>
                setMeasurementUnit(event.target.value as MeasurementUnit)
              }
            >
              <option value="cm">Centimetres (cm)</option>
              <option value="in">Inches</option>
            </select>
          </label>
        </div>
        <div className="measurement-grid">
          {standardMeasurements.map(([key, label]) => (
            <label key={key}>
              {label} ({measurements.unit === "cm" ? "cm" : "in"})
              <input
                inputMode="decimal"
                value={measurements.values[key] || ""}
                onChange={(event) => setMeasurement(key, event.target.value)}
              />
            </label>
          ))}
          {unknownMeasurements.map(([key, value]) => (
            <label key={key}>
              {key.replace(/([a-z])([A-Z])/g, "$1 $2")} ({measurements.unit})
              <input
                value={value}
                onChange={(event) => setMeasurement(key, event.target.value)}
              />
            </label>
          ))}
        </div>
        <p className="admin-help">
          The approved HERLIYAH brand size guide is applied automatically.
        </p>
      </section>

      <section className="owner-editor-section">
        <h3>Care instructions</h3>
        <label>
          What should the customer do to care for this piece?
          <textarea
            rows={4}
            value={product.care_instructions}
            onChange={(event) =>
              props.patchProduct("care_instructions", event.target.value)
            }
            placeholder={"Dry clean only\nSteam on low heat\nStore hanging"}
          />
          <small>Use simple text or put each instruction on a new line.</small>
        </label>
      </section>

      <section className="owner-editor-section">
        <h3>When will it be dispatched?</h3>
        <p>
          Dispatch is when HERLIYAH hands the order to the courier. Delivery
          happens afterward.
        </p>
        <div className="timing-choice">
          <label>
            <input
              type="radio"
              name={`timing-${product.id}`}
              checked={timingMode === "range"}
              onChange={() => {
                setTimingMode("range");
                props.patchProduct("specific_dispatch_date", "");
              }}
            />
            Preparation range
          </label>
          <label>
            <input
              type="radio"
              name={`timing-${product.id}`}
              checked={timingMode === "date"}
              onChange={() => setTimingMode("date")}
            />
            Specific dispatch date
          </label>
        </div>
        {timingMode === "range" ? (
          <div className="admin-form-grid">
            <label>
              Earliest dispatch
              <input
                type="number"
                min="1"
                value={product.preparation_min_days}
                onChange={(event) =>
                  props.patchProduct(
                    "preparation_min_days",
                    Number(event.target.value),
                  )
                }
              />
            </label>
            <label>
              Latest dispatch
              <input
                type="number"
                min="1"
                value={product.preparation_max_days}
                onChange={(event) =>
                  props.patchProduct(
                    "preparation_max_days",
                    Number(event.target.value),
                  )
                }
              />
            </label>
            <label>
              Count
              <select
                value={product.preparation_day_basis}
                onChange={(event) =>
                  props.patchProduct(
                    "preparation_day_basis",
                    event.target.value,
                  )
                }
              >
                <option value="business">Business days</option>
                <option value="calendar">Calendar days</option>
              </select>
            </label>
          </div>
        ) : (
          <label>
            Dispatch date
            <input
              type="date"
              value={product.specific_dispatch_date || ""}
              onChange={(event) =>
                props.patchProduct("specific_dispatch_date", event.target.value)
              }
            />
          </label>
        )}
      </section>

      <div className="owner-publish-bar">
        <div>
          <strong>{statusText}</strong>
          <small>
            {props.dirty
              ? "Save before leaving this page. Preview does not make a draft public."
              : "All changes saved."}
          </small>
        </div>
        <div className="admin-actions">
          <button onClick={() => props.setPreview(true)}>
            Preview full page
          </button>
          <button
            className="button dark"
            disabled={props.saving || !props.dirty}
            onClick={() => void props.saveProduct()}
          >
            {props.saving ? "Saving..." : "Save changes"}
          </button>
          {product.status !== "published" ? (
            <button
              className="button olive"
              disabled={props.saving}
              onClick={() => void props.changeStatus("published")}
            >
              Publish product
            </button>
          ) : (
            <>
              <a
                className="button olive"
                href={`/product/${props.savedProduct.slug}`}
                target="_blank"
              >
                View live product
              </a>
              <button
                disabled={props.saving}
                onClick={() => {
                  if (
                    window.confirm(
                      "Unpublish this product? It will disappear from the shop, but its details and past orders will be kept.",
                    )
                  )
                    void props.changeStatus("draft");
                }}
              >
                Unpublish product
              </button>
            </>
          )}
        </div>
      </div>
      <details className="owner-advanced-field archive-product-control">
        <summary>Archive this product</summary>
        <p>
          Archiving removes it from the shop and product list filters. Past
          orders are kept.
        </p>
        <button
          onClick={() => {
            if (
              window.confirm("Archive this product? Past orders will be kept.")
            )
              void props.changeStatus("archived");
          }}
        >
          Archive product
        </button>
      </details>
    </div>
  );
}

function ProductPreview({
  product,
  onBack,
}: {
  product: ProductDetail;
  onBack: () => void;
}) {
  const measurements = parseMeasurements(product.measurements_json);
  const colours = [
    ...new Set(
      product.variants.map((variant) => variant.colour).filter(Boolean),
    ),
  ];
  const cover =
    product.images.find((image) => image.is_cover) || product.images[0];
  return (
    <div className="admin-card full-product-preview">
      <div className="preview-toolbar">
        <div>
          <strong>Private preview</strong>
          <span>This page is not visible in the online shop.</span>
        </div>
        <button onClick={onBack}>Back to editing</button>
      </div>
      <div className="preview-product-layout">
        <div className="preview-gallery">
          {cover && (
            <img
              className="preview-cover"
              src={cover.url}
              alt={cover.alt_text}
            />
          )}
          <div className="preview-thumbnails">
            {product.images.map((image) => (
              <img key={image.id} src={image.url} alt={image.alt_text} />
            ))}
          </div>
        </div>
        <article className="preview-product-copy">
          <p className="eyebrow">{product.category || "Category not added"}</p>
          <h2>{product.title || "Product name not added"}</h2>
          <strong className="preview-price">
            {product.price_kobo > 0
              ? naira(product.price_kobo)
              : "Price not set"}
          </strong>
          <p>{product.description || "Product description not added."}</p>
          <div className="preview-choice">
            <strong>Colours</strong>
            <div>
              {colours.length ? (
                colours.map((colour) => <span key={colour}>{colour}</span>)
              ) : (
                <span>Not added</span>
              )}
            </div>
          </div>
          <div className="preview-choice">
            <strong>Sizes</strong>
            <div>
              {product.variants.length ? (
                product.variants.map((variant) => (
                  <span key={variant.id || `${variant.colour}-${variant.size}`}>
                    {variant.size}
                    {variant.preorder_open ? "" : " · closed"}
                  </span>
                ))
              ) : (
                <span>Not added</span>
              )}
            </div>
          </div>
          <div className="preview-dispatch">
            <strong>Ready to dispatch</strong>
            <p>
              {product.specific_dispatch_date
                ? `On ${product.specific_dispatch_date}`
                : `In ${product.preparation_min_days}–${product.preparation_max_days} ${product.preparation_day_basis} days after verified payment.`}{" "}
              Courier delivery begins after dispatch.
            </p>
          </div>
          <section>
            <h3>Measurements</h3>
            {Object.entries(measurements.values).length ? (
              <dl className="preview-measurements">
                {Object.entries(measurements.values).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key.replace(/([a-z])([A-Z])/g, "$1 $2")}</dt>
                    <dd>
                      {value} {measurements.unit}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p>No product measurements added.</p>
            )}
          </section>
          <section>
            <h3>Care instructions</h3>
            <p className="preview-care">
              {product.care_instructions || "Care instructions not added."}
            </p>
          </section>
          <button className="button dark" disabled>
            Choose a size to add to bag
          </button>
        </article>
      </div>
    </div>
  );
}

function updateImage(
  props: EditorProps,
  id: string,
  changes: Partial<ProductImage>,
) {
  props.setProduct((current) =>
    current
      ? {
          ...current,
          images: current.images.map((image) =>
            image.id === id ? { ...image, ...changes } : image,
          ),
        }
      : current,
  );
}
function chooseCover(props: EditorProps, id: string) {
  props.setProduct((current) =>
    current
      ? {
          ...current,
          images: current.images.map((image) => ({
            ...image,
            is_cover: Number(image.id === id),
          })),
        }
      : current,
  );
}
function reorderImage(props: EditorProps, index: number, direction: number) {
  props.setProduct((current) => {
    if (!current) return current;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= current.images.length) return current;
    const images = [...current.images];
    [images[index], images[nextIndex]] = [images[nextIndex], images[index]];
    return { ...current, images };
  });
}
function updateVariant(
  props: EditorProps,
  index: number,
  changes: Partial<Variant>,
) {
  props.setProduct((current) =>
    current
      ? {
          ...current,
          variants: current.variants.map((variant, currentIndex) =>
            currentIndex === index ? { ...variant, ...changes } : variant,
          ),
        }
      : current,
  );
}
function addVariant(props: EditorProps) {
  props.setProduct((current) => {
    if (!current) return current;
    const index = current.variants.length;
    const size = "XS";
    const colour = "";
    return {
      ...current,
      variants: [
        ...current.variants,
        {
          sku: makeSku(current, colour, size, index),
          size,
          colour,
          capacity: 0,
          preorder_open: 1,
        },
      ],
    };
  });
}
function removeVariant(props: EditorProps, index: number) {
  props.setProduct((current) =>
    current
      ? {
          ...current,
          variants: current.variants.filter(
            (_, currentIndex) => currentIndex !== index,
          ),
        }
      : current,
  );
}
