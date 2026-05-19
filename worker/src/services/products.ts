import { createProductSchema, updateProductSchema } from "../../../shared/src/schemas";
import type { ProductRow } from "../db/models";
import { all, first, nowIso, run } from "../db/d1";
import { ApiError } from "../utils/http";
import { createId } from "../utils/id";
import type { AdminActor } from "../types";
import { auditActorFromAdminActor, writeAuditLog } from "./audit";

interface ResolvedTrial {
  enabled: boolean;
  start_at: string | null;
  end_at: string | null;
  ttl_seconds: number | null;
}

function pick<T>(next: T | undefined, prev: T | null | undefined): T | null {
  if (next !== undefined) return next;
  return prev ?? null;
}

function resolveTrialFields(
  input: {
    trial_enabled?: boolean;
    trial_start_at?: string | null;
    trial_end_at?: string | null;
    trial_token_ttl_seconds?: number | null;
  },
  existing?: ProductRow
): ResolvedTrial {
  const enabled = input.trial_enabled ?? (existing ? existing.trial_enabled === 1 : false);
  const start_at = pick(input.trial_start_at, existing?.trial_start_at);
  const end_at = pick(input.trial_end_at, existing?.trial_end_at);
  const ttl_seconds = pick(input.trial_token_ttl_seconds, existing?.trial_token_ttl_seconds);

  if (enabled) {
    if (!start_at || !end_at || ttl_seconds === null) {
      throw new ApiError(
        400,
        "TRIAL_CONFIG_INCOMPLETE",
        "trial_enabled requires trial_start_at, trial_end_at, and trial_token_ttl_seconds"
      );
    }
    if (Date.parse(start_at) >= Date.parse(end_at)) {
      throw new ApiError(400, "TRIAL_CONFIG_INVALID", "trial_start_at must be before trial_end_at");
    }
  }

  return { enabled, start_at, end_at, ttl_seconds };
}

export async function listProducts(db: D1Database, issuerId: string): Promise<ProductRow[]> {
  return all<ProductRow>(
    db
      .prepare("SELECT * FROM products WHERE issuer_id = ? ORDER BY created_at DESC")
      .bind(issuerId)
  );
}

export async function createProduct(
  db: D1Database,
  issuerId: string,
  actor: AdminActor,
  body: unknown
): Promise<ProductRow> {
  const input = createProductSchema.parse(body);
  const trial = resolveTrialFields(input);
  const now = nowIso();
  const id = createId("prd");

  try {
    await run(
      db
        .prepare(
          `INSERT INTO products
            (id, issuer_id, code, name, description, status, default_max_devices,
             trial_enabled, trial_start_at, trial_end_at, trial_token_ttl_seconds,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          issuerId,
          input.code,
          input.name,
          input.description,
          input.default_max_devices,
          trial.enabled ? 1 : 0,
          trial.start_at,
          trial.end_at,
          trial.ttl_seconds,
          now,
          now
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
    ...auditActorFromAdminActor(actor),
    action: "product.create",
    targetType: "product",
    targetId: id,
    details: { code: input.code, trial_enabled: trial.enabled }
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
  actor: AdminActor,
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

  const trial = resolveTrialFields(input, existing);

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
           SET code = ?, name = ?, description = ?, status = ?, default_max_devices = ?,
               trial_enabled = ?, trial_start_at = ?, trial_end_at = ?, trial_token_ttl_seconds = ?,
               updated_at = ?
           WHERE id = ? AND issuer_id = ?`
        )
        .bind(
          next.code,
          next.name,
          next.description,
          next.status,
          next.default_max_devices,
          trial.enabled ? 1 : 0,
          trial.start_at,
          trial.end_at,
          trial.ttl_seconds,
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
    ...auditActorFromAdminActor(actor),
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
