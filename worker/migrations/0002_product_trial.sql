ALTER TABLE products ADD COLUMN trial_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN trial_start_at TEXT;
ALTER TABLE products ADD COLUMN trial_end_at TEXT;
ALTER TABLE products ADD COLUMN trial_token_ttl_seconds INTEGER;

CREATE TABLE trial_activations (
  id TEXT PRIMARY KEY,
  issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  machine_hash TEXT NOT NULL,
  device_label TEXT,
  client_version TEXT,
  platform TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_token_expires_at TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 1,
  UNIQUE (product_id, machine_hash)
);

CREATE INDEX idx_trial_activations_issuer_id ON trial_activations(issuer_id);
CREATE INDEX idx_trial_activations_product_id ON trial_activations(product_id);
CREATE INDEX idx_trial_activations_machine_hash ON trial_activations(machine_hash);
