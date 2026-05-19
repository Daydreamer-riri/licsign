import type { AdminActor } from "../types";
import * as auditQueries from "../db/queries/audit";

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
  await auditQueries.insertAuditLog(db, {
    issuerId: input.issuerId ?? null,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    detailsJson: input.details === undefined ? null : JSON.stringify(input.details),
  });
}
