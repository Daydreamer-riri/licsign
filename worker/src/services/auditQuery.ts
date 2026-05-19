import * as auditQueries from "../db/queries/audit";

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

  const [total, logs] = await Promise.all([
    auditQueries.countAuditLogs(db, whereClause, bindings),
    auditQueries.queryAuditLogs(db, whereClause, bindings, take, skip),
  ]);

  return {
    audit_logs: logs,
    total,
  };
}
