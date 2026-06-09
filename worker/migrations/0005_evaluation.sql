-- Evaluation: per-device one-shot free assessment period, configured per-product.
-- See docs/prd-evaluation.md for design rationale.

ALTER TABLE products ADD COLUMN evaluation_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN evaluation_token_ttl_days INTEGER;

CREATE TABLE evaluation_activations (
  id TEXT PRIMARY KEY,
  issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  machine_hash TEXT NOT NULL,
  first_issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE (product_id, machine_hash)
);

CREATE INDEX idx_evaluation_activations_issuer_id ON evaluation_activations(issuer_id);
CREATE INDEX idx_evaluation_activations_product_id ON evaluation_activations(product_id);
