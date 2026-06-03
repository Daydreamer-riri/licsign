import { deleteAuditLogsBefore } from "../db/queries/audit";

/**
 * Deletes audit log rows older than `retentionDays` from `nowMs`.
 * Returns the number of deleted rows.
 */
export async function runAuditTrim(
  db: D1Database,
  retentionDays: number,
  nowMs: number = Date.now(),
): Promise<number> {
  const cutoff = new Date(nowMs - retentionDays * 86_400_000).toISOString();
  const deleted = await deleteAuditLogsBefore(db, cutoff);
  console.log(`[audit-trim] deleted ${deleted} rows older than ${cutoff}`);
  return deleted;
}

/**
 * Parses `AUDIT_LOG_RETENTION_DAYS` from the env string and runs the trim.
 * Skips (with a warning) if the value is not a positive integer.
 */
export async function runAuditTrimWithEnv(
  db: D1Database,
  retentionDaysEnv: string | undefined,
  nowMs: number = Date.now(),
): Promise<void> {
  const parsed = Number(retentionDaysEnv ?? "30");
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.warn(
      `[audit-trim] invalid AUDIT_LOG_RETENTION_DAYS "${retentionDaysEnv}", skipping trim`,
    );
    return;
  }
  await runAuditTrim(db, parsed, nowMs);
}
