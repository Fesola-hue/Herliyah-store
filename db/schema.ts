import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull(),
    priceKobo: integer("price_kobo").notNull(),
    status: text("status", {
      enum: ["draft", "published", "archived"],
    }).notNull(),
    isSample: integer("is_sample", { mode: "boolean" }).notNull().default(true),
    preparationMinDays: integer("preparation_min_days").notNull(),
    preparationMaxDays: integer("preparation_max_days").notNull(),
    preparationDayBasis: text("preparation_day_basis", {
      enum: ["business", "calendar"],
    }).notNull(),
    preparationTrigger: text("preparation_trigger")
      .notNull()
      .default("verified_payment"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check("products_price_nonnegative", sql`${table.priceKobo} >= 0`),
    check(
      "products_preparation_range",
      sql`${table.preparationMinDays} > 0 AND ${table.preparationMaxDays} >= ${table.preparationMinDays}`,
    ),
    index("idx_products_status_category").on(table.status, table.category),
  ],
);

export const productImages = sqliteTable("product_images", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  objectKey: text("object_key").notNull().unique(),
  altText: text("alt_text").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isCover: integer("is_cover", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const variants = sqliteTable(
  "variants",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    sku: text("sku").notNull().unique(),
    size: text("size").notNull(),
    colour: text("colour").notNull(),
    capacity: integer("capacity").notNull(),
    reservedQuantity: integer("reserved_quantity").notNull().default(0),
    committedQuantity: integer("committed_quantity").notNull().default(0),
    preorderOpen: integer("preorder_open", { mode: "boolean" })
      .notNull()
      .default(true),
  },
  (table) => [
    uniqueIndex("variants_product_size_colour").on(
      table.productId,
      table.size,
      table.colour,
    ),
    index("idx_variants_product").on(table.productId),
    check("variants_capacity_nonnegative", sql`${table.capacity} >= 0`),
    check(
      "variants_allocated_within_capacity",
      sql`${table.reservedQuantity} + ${table.committedQuantity} <= ${table.capacity}`,
    ),
  ],
);

export const capacityMovements = sqliteTable("capacity_movements", {
  id: text("id").primaryKey(),
  variantId: text("variant_id")
    .notNull()
    .references(() => variants.id),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  referenceType: text("reference_type").notNull(),
  referenceId: text("reference_id").notNull(),
  actorId: text("actor_id").notNull(),
  createdAt: text("created_at").notNull(),
});

export const adminAuditLog = sqliteTable("admin_audit_log", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  reason: text("reason"),
  createdAt: text("created_at").notNull(),
});

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  authSubject: text("auth_subject").unique(),
  verifiedEmail: text("verified_email").unique(),
  createdAt: text("created_at").notNull(),
});

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    orderNumber: text("order_number").notNull().unique(),
    customerId: text("customer_id").references(() => customers.id),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    addressSnapshotJson: text("address_snapshot_json").notNull(),
    subtotalKobo: integer("subtotal_kobo").notNull(),
    deliveryKobo: integer("delivery_kobo").notNull(),
    totalKobo: integer("total_kobo").notNull(),
    currency: text("currency").notNull().default("NGN"),
    orderStatus: text("order_status").notNull(),
    fulfilmentStatus: text("fulfilment_status").notNull(),
    deliveryRuleSnapshotJson: text("delivery_rule_snapshot_json").notNull(),
    dispatchMinDate: text("dispatch_min_date"),
    dispatchMaxDate: text("dispatch_max_date"),
    guestAccessTokenHash: text("guest_access_token_hash").notNull().unique(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_orders_email_created").on(table.email, table.createdAt),
    index("idx_orders_status_updated").on(table.orderStatus, table.updatedAt),
  ],
);

export const orderItems = sqliteTable("order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id),
  variantId: text("variant_id")
    .notNull()
    .references(() => variants.id),
  quantity: integer("quantity").notNull(),
  titleSnapshot: text("title_snapshot").notNull(),
  skuSnapshot: text("sku_snapshot").notNull(),
  sizeSnapshot: text("size_snapshot").notNull(),
  colourSnapshot: text("colour_snapshot").notNull(),
  unitPriceKobo: integer("unit_price_kobo").notNull(),
  leadTimeSnapshotJson: text("lead_time_snapshot_json").notNull(),
  originalDispatchWindowJson: text("original_dispatch_window_json").notNull(),
});

export const reservations = sqliteTable(
  "reservations",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    status: text("status", {
      enum: ["active", "consumed", "released"],
    }).notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_reservations_status_expiry").on(table.status, table.expiresAt),
  ],
);

export const reservationItems = sqliteTable("reservation_items", {
  reservationId: text("reservation_id")
    .notNull()
    .references(() => reservations.id),
  variantId: text("variant_id")
    .notNull()
    .references(() => variants.id),
  quantity: integer("quantity").notNull(),
});

export const paymentAttempts = sqliteTable(
  "payment_attempts",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    provider: text("provider").notNull().default("paystack"),
    reference: text("reference").notNull().unique(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    amountKobo: integer("amount_kobo").notNull(),
    currency: text("currency").notNull(),
    environment: text("environment", { enum: ["test", "live"] }).notNull(),
    status: text("status", {
      enum: ["initiated", "pending", "succeeded", "failed", "exception"],
    }).notNull(),
    providerPayloadJson: text("provider_payload_json"),
    authorizationUrl: text("authorization_url"),
    accessCode: text("access_code"),
    failureReason: text("failure_reason"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_payment_attempts_order").on(table.orderId)],
);

export const paymentEvents = sqliteTable(
  "payment_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull().unique(),
    reference: text("reference").notNull(),
    eventType: text("event_type").notNull(),
    payloadHash: text("payload_hash").notNull(),
    outcome: text("outcome").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_payment_events_reference").on(table.reference, table.createdAt),
  ],
);

export const refunds = sqliteTable(
  "refunds",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    paymentAttemptId: text("payment_attempt_id")
      .notNull()
      .references(() => paymentAttempts.id),
    providerReference: text("provider_reference").unique(),
    amountKobo: integer("amount_kobo").notNull(),
    currency: text("currency").notNull().default("NGN"),
    status: text("status", {
      enum: ["requested", "processing", "succeeded", "failed"],
    }).notNull(),
    reason: text("reason").notNull(),
    providerPayloadJson: text("provider_payload_json"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_refunds_order_created").on(table.orderId, table.createdAt),
  ],
);

export const orderStatusEvents = sqliteTable("order_status_events", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id),
  dimension: text("dimension").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  customerMessage: text("customer_message"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});

export const wishlists = sqliteTable("wishlists", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .unique()
    .references(() => customers.id),
  createdAt: text("created_at").notNull(),
});
export const wishlistItems = sqliteTable("wishlist_items", {
  wishlistId: text("wishlist_id")
    .notNull()
    .references(() => wishlists.id),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  createdAt: text("created_at").notNull(),
});
export const orderClaims = sqliteTable("order_claims", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  claimedByCustomerId: text("claimed_by_customer_id").references(
    () => customers.id,
  ),
  claimedAt: text("claimed_at"),
});
export const deliveryZones = sqliteTable("delivery_zones", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  feeKobo: integer("fee_kobo").notNull(),
  transitMinDays: integer("transit_min_days").notNull(),
  transitMaxDays: integer("transit_max_days").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(false),
});
export const notificationOutbox = sqliteTable(
  "notification_outbox",
  {
    id: text("id").primaryKey(),
    eventKey: text("event_key").notNull().unique(),
    eventType: text("event_type").notNull(),
    payloadJson: text("payload_json").notNull(),
    status: text("status").notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: text("next_attempt_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_outbox_status_next").on(table.status, table.nextAttemptAt),
  ],
);
export const storeSettings = sqliteTable("store_settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});
