import { first, run } from "../d1";
import type { EvaluationActivationRow } from "../models";

export async function findByProductAndMachine(
  db: D1Database,
  productId: string,
  machineHash: string
): Promise<EvaluationActivationRow | null> {
  return first<EvaluationActivationRow>(
    db
      .prepare("SELECT * FROM evaluation_activations WHERE product_id = ? AND machine_hash = ?")
      .bind(productId, machineHash)
  );
}

export async function create(
  db: D1Database,
  params: {
    id: string;
    issuerId: string;
    productId: string;
    machineHash: string;
    firstIssuedAt: string;
    expiresAt: string;
  }
): Promise<void> {
  await run(
    db
      .prepare(
        `INSERT INTO evaluation_activations
          (id, issuer_id, product_id, machine_hash, first_issued_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        params.id,
        params.issuerId,
        params.productId,
        params.machineHash,
        params.firstIssuedAt,
        params.expiresAt
      )
  );
}
