import { createId } from "../utils/id";
import { nowIso, run } from "../db/d1";
import type { AdminActor } from "../types";

export type AuditActorType = "admin" | "api_key" | "system" | "client";

export function auditActorFromAdminActor(actor: AdminActor): { actorType: AuditActorType; actorId: string } {
  return actor.type === "api_key"
    ? { actorType: "api_key", actorId: actor.apiKeyId }
    : { actorType: "admin", actorId: actor.adminId };
}

export async function writeAuditLog(
  db: D1Database,
  input: {
    issuerId?: string | null;
    actorType: AuditActorType;
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
