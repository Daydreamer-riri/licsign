import { createBatchSchema } from "../../../shared/src/schemas";
import type { ProductRow } from "../db/models";
import * as productQueries from "../db/queries/products";
import * as batchQueries from "../db/queries/batches";
import { nowIso } from "../utils/time";
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
  const product = await productQueries.findById(db, input.product_id, issuerId);
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

  try {
    await batchQueries.insertBatchWithLicenses(db, {
      id: batchId,
      issuerId,
      productId: product.id,
      batchName: input.batch_name,
      codePrefix: input.code_prefix ?? null,
      quantity: input.quantity,
      maxDevices: maxDevices,
      expiresAt: input.expires_at ?? null,
      notes: input.notes ?? null,
      apiKeyId: creator.apiKeyId,
      adminId: creator.adminId,
      now,
    }, [...codes]);
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
  return batchQueries.list(db, issuerId);
}

export async function readBatch(db: D1Database, issuerId: string, batchId: string) {
  const batch = await batchQueries.findById(db, batchId, issuerId);
  if (!batch) {
    throw new ApiError(404, "NOT_FOUND", "Batch not found");
  }

  const licenses = await batchQueries.listLicensesByBatch(db, batchId, issuerId);

  return { batch, licenses };
}

function buildCodesCsv(codes: string[], productCode: string): string {
  const rows = ["product_code,activation_code", ...codes.map((code) => `${productCode},${code}`)];
  return rows.join("\n");
}
