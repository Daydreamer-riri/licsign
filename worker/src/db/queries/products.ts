import { first, all, run } from "../d1";
import type { ProductRow } from "../models";

export interface ProductWithLicenseCount extends ProductRow {
  license_count: number;
}

export async function list(
  db: D1Database,
  issuerId: string,
): Promise<ProductWithLicenseCount[]> {
  return all<ProductWithLicenseCount>(
    db
      .prepare(
        `SELECT products.*, COALESCE(counts.license_count, 0) AS license_count
         FROM products
         LEFT JOIN (
           SELECT product_id, COUNT(*) AS license_count
           FROM licenses
           WHERE issuer_id = ?
           GROUP BY product_id
         ) counts ON counts.product_id = products.id
         WHERE products.issuer_id = ?
         ORDER BY products.created_at DESC`,
      )
      .bind(issuerId, issuerId),
  );
}

export async function findById(
  db: D1Database,
  productId: string,
  issuerId: string,
): Promise<ProductRow | null> {
  return first<ProductRow>(
    db
      .prepare("SELECT * FROM products WHERE id = ? AND issuer_id = ?")
      .bind(productId, issuerId),
  );
}

export async function insert(
  db: D1Database,
  params: {
    id: string;
    issuerId: string;
    code: string;
    name: string;
    description: string;
    defaultMaxDevices: number;
    trialEnabled: boolean;
    trialStartAt: string | null;
    trialEndAt: string | null;
    trialTtlSeconds: number | null;
    now: string;
  },
): Promise<void> {
  await run(
    db
      .prepare(
        `INSERT INTO products
          (id, issuer_id, code, name, description, status, default_max_devices,
           trial_enabled, trial_start_at, trial_end_at, trial_token_ttl_seconds,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        params.id,
        params.issuerId,
        params.code,
        params.name,
        params.description,
        params.defaultMaxDevices,
        params.trialEnabled ? 1 : 0,
        params.trialStartAt,
        params.trialEndAt,
        params.trialTtlSeconds,
        params.now,
        params.now,
      ),
  );
}

export async function update(
  db: D1Database,
  productId: string,
  issuerId: string,
  params: {
    code: string;
    name: string;
    description: string;
    status: string;
    defaultMaxDevices: number;
    trialEnabled: boolean;
    trialStartAt: string | null;
    trialEndAt: string | null;
    trialTtlSeconds: number | null;
    now: string;
  },
): Promise<void> {
  await run(
    db
      .prepare(
        `UPDATE products
         SET code = ?, name = ?, description = ?, status = ?, default_max_devices = ?,
             trial_enabled = ?, trial_start_at = ?, trial_end_at = ?, trial_token_ttl_seconds = ?,
             updated_at = ?
         WHERE id = ? AND issuer_id = ?`,
      )
      .bind(
        params.code,
        params.name,
        params.description,
        params.status,
        params.defaultMaxDevices,
        params.trialEnabled ? 1 : 0,
        params.trialStartAt,
        params.trialEndAt,
        params.trialTtlSeconds,
        params.now,
        productId,
        issuerId,
      ),
  );
}

export async function findByIdSimple(
  db: D1Database,
  productId: string,
): Promise<ProductRow | null> {
  return first<ProductRow>(
    db.prepare("SELECT * FROM products WHERE id = ?").bind(productId),
  );
}

export async function findByCode(
  db: D1Database,
  code: string,
): Promise<ProductRow | null> {
  return first<ProductRow>(
    db.prepare("SELECT * FROM products WHERE code = ?").bind(code),
  );
}
