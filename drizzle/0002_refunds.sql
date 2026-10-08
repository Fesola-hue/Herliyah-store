PRAGMA foreign_keys = ON;

CREATE TABLE refunds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  payment_attempt_id TEXT NOT NULL REFERENCES payment_attempts(id),
  provider_reference TEXT UNIQUE,
  amount_kobo INTEGER NOT NULL CHECK(amount_kobo > 0),
  currency TEXT NOT NULL DEFAULT 'NGN',
  status TEXT NOT NULL CHECK(status IN('requested','processing','succeeded','failed')),
  reason TEXT NOT NULL,
  provider_payload_json TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_refunds_order_created ON refunds(order_id,created_at);
