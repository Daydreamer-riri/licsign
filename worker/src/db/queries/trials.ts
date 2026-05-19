import { first, run } from "../d1";
import type { TrialActivationRow } from "../models";

export async function findByProductAndMachine(
  db: D1Database,
  productId: string,
  machineHash: string,
): Promise<TrialActivationRow | null> {
  return first<TrialActivationRow>(
    db
      .prepare("SELECT * FROM trial_activations WHERE product_id = ? AND machine_hash = ?")
      .bind(productId, machineHash),
  );
}

export async function create(
  db: D1Database,
  params: {
    id: string;
    issuerId: string;
    productId: string;
    machineHash: string;
    deviceLabel: string | null;
    clientVersion: string | null;
    platform: string | null;
    issuedAt: string;
    tokenExpiresAt: string;
  },
): Promise<void> {
  await run(
    db
      .prepare(
        `INSERT INTO trial_activations
          (id, issuer_id, product_id, machine_hash, device_label, client_version, platform,
           first_seen_at, last_seen_at, last_token_expires_at, token_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .bind(
        params.id,
        params.issuerId,
        params.productId,
        params.machineHash,
        params.deviceLabel,
        params.clientVersion,
        params.platform,
        params.issuedAt,
        params.issuedAt,
        params.tokenExpiresAt,
      ),
  );
}

export async function update(
  db: D1Database,
  trialId: string,
  params: {
    issuedAt: string;
    tokenExpiresAt: string;
    deviceLabel: string | null;
    clientVersion: string | null;
    platform: string | null;
  },
): Promise<void> {
  await run(
    db
      .prepare(
        `UPDATE trial_activations
         SET last_seen_at = ?,
             last_token_expires_at = ?,
             token_count = token_count + 1,
             device_label = COALESCE(?, device_label),
             client_version = COALESCE(?, client_version),
             platform = COALESCE(?, platform)
         WHERE id = ?`,
      )
      .bind(
        params.issuedAt,
        params.tokenExpiresAt,
        params.deviceLabel,
        params.clientVersion,
        params.platform,
        trialId,
      ),
  );
}
