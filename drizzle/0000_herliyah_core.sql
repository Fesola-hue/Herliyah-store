PRAGMA foreign_keys = ON;

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  price_kobo INTEGER NOT NULL CHECK (price_kobo >= 0),
  status TEXT NOT NULL CHECK (status IN ('draft','published','archived')),
  is_sample INTEGER NOT NULL DEFAULT 1 CHECK (is_sample IN (0,1)),
  preparation_min_days INTEGER NOT NULL CHECK (preparation_min_days > 0),
  preparation_max_days INTEGER NOT NULL CHECK (preparation_max_days >= preparation_min_days),
  preparation_day_basis TEXT NOT NULL CHECK (preparation_day_basis IN ('business','calendar')),
  preparation_trigger TEXT NOT NULL DEFAULT 'verified_payment',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE product_images (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), object_key TEXT NOT NULL UNIQUE, alt_text TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, is_cover INTEGER NOT NULL DEFAULT 0 CHECK(is_cover IN(0,1)), created_at TEXT NOT NULL);
CREATE TABLE variants (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), sku TEXT NOT NULL UNIQUE, size TEXT NOT NULL, colour TEXT NOT NULL, capacity INTEGER NOT NULL CHECK(capacity >= 0), reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK(reserved_quantity >= 0), committed_quantity INTEGER NOT NULL DEFAULT 0 CHECK(committed_quantity >= 0), preorder_open INTEGER NOT NULL DEFAULT 1 CHECK(preorder_open IN(0,1)), UNIQUE(product_id,size,colour), CHECK(reserved_quantity + committed_quantity <= capacity));
CREATE TRIGGER variants_capacity_guard BEFORE UPDATE OF capacity,reserved_quantity,committed_quantity ON variants WHEN NEW.reserved_quantity + NEW.committed_quantity > NEW.capacity BEGIN SELECT RAISE(ABORT,'capacity_exceeded'); END;
CREATE TABLE customers (id TEXT PRIMARY KEY, auth_subject TEXT UNIQUE, verified_email TEXT UNIQUE, created_at TEXT NOT NULL);
CREATE TABLE orders (id TEXT PRIMARY KEY, order_number TEXT NOT NULL UNIQUE, customer_id TEXT REFERENCES customers(id), email TEXT NOT NULL, full_name TEXT NOT NULL, phone TEXT NOT NULL, address_snapshot_json TEXT NOT NULL, subtotal_kobo INTEGER NOT NULL, delivery_kobo INTEGER NOT NULL, total_kobo INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'NGN', order_status TEXT NOT NULL, fulfilment_status TEXT NOT NULL, delivery_rule_snapshot_json TEXT NOT NULL, dispatch_min_date TEXT, dispatch_max_date TEXT, guest_access_token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), variant_id TEXT NOT NULL REFERENCES variants(id), quantity INTEGER NOT NULL CHECK(quantity > 0), title_snapshot TEXT NOT NULL, sku_snapshot TEXT NOT NULL, size_snapshot TEXT NOT NULL, colour_snapshot TEXT NOT NULL, unit_price_kobo INTEGER NOT NULL, lead_time_snapshot_json TEXT NOT NULL, original_dispatch_window_json TEXT NOT NULL);
CREATE TABLE reservations (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), status TEXT NOT NULL CHECK(status IN('active','consumed','released')), expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE reservation_items (reservation_id TEXT NOT NULL REFERENCES reservations(id), variant_id TEXT NOT NULL REFERENCES variants(id), quantity INTEGER NOT NULL CHECK(quantity > 0), PRIMARY KEY(reservation_id,variant_id));
CREATE TABLE payment_attempts (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), provider TEXT NOT NULL DEFAULT 'paystack', reference TEXT NOT NULL UNIQUE, idempotency_key TEXT NOT NULL UNIQUE, amount_kobo INTEGER NOT NULL, currency TEXT NOT NULL, environment TEXT NOT NULL CHECK(environment IN('test','live')), status TEXT NOT NULL CHECK(status IN('initiated','pending','succeeded','failed','exception')), provider_payload_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE order_status_events (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), dimension TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL, customer_message TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE capacity_movements (id TEXT PRIMARY KEY, variant_id TEXT NOT NULL REFERENCES variants(id), delta INTEGER NOT NULL, reason TEXT NOT NULL, reference_type TEXT NOT NULL, reference_id TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE wishlists (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL UNIQUE REFERENCES customers(id), created_at TEXT NOT NULL);
CREATE TABLE wishlist_items (wishlist_id TEXT NOT NULL REFERENCES wishlists(id), product_id TEXT NOT NULL REFERENCES products(id), created_at TEXT NOT NULL, PRIMARY KEY(wishlist_id,product_id));
CREATE TABLE order_claims (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, claimed_by_customer_id TEXT REFERENCES customers(id), claimed_at TEXT);
CREATE TABLE delivery_zones (id TEXT PRIMARY KEY, name TEXT NOT NULL, fee_kobo INTEGER NOT NULL CHECK(fee_kobo >= 0), transit_min_days INTEGER NOT NULL, transit_max_days INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 0 CHECK(active IN(0,1)));
CREATE TABLE notification_outbox (id TEXT PRIMARY KEY, event_key TEXT NOT NULL UNIQUE, event_type TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE admin_audit_log (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, before_json TEXT, after_json TEXT, reason TEXT, created_at TEXT NOT NULL);
CREATE TABLE store_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX idx_products_status_category ON products(status,category);
CREATE INDEX idx_variants_product ON variants(product_id);
CREATE INDEX idx_orders_email_created ON orders(email,created_at);
CREATE INDEX idx_orders_status_updated ON orders(order_status,updated_at);
CREATE INDEX idx_reservations_status_expiry ON reservations(status,expires_at);
CREATE INDEX idx_payment_attempts_order ON payment_attempts(order_id);
CREATE INDEX idx_outbox_status_next ON notification_outbox(status,next_attempt_at);
PRAGMA optimize;
