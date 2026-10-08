import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import {
  applyVerifiedPayment,
  createCheckout,
  reconcileExpiredPayments,
  releaseExpiredReservations,
} from "../server/checkout-service.mjs";

const migration = await readFile(
  new URL("../drizzle/0000_herliyah_core.sql", import.meta.url),
  "utf8",
);
const checkoutMigration = await readFile(
  new URL("../drizzle/0001_checkout_foundation.sql", import.meta.url),
  "utf8",
);
const refundsMigration = await readFile(
  new URL("../drizzle/0002_refunds.sql", import.meta.url),
  "utf8",
);
const seed = await readFile(new URL("../db/seed.sql", import.meta.url), "utf8");
const customer = {
  fullName: "Test Customer",
  email: "customer@example.com",
  phone: "08000000000",
  address: "1 Test Street",
  city: "Lagos",
  state: "Lagos",
  landmark: "",
  note: "",
  terms: true,
};
async function executeSql(db, sql) {
  let statement = "",
    trigger = false;
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
    if ((trigger && /^END;$/i.test(line)) || (!trigger && line.endsWith(";")))
      await run();
  }
  if (statement.trim()) await run();
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
    await executeSql(db, migration);
    await executeSql(db, checkoutMigration);
    await executeSql(db, refundsMigration);
    await executeSql(db, seed);
    return { db, dispose: () => mf.dispose() };
  } catch (error) {
    await mf.dispose();
    throw error;
  }
}
const input = (key, lines = [{ variantId: "sample-001-xs", quantity: 1 }]) => ({
  idempotencyKey: key,
  customer,
  deliveryZoneId: "lagos",
  lines,
});
const verified = (checkout) => ({
  reference: checkout.reference,
  status: "succeeded",
  amountKobo: checkout.amount_kobo,
  currency: "NGN",
  environment: "test",
});

test("actual D1 checkout creates one complete atomic checkout", async () => {
  const { db, dispose } = await database();
  try {
    const result = await createCheckout(db, input("atomic-checkout"));
    assert.equal(result.replayed, false);
    assert.equal(
      (await db.prepare("SELECT COUNT(*) n FROM orders").first()).n,
      1,
    );
    assert.equal(
      (await db.prepare("SELECT COUNT(*) n FROM order_items").first()).n,
      1,
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT reserved_quantity n FROM variants WHERE id='sample-001-xs'",
          )
          .first()
      ).n,
      1,
    );
    assert.equal(
      (await db.prepare("SELECT COUNT(*) n FROM payment_attempts").first()).n,
      1,
    );
  } finally {
    await dispose();
  }
});

test("insufficient second line rolls back order and all capacity", async () => {
  const { db, dispose } = await database();
  try {
    await assert.rejects(
      createCheckout(
        db,
        input("rollback-checkout", [
          { variantId: "sample-001-xs", quantity: 1 },
          { variantId: "sample-002-xs", quantity: 6 },
        ]),
      ),
      /basket_unavailable/,
    );
    assert.equal(
      (await db.prepare("SELECT COUNT(*) n FROM orders").first()).n,
      0,
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT reserved_quantity n FROM variants WHERE id='sample-001-xs'",
          )
          .first()
      ).n,
      0,
    );
  } finally {
    await dispose();
  }
});

test("competing checkouts cannot reserve the last unit twice", async () => {
  const { db, dispose } = await database();
  try {
    await db
      .prepare("UPDATE variants SET capacity=1 WHERE id='sample-001-xs'")
      .run();
    const results = await Promise.allSettled([
      createCheckout(db, input("race-one")),
      createCheckout(db, input("race-two")),
    ]);
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      (await db.prepare("SELECT COUNT(*) n FROM orders").first()).n,
      1,
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT reserved_quantity n FROM variants WHERE id='sample-001-xs'",
          )
          .first()
      ).n,
      1,
    );
  } finally {
    await dispose();
  }
});

test("duplicate checkout requests return the same logical order", async () => {
  const { db, dispose } = await database();
  try {
    const [first, second] = await Promise.all([
      createCheckout(db, input("duplicate-key")),
      createCheckout(db, input("duplicate-key")),
    ]);
    assert.equal(
      first.order_id ?? first.orderId,
      second.order_id ?? second.orderId,
    );
    assert.equal(
      (await db.prepare("SELECT COUNT(*) n FROM orders").first()).n,
      1,
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT reserved_quantity n FROM variants WHERE id='sample-001-xs'",
          )
          .first()
      ).n,
      1,
    );
  } finally {
    await dispose();
  }
});

test("duplicate successful payment events commit capacity once", async () => {
  const { db, dispose } = await database();
  try {
    const checkout = await createCheckout(db, input("payment-event"));
    const payment = verified(checkout);
    assert.equal(
      (
        await applyVerifiedPayment(db, payment, {
          eventId: "event-1",
          eventType: "charge.success",
          payloadHash: "hash",
        })
      ).status,
      "confirmed",
    );
    assert.equal(
      (
        await applyVerifiedPayment(db, payment, {
          eventId: "event-1",
          eventType: "charge.success",
          payloadHash: "hash",
        })
      ).replayed,
      true,
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT committed_quantity n FROM variants WHERE id='sample-001-xs'",
          )
          .first()
      ).n,
      1,
    );
    assert.equal(
      (await db.prepare("SELECT COUNT(*) n FROM payment_events").first()).n,
      1,
    );
  } finally {
    await dispose();
  }
});

test("expired reservation releases once and late success reallocates when available", async () => {
  const { db, dispose } = await database();
  try {
    const old = new Date("2026-01-01T00:00:00Z"),
      checkout = await createCheckout(db, input("late-available"), {
        now: old,
      });
    assert.equal(
      (await releaseExpiredReservations(db, "2026-01-01T01:00:00Z")).released,
      1,
    );
    assert.equal(
      (await releaseExpiredReservations(db, "2026-01-01T02:00:00Z")).released,
      0,
    );
    const result = await applyVerifiedPayment(db, verified(checkout));
    assert.equal(result.status, "confirmed");
    assert.equal(result.late, true);
    assert.equal(
      (
        await db
          .prepare(
            "SELECT committed_quantity n FROM variants WHERE id='sample-001-xs'",
          )
          .first()
      ).n,
      1,
    );
  } finally {
    await dispose();
  }
});

test("late success becomes payment exception when capacity was reallocated", async () => {
  const { db, dispose } = await database();
  try {
    await db
      .prepare("UPDATE variants SET capacity=1 WHERE id='sample-001-xs'")
      .run();
    const old = new Date("2026-01-01T00:00:00Z"),
      late = await createCheckout(db, input("late-unavailable"), { now: old });
    await releaseExpiredReservations(db, "2026-01-01T01:00:00Z");
    await createCheckout(db, input("replacement-order"));
    const result = await applyVerifiedPayment(db, verified(late));
    assert.equal(result.status, "payment_exception");
    assert.equal(
      (
        await db
          .prepare("SELECT order_status FROM orders WHERE id=?")
          .bind(late.order_id)
          .first()
      ).order_status,
      "payment_exception",
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT committed_quantity n FROM variants WHERE id='sample-001-xs'",
          )
          .first()
      ).n,
      0,
    );
  } finally {
    await dispose();
  }
});

test("reconciliation does not release capacity while provider verification is uncertain", async () => {
  const { db, dispose } = await database();
  try {
    const old = new Date("2026-01-01T00:00:00Z");
    await createCheckout(db, input("uncertain-provider"), { now: old });
    const result = await reconcileExpiredPayments(
      db,
      async () => {
        throw new Error("provider_unavailable");
      },
      "2026-01-01T01:00:00Z",
    );
    assert.equal(result.deferred, 1);
    assert.equal(result.released, 0);
    assert.equal(
      (await db.prepare("SELECT status FROM reservations").first()).status,
      "active",
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT reserved_quantity n FROM variants WHERE id='sample-001-xs'",
          )
          .first()
      ).n,
      1,
    );
  } finally {
    await dispose();
  }
});
