PRAGMA foreign_keys = ON;

ALTER TABLE payment_attempts ADD COLUMN authorization_url TEXT;
ALTER TABLE payment_attempts ADD COLUMN access_code TEXT;
ALTER TABLE payment_attempts ADD COLUMN failure_reason TEXT;

CREATE TABLE payment_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL UNIQUE,
  reference TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  outcome TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_payment_events_reference ON payment_events(reference,created_at);

CREATE TRIGGER variants_reservation_open_guard
BEFORE UPDATE OF reserved_quantity ON variants
WHEN NEW.reserved_quantity > OLD.reserved_quantity AND OLD.preorder_open = 0
BEGIN
  SELECT RAISE(ABORT,'preorders_closed');
END;
