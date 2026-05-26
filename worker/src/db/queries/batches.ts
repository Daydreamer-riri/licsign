import { first, all } from "../d1";
import { createId } from "../../utils/id";

export async function insertBatchWithLicenses(
  db: D1Database,
  batch: {
    id: string;
    issuerId: string;
    productId: string;
    batchName: string;
    codePrefix: string | null;
    quantity: number;
    maxDevices: number;
    expiresAt: string | null;
    validityDurationSeconds: number | null;
    notes: string | null;
    apiKeyId: string | null;
    adminId: string | null;
    now: string;
  },
  codes: string[],
): Promise<void> {
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO license_batches
          (id, issuer_id, product_id, batch_name, code_prefix, quantity, max_devices, expires_at,
           validity_duration_seconds, notes, created_by_api_key_id, created_by_admin_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        batch.id,
        batch.issuerId,
        batch.productId,
        batch.batchName,
        batch.codePrefix,
        batch.quantity,
        batch.maxDevices,
        batch.expiresAt,
        batch.validityDurationSeconds,
        batch.notes,
        batch.apiKeyId,
        batch.adminId,
        batch.now,
      ),
  ];

  for (const code of codes) {
    statements.push(
      db
        .prepare(
          `INSERT INTO licenses
            (id, issuer_id, product_id, batch_id, activation_code, status, max_devices, expires_at,
             validity_duration_seconds, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'available', ?, ?, ?, ?, ?)`,
        )
        .bind(
          createId("lic"),
          batch.issuerId,
          batch.productId,
          batch.id,
          code,
          batch.maxDevices,
          batch.expiresAt,
          batch.validityDurationSeconds,
          batch.now,
          batch.now,
        ),
    );
  }

  for (let index = 0; index < statements.length; index += 100) {
    await db.batch(statements.slice(index, index + 100));
  }
}

export async function list(
  db: D1Database,
  issuerId: string,
): Promise<Record<string, unknown>[]> {
  return all(
    db
      .prepare(
        `SELECT license_batches.*, products.code AS product_code, products.name AS product_name
         FROM license_batches
         JOIN products ON products.id = license_batches.product_id
         WHERE license_batches.issuer_id = ?
         ORDER BY license_batches.created_at DESC`,
      )
      .bind(issuerId),
  );
}

export async function findById(
  db: D1Database,
  batchId: string,
  issuerId: string,
): Promise<Record<string, unknown> | null> {
  return first(
    db
      .prepare(
        `SELECT license_batches.*, products.code AS product_code, products.name AS product_name
         FROM license_batches
         JOIN products ON products.id = license_batches.product_id
         WHERE license_batches.id = ? AND license_batches.issuer_id = ?`,
      )
      .bind(batchId, issuerId),
  );
}

export async function listLicensesByBatch(
  db: D1Database,
  batchId: string,
  issuerId: string,
): Promise<Record<string, unknown>[]> {
  return all(
    db
      .prepare(
        `SELECT id, activation_code, status, max_devices, expires_at, validity_duration_seconds,
                activated_at, created_at
         FROM licenses
         WHERE batch_id = ? AND issuer_id = ?
         ORDER BY created_at ASC`,
      )
      .bind(batchId, issuerId),
  );
}
