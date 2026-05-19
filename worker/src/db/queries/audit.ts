import { first, all, run } from "../d1";
import { createId } from "../../utils/id";
import { nowIso } from "../../utils/time";

export async function insertAuditLog(
  db: D1Database,
  params: {
    issuerId: string | null;
    actorType: string;
    actorId: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    detailsJson: string | null;
  },
): Promise<void> {
  await run(
    db
      .prepare(
        `INSERT INTO audit_logs
          (id, issuer_id, actor_type, actor_id, action, target_type, target_id, details_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        createId("aud"),
        params.issuerId,
        params.actorType,
        params.actorId,
        params.action,
        params.targetType,
        params.targetId,
        params.detailsJson,
        nowIso(),
      ),
  );
}

interface AuditLogEntry {
  id: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  details_json: string | null;
  created_at: string;
}

export async function countAuditLogs(
  db: D1Database,
  whereClause: string,
  bindings: unknown[],
): Promise<number> {
  const row = await first<{ count: number }>(
    db.prepare(`SELECT COUNT(*) AS count FROM audit_logs WHERE ${whereClause}`).bind(...bindings),
  );
  return row?.count ?? 0;
}

export async function queryAuditLogs(
  db: D1Database,
  whereClause: string,
  bindings: unknown[],
  take: number,
  skip: number,
): Promise<AuditLogEntry[]> {
  return all<AuditLogEntry>(
    db
      .prepare(
        `SELECT id, actor_type, actor_id, action, target_type, target_id, details_json, created_at
         FROM audit_logs
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(...bindings, take, skip),
  );
}
