PRAGMA foreign_keys = ON;

ALTER TABLE products ADD COLUMN care_instructions TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN measurements_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE products ADD COLUMN size_guide_key TEXT NOT NULL DEFAULT 'brand-default';
ALTER TABLE products ADD COLUMN specific_dispatch_date TEXT;
ALTER TABLE products ADD COLUMN featured_order INTEGER;
ALTER TABLE products ADD COLUMN published_at TEXT;
ALTER TABLE products ADD COLUMN archived_at TEXT;

ALTER TABLE product_images ADD COLUMN colour TEXT;

ALTER TABLE orders ADD COLUMN revised_dispatch_min_date TEXT;
ALTER TABLE orders ADD COLUMN revised_dispatch_max_date TEXT;
ALTER TABLE orders ADD COLUMN delay_message TEXT;
ALTER TABLE orders ADD COLUMN courier_name TEXT;
ALTER TABLE orders ADD COLUMN tracking_reference TEXT;
ALTER TABLE orders ADD COLUMN tracking_url TEXT;
ALTER TABLE orders ADD COLUMN internal_notes TEXT;

ALTER TABLE delivery_zones ADD COLUMN transit_day_basis TEXT NOT NULL DEFAULT 'business';

ALTER TABLE notification_outbox ADD COLUMN updated_at TEXT;
ALTER TABLE notification_outbox ADD COLUMN sent_at TEXT;
ALTER TABLE notification_outbox ADD COLUMN last_error TEXT;

CREATE UNIQUE INDEX idx_wishlist_items_unique ON wishlist_items(wishlist_id,product_id);
CREATE INDEX idx_orders_fulfilment_updated ON orders(fulfilment_status,updated_at);
CREATE INDEX idx_products_featured ON products(featured_order,status);
CREATE INDEX idx_admin_audit_entity ON admin_audit_log(entity_type,entity_id,created_at);
