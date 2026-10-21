-- Subscriber accounts for the subscription model.
--
-- The signature in the entitlement cookie is the fast path; this table is
-- the record of truth for renewals, cancellations and emails.

CREATE TABLE IF NOT EXISTS subscribers (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL,
  plan              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active',
  provider          TEXT,
  provider_ref      TEXT,
  current_period_end INTEGER,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);
CREATE INDEX IF NOT EXISTS idx_subscribers_ref ON subscribers(provider_ref);

-- Watchlists: which destinations a subscriber follows.
CREATE TABLE IF NOT EXISTS watchlists (
  subscriber_id TEXT NOT NULL,
  destination   TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (subscriber_id, destination)
);

-- Every price movement, so alerts can be sent and history is auditable.
CREATE TABLE IF NOT EXISTS price_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  destination   TEXT NOT NULL,
  days          INTEGER,
  carrier       TEXT,
  old_price     REAL,
  new_price     REAL,
  currency      TEXT,
  detected_at   TEXT NOT NULL DEFAULT (datetime('now')),
  notified      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_price_events_dest ON price_events(destination);
CREATE INDEX IF NOT EXISTS idx_price_events_date ON price_events(detected_at);
