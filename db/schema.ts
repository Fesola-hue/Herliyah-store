import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull(),
  priceKobo: integer("price_kobo").notNull(),
  status: text("status", { enum: ["draft", "published", "archived"] }).notNull(),
  isSample: integer("is_sample", { mode: "boolean" }).notNull().default(true),
  preparationMinDays: integer("preparation_min_days").notNull(),
  preparationMaxDays: integer("preparation_max_days").notNull(),
  preparationDayBasis: text("preparation_day_basis", { enum: ["business", "calendar"] }).notNull(),
  preparationTrigger: text("preparation_trigger").notNull().default("verified_payment"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  check("products_price_nonnegative", sql`${table.priceKobo} >= 0`),
  check("products_preparation_range", sql`${table.preparationMinDays} > 0 AND ${table.preparationMaxDays} >= ${table.preparationMinDays}`),
  index("idx_products_status_category").on(table.status, table.category),
]);

export const productImages = sqliteTable("product_images", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => products.id),
  objectKey: text("object_key").notNull().unique(),
  altText: text("alt_text").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isCover: integer("is_cover", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const variants = sqliteTable("variants", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => products.id),
  sku: text("sku").notNull().unique(),
  size: text("size").notNull(),
  colour: text("colour").notNull(),
  capacity: integer("capacity").notNull(),
  reservedQuantity: integer("reserved_quantity").notNull().default(0),
  committedQuantity: integer("committed_quantity").notNull().default(0),
  preorderOpen: integer("preorder_open", { mode: "boolean" }).notNull().default(true),
}, table => [
  uniqueIndex("variants_product_size_colour").on(table.productId, table.size, table.colour),
  index("idx_variants_product").on(table.productId),
  check("variants_capacity_nonnegative", sql`${table.capacity} >= 0`),
  check("variants_allocated_within_capacity", sql`${table.reservedQuantity} + ${table.committedQuantity} <= ${table.capacity}`),
]);

export const capacityMovements = sqliteTable("capacity_movements", {
  id: text("id").primaryKey(),
  variantId: text("variant_id").notNull().references(() => variants.id),
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
