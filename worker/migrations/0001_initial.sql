CREATE TABLE issuers (
  id TEXT PRIMARY KEY,
  public_user_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX idx_api_keys_issuer_id ON api_keys(issuer_id);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  default_max_devices INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (issuer_id, code)
);

CREATE INDEX idx_products_issuer_id ON products(issuer_id);
CREATE INDEX idx_products_code ON products(code);

CREATE TABLE license_batches (
  id TEXT PRIMARY KEY,
  issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  batch_name TEXT NOT NULL,
  code_prefix TEXT,
  quantity INTEGER NOT NULL,
  max_devices INTEGER NOT NULL,
  expires_at TEXT,
  notes TEXT,
  created_by_api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_license_batches_issuer_id ON license_batches(issuer_id);
CREATE INDEX idx_license_batches_product_id ON license_batches(product_id);

CREATE TABLE licenses (
  id TEXT PRIMARY KEY,
  issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  batch_id TEXT REFERENCES license_batches(id) ON DELETE SET NULL,
  activation_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('available', 'activated', 'disabled', 'revoked')),
  max_devices INTEGER NOT NULL,
  issued_to TEXT,
  metadata_json TEXT,
  expires_at TEXT,
  activated_at TEXT,
  revoked_at TEXT,
  revoked_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_licenses_issuer_id ON licenses(issuer_id);
CREATE INDEX idx_licenses_product_id ON licenses(product_id);
CREATE INDEX idx_licenses_batch_id ON licenses(batch_id);
CREATE INDEX idx_licenses_status ON licenses(status);
CREATE INDEX idx_licenses_activation_code ON licenses(activation_code);

CREATE TABLE activations (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  machine_hash TEXT NOT NULL,
  device_label TEXT,
  client_version TEXT,
  platform TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'deactivated')),
  activated_at TEXT NOT NULL,
  deactivated_at TEXT,
  last_seen_at TEXT,
  license_payload_version INTEGER NOT NULL,
  UNIQUE (license_id, machine_hash)
);

CREATE INDEX idx_activations_license_id ON activations(license_id);
CREATE INDEX idx_activations_machine_hash ON activations(machine_hash);
CREATE INDEX idx_activations_status ON activations(status);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  issuer_id TEXT REFERENCES issuers(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('admin', 'system', 'client')),
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_audit_logs_issuer_id ON audit_logs(issuer_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
