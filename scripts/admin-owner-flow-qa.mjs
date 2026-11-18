import { readFile } from "node:fs/promises";

const origin = process.env.PREVIEW_URL || "http://127.0.0.1:5173";
const token = process.env.ADMIN_QA_TOKEN || "herliyah-local-admin-qa-2026";
const headers = { "x-herliyah-admin-token": token };
async function request(path, init = {}) {
  const response = await fetch(`${origin}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

const title = `[QA] Phone owner flow ${new Date().toISOString().slice(0, 16)}`;
const { product: draft } = await request("/api/admin/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
await request(`/api/admin/products/${draft.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, slug: `qa-phone-owner-${draft.id.slice(0, 8)}`, description: "Clearly labelled local QA product for the mobile owner journey.", category: "Dresses", priceKobo: 4250000, careInstructions: "Dry clean only.\nStore hanging.", measurements: { unit: "in", bust: "36", waist: "28", hips: "39" }, sizeGuideKey: "brand-default", preparationMinDays: 4, preparationMaxDays: 6, preparationDayBasis: "business", specificDispatchDate: null }) });
await request(`/api/admin/products/${draft.id}/variants`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ variants: [{ sku: `QA-${draft.id.slice(0, 6)}-BLK-S`, size: "S", colour: "Black", capacity: 3, preorderOpen: true }, { sku: `QA-${draft.id.slice(0, 6)}-BLK-M`, size: "M", colour: "Black", capacity: 2, preorderOpen: true }] }) });
for (const [file, alt] of [["public/hero-cream.png", `${title} front view`], ["public/flatlay-cocoa.png", `${title} detail view`]]) {
  await request(`/api/admin/products/${draft.id}/images?alt=${encodeURIComponent(alt)}&colour=Black`, { method: "POST", headers: { "content-type": "image/png" }, body: await readFile(file) });
}
let saved = (await request(`/api/admin/products/${draft.id}`)).product;
await request(`/api/admin/products/${draft.id}/images`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ images: [...saved.images].reverse().map((image, index) => ({ id: image.id, altText: image.alt_text, colour: "Black", isCover: index === 0 })) }) });
saved = (await request(`/api/admin/products/${draft.id}`)).product;
if (saved.price_kobo !== 4250000 || saved.images.length !== 2 || saved.variants.length !== 2 || saved.care_instructions !== "Dry clean only.\nStore hanging.") throw new Error("Saved product values did not survive reload");
await request(`/api/admin/products/${draft.id}/status`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "published", reason: "Local QA publication check" }) });
const catalog = await fetch(`${origin}/api/catalog`).then((response) => response.json());
if (!catalog.products.some((product) => product.id === draft.id)) throw new Error("Published QA product did not appear in the storefront catalog");
await request(`/api/admin/products/${draft.id}/status`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "draft", reason: "Local QA unpublish check" }) });
const finalProduct = (await request(`/api/admin/products/${draft.id}`)).product;
if (finalProduct.status !== "draft") throw new Error("QA product did not return to private draft status");
console.log(JSON.stringify({ passed: true, productId: draft.id, title, images: saved.images.length, variants: saved.variants.length, priceKobo: saved.price_kobo, finalStatus: finalProduct.status }));
