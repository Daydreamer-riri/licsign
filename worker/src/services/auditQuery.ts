import { all, first } from "../db/d1";

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

interface AuditLogQueryResult {
  audit_logs: AuditLogEntry[];
  total: number;
}

export async function queryAuditLogs(
  db: D1Database,
  issuerId: string,
  params: { action?: string; take?: number; skip?: number }
): Promise<AuditLogQueryResult> {
  const take = Math.min(Math.max(params.take ?? 50, 1), 200);
  const skip = Math.max(params.skip ?? 0, 0);

  const where: string[] = ["issuer_id = ?"];
  const bindings: unknown[] = [issuerId];

  if (params.action) {
    where.push("action = ?");
    bindings.push(params.action);
  }

  const whereClause = where.join(" AND ");

  const [countRow, logs] = await Promise.all([
    first<{ count: number }>(
      db.prepare(`SELECT COUNT(*) AS count FROM audit_logs WHERE ${whereClause}`).bind(...bindings)
    ),
    all<AuditLogEntry>(
      db.prepare(
        `SELECT id, actor_type, actor_id, action, target_type, target_id, details_json, created_at
         FROM audit_logs
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      ).bind(...bindings, take, skip)
    )
  ]);

  return {
    audit_logs: logs,
    total: countRow?.count ?? 0
  };
}
