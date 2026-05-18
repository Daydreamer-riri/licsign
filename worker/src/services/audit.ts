import { createId } from "../utils/id";
import { nowIso, run } from "../db/d1";

export async function writeAuditLog(
  db: D1Database,
  input: {
    issuerId?: string | null;
    actorType: "admin" | "system" | "client";
    actorId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    details?: unknown;
  }
): Promise<void> {
  await run(
    db
      .prepare(
        `INSERT INTO audit_logs
          (id, issuer_id, actor_type, actor_id, action, target_type, target_id, details_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        createId("aud"),
        input.issuerId ?? null,
        input.actorType,
        input.actorId ?? null,
        input.action,
        input.targetType,
        input.targetId ?? null,
        input.details === undefined ? null : JSON.stringify(input.details),
        nowIso()
      )
  );
}
