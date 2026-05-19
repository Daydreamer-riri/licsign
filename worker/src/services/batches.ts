import { createBatchSchema } from "../../../shared/src/schemas";
import type { ProductRow } from "../db/models";
import { all, first, nowIso } from "../db/d1";
import { ApiError } from "../utils/http";
import { createId } from "../utils/id";
import type { AdminActor } from "../types";
import { auditActorFromAdminActor, writeAuditLog } from "./audit";
import { generateActivationCode } from "./codeGenerator";

function batchCreatorFromActor(actor: AdminActor): { apiKeyId: string | null; adminId: string | null } {
  return actor.type === "api_key"
    ? { apiKeyId: actor.apiKeyId, adminId: null }
    : { apiKeyId: null, adminId: actor.adminId };
}

export async function createBatch(db: D1Database, issuerId: string, actor: AdminActor, body: unknown) {
  const input = createBatchSchema.parse(body);
  const product = await first<ProductRow>(
    db.prepare("SELECT * FROM products WHERE id = ? AND issuer_id = ?").bind(input.product_id, issuerId)
  );
  if (!product) {
    throw new ApiError(404, "NOT_FOUND", "Product not found");
  }
  if (product.status !== "active") {
    throw new ApiError(409, "PRODUCT_ARCHIVED", "Cannot create a batch for an archived product");
  }

  const batchId = createId("bat");
  const now = nowIso();
  const maxDevices = input.max_devices ?? product.default_max_devices;
  const codes = new Set<string>();
  const creator = batchCreatorFromActor(actor);
  while (codes.size < input.quantity) {
    codes.add(generateActivationCode(input.code_prefix));
  }

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO license_batches
          (id, issuer_id, product_id, batch_name, code_prefix, quantity, max_devices, expires_at, notes,
           created_by_api_key_id, created_by_admin_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        batchId,
        issuerId,
        product.id,
        input.batch_name,
        input.code_prefix ?? null,
        input.quantity,
        maxDevices,
        input.expires_at ?? null,
        input.notes ?? null,
        creator.apiKeyId,
        creator.adminId,
        now
      )
  ];

  for (const code of codes) {
    statements.push(
      db
        .prepare(
          `INSERT INTO licenses
            (id, issuer_id, product_id, batch_id, activation_code, status, max_devices, expires_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'available', ?, ?, ?, ?)`
        )
        .bind(createId("lic"), issuerId, product.id, batchId, code, maxDevices, input.expires_at ?? null, now, now)
    );
  }

  try {
    for (let index = 0; index < statements.length; index += 100) {
      await db.batch(statements.slice(index, index + 100));
    }
  } catch (error) {
    if (String(error).includes("UNIQUE")) {
      throw new ApiError(409, "CODE_COLLISION", "Activation code collision; retry batch creation");
    }
    throw error;
  }

  await writeAuditLog(db, {
    issuerId,
    ...auditActorFromAdminActor(actor),
    action: "batch.create",
    targetType: "batch",
    targetId: batchId,
    details: { product_id: product.id, quantity: input.quantity }
  });

  return {
    id: batchId,
    product_id: product.id,
    product_code: product.code,
    batch_name: input.batch_name,
    quantity: input.quantity,
    max_devices: maxDevices,
    expires_at: input.expires_at ?? null,
    activation_codes: [...codes],
    csv: buildCodesCsv([...codes], product.code)
  };
}

export async function listBatches(db: D1Database, issuerId: string) {
  return all(
    db
      .prepare(
        `SELECT license_batches.*, products.code AS product_code, products.name AS product_name
         FROM license_batches
         JOIN products ON products.id = license_batches.product_id
         WHERE license_batches.issuer_id = ?
         ORDER BY license_batches.created_at DESC`
      )
      .bind(issuerId)
  );
}

export async function readBatch(db: D1Database, issuerId: string, batchId: string) {
  const batch = await first(
    db
      .prepare(
        `SELECT license_batches.*, products.code AS product_code, products.name AS product_name
         FROM license_batches
         JOIN products ON products.id = license_batches.product_id
         WHERE license_batches.id = ? AND license_batches.issuer_id = ?`
      )
      .bind(batchId, issuerId)
  );
  if (!batch) {
    throw new ApiError(404, "NOT_FOUND", "Batch not found");
  }

  const licenses = await all(
    db
      .prepare(
        `SELECT id, activation_code, status, max_devices, expires_at, activated_at, created_at
         FROM licenses
         WHERE batch_id = ? AND issuer_id = ?
         ORDER BY created_at ASC`
      )
      .bind(batchId, issuerId)
  );

  return { batch, licenses };
}

function buildCodesCsv(codes: string[], productCode: string): string {
  const rows = ["product_code,activation_code", ...codes.map((code) => `${productCode},${code}`)];
  return rows.join("\n");
}
