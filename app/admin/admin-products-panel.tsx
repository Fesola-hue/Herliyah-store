"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch, naira, type AdminApiError } from "./admin-api";

type ProductSummary = {
  id: string;
  title: string;
  slug: string;
  status: string;
  price_kobo: number;
  variant_count: number;
  image_count: number;
  available_capacity: number;
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

export function AdminProductsPanel({ token }: { token: string }) {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [reason, setReason] = useState("Owner catalog update");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(false);
  const load = useCallback(async () => {
    const body = await adminFetch<{ products: ProductSummary[] }>(
      "/api/admin/products",
      token,
    );
    setProducts(body.products);
  }, [token]);
  const open = useCallback(async (id: string) => {
    const body = await adminFetch<{ product: ProductDetail }>(
      `/api/admin/products/${id}`,
      token,
    );
    setProduct(body.product);
  }, [token]);
  useEffect(() => {
    const timer = window.setTimeout(
      () => void load().catch(() => setMessage("Products could not be loaded.")),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [load]);
  const create = async () => {
    const body = await adminFetch<{ product: ProductDetail }>(
      "/api/admin/products",
      token,
      { method: "POST", body: JSON.stringify({ title: "Untitled style" }) },
    );
    setProduct(body.product);
    await load();
  };
  const patchProduct = (key: keyof ProductDetail, value: unknown) =>
    setProduct((current) => current && ({ ...current, [key]: value }));
  const saveDetails = async () => {
    if (!product) return;
    try {
      const body = await adminFetch<{ product: ProductDetail }>(
        `/api/admin/products/${product.id}`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({
            title: product.title,
            slug: product.slug,
            description: product.description,
            category: product.category,
            priceKobo: Number(product.price_kobo),
            careInstructions: product.care_instructions,
            measurements: JSON.parse(product.measurements_json || "{}"),
            sizeGuideKey: product.size_guide_key,
            preparationMinDays: Number(product.preparation_min_days),
            preparationMaxDays: Number(product.preparation_max_days),
            preparationDayBasis: product.preparation_day_basis,
            specificDispatchDate: product.specific_dispatch_date || null,
            reason,
          }),
        },
      );
      setProduct(body.product);
      setMessage("Draft details saved.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    }
  };
  const saveVariants = async () => {
    if (!product) return;
    const body = await adminFetch<{ product: ProductDetail }>(
      `/api/admin/products/${product.id}/variants`,
      token,
      {
        method: "PUT",
        body: JSON.stringify({
          reason,
          variants: product.variants.map((variant) => ({
            ...variant,
            capacity: Number(variant.capacity),
            preorderOpen: Boolean(variant.preorder_open),
          })),
        }),
      },
    );
    setProduct(body.product);
    setMessage("Variant availability saved.");
  };
  const saveImages = async () => {
    if (!product) return;
    const body = await adminFetch<{ product: ProductDetail }>(
      `/api/admin/products/${product.id}/images`,
      token,
      {
        method: "PUT",
        body: JSON.stringify({
          images: product.images.map((image) => ({
            id: image.id,
            altText: image.alt_text,
            colour: image.colour || null,
            isCover: Boolean(image.is_cover),
          })),
        }),
      },
    );
    setProduct(body.product);
    setMessage("Image order and metadata saved.");
  };
  const upload = async (files: FileList | null) => {
    if (!product || !files) return;
    for (const file of Array.from(files)) {
      await adminFetch(
        `/api/admin/products/${product.id}/images?alt=${encodeURIComponent(product.title)}`,
        token,
        { method: "POST", body: file, headers: { "content-type": file.type } },
      );
    }
    await open(product.id);
    setMessage("Images uploaded. Add descriptive alt text before publishing.");
  };
  const changeStatus = async (status: "draft" | "published" | "archived") => {
    if (!product) return;
    try {
      const body = await adminFetch<{ product: ProductDetail }>(
        `/api/admin/products/${product.id}/status`,
        token,
        { method: "POST", body: JSON.stringify({ status, reason }) },
      );
      setProduct(body.product);
      setMessage(`Product moved to ${status}.`);
      await load();
    } catch (error) {
      const api = error as AdminApiError;
      const details = api.details as { errors?: string[] };
      setMessage(details?.errors?.join(" ú ") || api.message);
    }
  };
  const reorder = (index: number, direction: number) => {
    if (!product) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= product.images.length) return;
    const images = [...product.images];
    [images[index], images[nextIndex]] = [images[nextIndex], images[index]];
    patchProduct("images", images);
  };
  return (
    <section>
      <header>
        <div><p className="eyebrow">Products</p><h1>Collection workspace</h1></div>
        <button className="button dark" onClick={() => void create()}>Add draft product</button>
      </header>
      {message && <p className="admin-message">{message}</p>}
      <div className="admin-split">
        <div className="admin-card">
          {products.map((item) => (
            <button className="admin-list-row" key={item.id} onClick={() => void open(item.id)}>
              <span><strong>{item.title}</strong><small>{item.status} ú {item.variant_count} variants ú {item.image_count} images</small></span>
              <span><b>{naira(item.price_kobo)}</b><small>{item.available_capacity} available</small></span>
            </button>
          ))}
        </div>
        {product && (
          <ProductEditor
            product={product} setProduct={setProduct} reason={reason}
            setReason={setReason} preview={preview} setPreview={setPreview}
            patchProduct={patchProduct} saveDetails={saveDetails}
            saveVariants={saveVariants} saveImages={saveImages}
            upload={upload} changeStatus={changeStatus} reorder={reorder}
          />
        )}
      </div>
    </section>
  );
}

type SetProductValue =
  | ProductDetail
  | null
  | ((current: ProductDetail | null) => ProductDetail | null);
type EditorProps = {
  product: ProductDetail;
  setProduct: (value: SetProductValue) => void;
  reason: string;
  setReason: (value: string) => void;
  preview: boolean;
  setPreview: (value: boolean | ((current: boolean) => boolean)) => void;
  patchProduct: (key: keyof ProductDetail, value: unknown) => void;
  saveDetails: () => Promise<void>;
  saveVariants: () => Promise<void>;
  saveImages: () => Promise<void>;
  upload: (files: FileList | null) => Promise<void>;
  changeStatus: (status: "draft" | "published" | "archived") => Promise<void>;
  reorder: (index: number, direction: number) => void;
};
function ProductEditor(props: EditorProps) {
  const { product, patchProduct } = props;
  const cover =
    product.images.find((image) => image.is_cover) || product.images[0];
  if (props.preview)
    return (
      <div className="admin-card admin-detail">
        <button onClick={() => props.setPreview(false)}>Back to editor</button>
        <article className="admin-product-preview">
          {cover && <img src={cover.url} alt={cover.alt_text} />}
          <p className="eyebrow">
            {product.category || "Category pending"} ú private preview
          </p>
          <h2>{product.title}</h2>
          <strong>{naira(product.price_kobo)}</strong>
          <p>{product.description}</p>
          <p>
            Ready to dispatch{" "}
            {product.specific_dispatch_date
              ? `on ${product.specific_dispatch_date}`
              : `in ${product.preparation_min_days}-${product.preparation_max_days} ${product.preparation_day_basis} days after verified payment`}
            .
          </p>
        </article>
      </div>
    );
  return (
    <div className="admin-card admin-detail">
      <div className="card-heading">
        <h2>{product.title}</h2>
        <button onClick={() => props.setPreview(true)}>Preview</button>
      </div>
      <div className="admin-form-grid">
        {(["title", "slug", "category"] as const).map((key) => (
          <label key={key}>
            {key}
            <input
              value={String(product[key] || "")}
              onChange={(event) => patchProduct(key, event.target.value)}
            />
          </label>
        ))}
        <label>
          Price (kobo)
          <input
            type="number"
            value={product.price_kobo}
            onChange={(event) =>
              patchProduct("price_kobo", Number(event.target.value))
            }
          />
        </label>
        <label>
          Preparation min days
          <input
            type="number"
            value={product.preparation_min_days}
            onChange={(event) =>
              patchProduct("preparation_min_days", Number(event.target.value))
            }
          />
        </label>
        <label>
          Preparation max days
          <input
            type="number"
            value={product.preparation_max_days}
            onChange={(event) =>
              patchProduct("preparation_max_days", Number(event.target.value))
            }
          />
        </label>
        <label>
          Day basis
          <select
            value={product.preparation_day_basis}
            onChange={(event) =>
              patchProduct("preparation_day_basis", event.target.value)
            }
          >
            <option value="business">Business days</option>
            <option value="calendar">Calendar days</option>
          </select>
        </label>
        <label>
          Specific dispatch date (optional)
          <input
            type="date"
            value={product.specific_dispatch_date || ""}
            onChange={(event) =>
              patchProduct("specific_dispatch_date", event.target.value)
            }
          />
        </label>
        <label>
          Size guide key
          <input
            value={product.size_guide_key}
            onChange={(event) =>
              patchProduct("size_guide_key", event.target.value)
            }
          />
        </label>
      </div>
      <label>
        Description
        <textarea
          rows={5}
          value={product.description}
          onChange={(event) => patchProduct("description", event.target.value)}
        />
      </label>
      <label>
        Care instructions
        <textarea
          rows={3}
          value={product.care_instructions}
          onChange={(event) =>
            patchProduct("care_instructions", event.target.value)
          }
        />
      </label>
      <label>
        Measurements JSON
        <textarea
          rows={4}
          value={product.measurements_json}
          onChange={(event) =>
            patchProduct("measurements_json", event.target.value)
          }
        />
      </label>
      <label>
        Audit reason
        <input
          value={props.reason}
          onChange={(event) => props.setReason(event.target.value)}
        />
      </label>
      <button className="button dark" onClick={() => void props.saveDetails()}>
        Save draft details
      </button>
      <div className="admin-actions">
        <button onClick={() => void props.changeStatus("published")}>Publish</button>
        <button onClick={() => void props.changeStatus("draft")}>Unpublish</button>
        <button onClick={() => void props.changeStatus("archived")}>Archive</button>
      </div>
      <ImageEditor {...props} />
      <VariantEditor {...props} />
    </div>
  );
}

function ImageEditor(props: EditorProps) {
  const { product } = props;
  const update = (id: string, changes: Partial<ProductImage>) =>
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
  const chooseCover = (id: string) =>
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
  return (
    <>
      <h3>Images</h3>
      <label className="admin-upload">
        Upload JPEG, PNG, WebP or AVIF
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          onChange={(event) => void props.upload(event.target.files)}
        />
      </label>
      {product.images.map((image, index) => (
        <div className="admin-image-row" key={image.id}>
          <img src={image.url} alt="" />
          <input
            aria-label="Alt text"
            placeholder="Describe this image"
            value={image.alt_text}
            onChange={(event) =>
              update(image.id, { alt_text: event.target.value })
            }
          />
          <input
            aria-label="Assigned colour"
            placeholder="Assigned colour"
            value={image.colour || ""}
            onChange={(event) =>
              update(image.id, { colour: event.target.value })
            }
          />
          <label>
            <input
              type="radio"
              name="cover"
              checked={Boolean(image.is_cover)}
              onChange={() => chooseCover(image.id)}
            />{" "}
            Cover
          </label>
          <span>
            <button onClick={() => props.reorder(index, -1)}></button>
            <button onClick={() => props.reorder(index, 1)}></button>
          </span>
        </div>
      ))}
      {!!product.images.length && (
        <button className="button dark" onClick={() => void props.saveImages()}>
          Save image order
        </button>
      )}
    </>
  );
}

function VariantEditor(props: EditorProps) {
  const { product } = props;
  const update = (index: number, changes: Partial<Variant>) =>
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
  const remove = (index: number) =>
    props.patchProduct(
      "variants",
      product.variants.filter((_, currentIndex) => currentIndex !== index),
    );
  const add = () =>
    props.patchProduct("variants", [
      ...product.variants,
      {
        sku: `HLY-${product.slug.toUpperCase()}-${product.variants.length + 1}`,
        size: "XS",
        colour: "",
        capacity: 0,
        preorder_open: 1,
      },
    ]);
  return (
    <>
      <h3>Sizes, colours and preorder capacity</h3>
      {product.variants.map((variant, index) => (
        <div className="admin-variant-row" key={variant.id || index}>
          <input
            aria-label="SKU"
            placeholder="SKU"
            value={variant.sku}
            onChange={(event) => update(index, { sku: event.target.value })}
          />
          <input
            aria-label="Colour"
            placeholder="Colour"
            value={variant.colour}
            onChange={(event) => update(index, { colour: event.target.value })}
          />
          <select
            aria-label="Size"
            value={variant.size}
            onChange={(event) => update(index, { size: event.target.value })}
          >
            {["XS", "S", "M", "L", "XL"].map((size) => (
              <option key={size}>{size}</option>
            ))}
          </select>
          <input
            type="number"
            aria-label="Capacity"
            min={0}
            value={variant.capacity}
            onChange={(event) =>
              update(index, { capacity: Number(event.target.value) })
            }
          />
          <label>
            <input
              type="checkbox"
              checked={Boolean(variant.preorder_open)}
              onChange={(event) =>
                update(index, {
                  preorder_open: Number(event.target.checked),
                })
              }
            />{" "}
            Open
          </label>
          <button onClick={() => remove(index)}>Remove</button>
        </div>
      ))}
      <div className="admin-actions">
        <button onClick={add}>Add variant</button>
        {!!product.variants.length && (
          <button
            className="button olive"
            onClick={() => void props.saveVariants()}
          >
            Save variants
          </button>
        )}
      </div>
    </>
  );
}
