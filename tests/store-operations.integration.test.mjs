import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import {
  createAdminProduct,
  updateAdminProduct,
  changeAdminProductStatus,
} from "../server/admin-products.ts";
import {
  reorderAdminImages,
  replaceAdminVariants,
} from "../server/admin-inventory.ts";
import { updateAdminFulfilment } from "../server/admin-orders.ts";
import {
  applyVerifiedPayment,
  createCheckout,
  getCatalog,
  getGuestOrder,
} from "../server/checkout-service.mjs";
import { isLocalPreviewAdminRequest } from "../server/admin-auth.ts";
import { getCustomerOrders } from "../server/customer-service.ts";
import {
  getAdminSettings,
  saveAdminDeliveryZone,
  saveAdminFeaturedProducts,
  saveAdminSetting,
} from "../server/admin-settings.ts";

const migrationFiles = [
  "0000_herliyah_core.sql",
  "0001_checkout_foundation.sql",
  "0002_refunds.sql",
  "0003_store_operations.sql",
];
async function executeSql(db, sql) {
  let statement = "";
  let trigger = false;
  const run = async () => {
    await db.exec(statement.replace(/\s+/g, " ").trim());
    statement = "";
    trigger = false;
  };
  for (const raw of sql.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (/^CREATE TRIGGER/i.test(line)) trigger = true;
    statement += `${raw}\n`;
    if ((trigger && /END;\s*$/i.test(line)) || (!trigger && line.endsWith(";")))
      await run();
  }
}
async function database() {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch(){ return new Response("ok") } }',
    compatibilityDate: "2026-05-15",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: crypto.randomUUID() },
  });
  try {
    const db = await mf.getD1Database("DB");
    for (const file of migrationFiles) {
      await executeSql(
        db,
        await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8"),
      );
    }
    await executeSql(
      db,
      await readFile(new URL("../db/seed.sql", import.meta.url), "utf8"),
    );
    return { db, dispose: () => mf.dispose() };
  } catch (error) {
    await mf.dispose();
    throw error;
  }
}

test("owner can complete a product and customer can follow its real order", async () => {
  const { db, dispose } = await database();
  try {
    const draft = await createAdminProduct(db, "owner", { title: "Ayo Dress" });
    assert.equal(draft.slug, "ayo-dress");
    assert.equal(draft.size_guide_key, "brand-default");
    const blocked = await changeAdminProductStatus(
      db,
      "owner",
      draft.id,
      "published",
      "Attempt incomplete publish",
    );
    assert.equal(blocked.ok, false);
    assert.ok(blocked.errors.length >= 4);

    await updateAdminProduct(
      db,
      "owner",
      draft.id,
      {
        title: "Ayo Dress",
        slug: "ayo-dress",
        description: "A softly structured dress prepared to order.",
        category: "Dresses",
        priceKobo: 7500000,
        careInstructions: "Dry clean only.",
        measurements: { length: "145 cm" },
        sizeGuideKey: "brand-default",
        preparationMinDays: 5,
        preparationMaxDays: 7,
        preparationDayBasis: "business",
      },
      "Complete launch content",
    );
    const initialVariants = await replaceAdminVariants(
      db,
      "owner",
      draft.id,
      [
        { sku: "AYO-BLK-S", size: "S", colour: "Black", capacity: 4 },
        { sku: "AYO-BLK-M", size: "M", colour: "Black", capacity: 3 },
      ],
      undefined,
    );
    await assert.rejects(
      replaceAdminVariants(
        db,
        "owner",
        draft.id,
        initialVariants.variants.map((variant, index) => ({
          id: variant.id,
          sku: variant.sku,
          size: variant.size,
          colour: variant.colour,
          capacity: Number(variant.capacity) + (index === 0 ? 1 : 0),
          preorderOpen: Boolean(variant.preorder_open),
        })),
        undefined,
      ),
      /capacity_reason_required/,
    );
    const imageA = crypto.randomUUID();
    const imageB = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.batch([
      db.prepare("INSERT INTO product_images (id,product_id,object_key,alt_text,sort_order,is_cover,colour,created_at) VALUES (?,?,?,?,0,1,?,?)").bind(imageA, draft.id, "public:hero-cream.png", "Ayo Dress front view", "Black", now),
      db.prepare("INSERT INTO product_images (id,product_id,object_key,alt_text,sort_order,is_cover,colour,created_at) VALUES (?,?,?,?,1,0,?,?)").bind(imageB, draft.id, "public:flatlay-cocoa.png", "Ayo Dress back detail", "Black", now),
    ]);
    await reorderAdminImages(db, "owner", draft.id, [
      { id: imageB, altText: "Ayo Dress back detail", colour: "Black", isCover: true },
      { id: imageA, altText: "Ayo Dress front view", colour: "Black", isCover: false },
    ]);
    const published = await changeAdminProductStatus(
      db,
      "owner",
      draft.id,
      "published",
      "Ready for first collection",
    );
    assert.equal(published.ok, true);
    const catalog = await getCatalog(db, "production");
    const product = catalog.find((item) => item.id === draft.id);
    assert.equal(product.images[0].src, "/flatlay-cocoa.png");
    assert.equal(product.sample, false);

    const variant = product.variants.find((item) => item.size === "S");
    const checkout = await createCheckout(
      db,
      {
        idempotencyKey: crypto.randomUUID(),
        customer: {
          fullName: "Ada Customer",
          email: "ada@example.com",
          phone: "08000000000",
          address: "1 Lagos Street",
          city: "Lagos",
          state: "Lagos",
          landmark: "",
          note: "",
          terms: true,
        },
        deliveryZoneId: "lagos",
        lines: [{ variantId: variant.id, quantity: 1 }],
      },
      "preview",
    );
    const previewAttempt = await db.prepare("SELECT provider,environment FROM payment_attempts WHERE id=?").bind(checkout.payment_attempt_id).first();
    assert.deepEqual(previewAttempt, { provider: "simulation", environment: "test" });
    await applyVerifiedPayment(db, {
      reference: checkout.reference,
      status: "succeeded",
      amountKobo: checkout.amount_kobo,
      currency: "NGN",
      environment: "test",
    });
    for (const status of [
      "confirmed",
      "in_preparation",
      "ready_to_dispatch",
      "dispatched",
      "delivered",
    ]) {
      await updateAdminFulfilment(db, "owner", checkout.order_id, {
        status,
        ...(status === "dispatched"
          ? { courierName: "Test Courier", trackingReference: "TRK-001" }
          : {}),
      });
    }
    const tracked = await getGuestOrder(db, checkout.order_id, checkout.accessToken);
    assert.equal(tracked.fulfilment_status, "delivered");
    assert.equal(tracked.payment.status, "succeeded");
    assert.equal(await getGuestOrder(db, checkout.order_id, "wrong-token"), null);
    const audit = await db.prepare("SELECT COUNT(*) AS total FROM admin_audit_log WHERE entity_id IN (?,?)").bind(draft.id, checkout.order_id).first();
    assert.ok(Number(audit.total) >= 9);
    const ownerCustomer = crypto.randomUUID();
    const otherCustomer = crypto.randomUUID();
    await db.batch([
      db.prepare("INSERT INTO customers (id,auth_subject,verified_email,created_at) VALUES (?,?,?,?)").bind(ownerCustomer, "subject-owner", "ada@example.com", now),
      db.prepare("INSERT INTO customers (id,auth_subject,verified_email,created_at) VALUES (?,?,?,?)").bind(otherCustomer, "subject-other", "other@example.com", now),
      db.prepare("UPDATE orders SET customer_id=? WHERE id=?").bind(ownerCustomer, checkout.order_id),
    ]);
    assert.equal((await getCustomerOrders(db, ownerCustomer)).length, 1);
    assert.equal((await getCustomerOrders(db, otherCustomer)).length, 0);

    const liveCheckout = await createCheckout(
      db,
      {
        idempotencyKey: crypto.randomUUID(),
        customer: {
          fullName: "Live Customer",
          email: "live@example.com",
          phone: "08000000001",
          address: "2 Lagos Street",
          city: "Lagos",
          state: "Lagos",
          landmark: "",
          note: "",
          terms: true,
        },
        deliveryZoneId: "lagos",
        lines: [{ variantId: variant.id, quantity: 1 }],
      },
      { mode: "production", provider: "paystack" },
    );
    const liveAttempt = await db.prepare("SELECT provider,environment FROM payment_attempts WHERE id=?").bind(liveCheckout.payment_attempt_id).first();
    assert.deepEqual(liveAttempt, { provider: "paystack", environment: "live" });
  } finally {
    await dispose();
  }
});

test("local admin authorization rejects missing, incorrect, and deployed tokens", async () => {
  const env = {
    APP_MODE: "preview",
    ADMIN_AUTH_MODE: "preview-token",
    ADMIN_PREVIEW_TOKEN: "a-secure-local-token",
  };
  assert.equal(
    await isLocalPreviewAdminRequest(new Request("http://localhost/api/admin/products"), env),
    false,
  );
  assert.equal(
    await isLocalPreviewAdminRequest(new Request("http://localhost/api/admin/products", { headers: { "x-herliyah-admin-token": "not-the-token" } }), env),
    false,
  );
  assert.equal(
    await isLocalPreviewAdminRequest(new Request("http://localhost/api/admin/products", { headers: { "x-herliyah-admin-token": "a-secure-local-token" } }), env),
    true,
  );
  assert.equal(
    await isLocalPreviewAdminRequest(new Request("https://store.example/api/admin/products", { headers: { "x-herliyah-admin-token": "a-secure-local-token" } }), env),
    false,
  );
});

test("owner settings preserve structured values, naira conversion output, and featured order", async () => {
  const { db, dispose } = await database();
  try {
    const contact = { email: "owner@example.com", phone: "0800", customChannel: "preserve-me" };
    const sizeGuide = { unit: "in", rows: [{ size: "XS", bust: "32", waist: "24", hips: "35", shoulder: "14" }], approvedBy: "owner" };
    await saveAdminSetting(db, "owner", "contact", contact);
    await saveAdminSetting(db, "owner", "size_guide", sizeGuide);
    await saveAdminDeliveryZone(db, "owner", { id: "qa-zone", name: "QA delivery area", feeKobo: Math.round(5000 * 100), transitMinDays: 2, transitMaxDays: 5, transitDayBasis: "business", active: true });
    await db.prepare("UPDATE products SET is_sample=0,status='published' WHERE id='sample-001'").run();
    await saveAdminFeaturedProducts(db, "owner", ["sample-001"]);
    const saved = await getAdminSettings(db);
    assert.deepEqual(saved.settings.contact, contact);
    assert.deepEqual(saved.settings.size_guide, sizeGuide);
    const zone = saved.deliveryZones.find((item) => item.id === "qa-zone");
    assert.equal(zone.fee_kobo, 500000);
    assert.equal(zone.transit_min_days, 2);
    assert.equal(zone.transit_max_days, 5);
    assert.deepEqual(saved.featuredProducts.map((item) => item.id), ["sample-001"]);
  } finally {
    await dispose();
  }
});
