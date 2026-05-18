import { createProductSchema, updateProductSchema } from "../../../shared/src/schemas";
import type { ProductRow } from "../db/models";
import { all, first, nowIso, run } from "../db/d1";
import { ApiError } from "../utils/http";
import { createId } from "../utils/id";
import { writeAuditLog } from "./audit";

export async function listProducts(db: D1Database, issuerId: string): Promise<ProductRow[]> {
  return all<ProductRow>(
    db
      .prepare("SELECT * FROM products WHERE issuer_id = ? ORDER BY created_at DESC")
      .bind(issuerId)
  );
}

export async function createProduct(db: D1Database, issuerId: string, actorId: string, body: unknown): Promise<ProductRow> {
  const input = createProductSchema.parse(body);
  const now = nowIso();
  const id = createId("prd");

  try {
    await run(
      db
        .prepare(
          `INSERT INTO products
            (id, issuer_id, code, name, description, status, default_max_devices, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`
        )
        .bind(id, issuerId, input.code, input.name, input.description, input.default_max_devices, now, now)
    );
  } catch (error) {
    if (String(error).includes("UNIQUE")) {
      throw new ApiError(409, "PRODUCT_EXISTS", "Product code already exists");
    }
    throw error;
  }

  await writeAuditLog(db, {
    issuerId,
    actorType: "admin",
    actorId,
    action: "product.create",
    targetType: "product",
    targetId: id,
    details: { code: input.code }
  });

  const product = await first<ProductRow>(db.prepare("SELECT * FROM products WHERE id = ?").bind(id));
  if (!product) {
    throw new ApiError(500, "SERVER_ERROR", "Product creation failed");
  }
  return product;
}

export async function updateProduct(
  db: D1Database,
  issuerId: string,
  actorId: string,
  productId: string,
  body: unknown
): Promise<ProductRow> {
  const input = updateProductSchema.parse(body);
  const existing = await first<ProductRow>(
    db.prepare("SELECT * FROM products WHERE id = ? AND issuer_id = ?").bind(productId, issuerId)
  );
  if (!existing) {
    throw new ApiError(404, "NOT_FOUND", "Product not found");
  }

  const next = {
    code: input.code ?? existing.code,
    name: input.name ?? existing.name,
    description: input.description ?? existing.description,
    status: input.status ?? existing.status,
    default_max_devices: input.default_max_devices ?? existing.default_max_devices
  };

  try {
    await run(
      db
        .prepare(
          `UPDATE products
           SET code = ?, name = ?, description = ?, status = ?, default_max_devices = ?, updated_at = ?
           WHERE id = ? AND issuer_id = ?`
        )
        .bind(
          next.code,
          next.name,
          next.description,
          next.status,
          next.default_max_devices,
          nowIso(),
          productId,
          issuerId
        )
    );
  } catch (error) {
    if (String(error).includes("UNIQUE")) {
      throw new ApiError(409, "PRODUCT_EXISTS", "Product code already exists");
    }
    throw error;
  }

  await writeAuditLog(db, {
    issuerId,
    actorType: "admin",
    actorId,
    action: "product.update",
    targetType: "product",
    targetId: productId,
    details: input
  });

  const product = await first<ProductRow>(db.prepare("SELECT * FROM products WHERE id = ?").bind(productId));
  if (!product) {
    throw new ApiError(500, "SERVER_ERROR", "Product update failed");
  }
  return product;
}
