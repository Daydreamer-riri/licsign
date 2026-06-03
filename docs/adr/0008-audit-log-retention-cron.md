# Audit log retention via Cron Trigger

Audit logs accumulate indefinitely in D1. We use a Cloudflare Cron Trigger (daily at UTC 03:00) to delete rows older than a configurable retention window (`AUDIT_LOG_RETENTION_DAYS`, default 90). Trimming is a maintenance operation, not a business transaction, so it is not itself written to the audit log.

Deletion runs in bounded batches (`DELETE ... WHERE id IN (SELECT id ... LIMIT 1000)`, looped until a batch deletes fewer than the limit). This keeps each statement within D1's per-query resource limits even on the first run against a large pre-existing backlog, which an unbounded single-statement `DELETE` could otherwise exceed.

## Considered Options

- **Manual Admin API endpoint** — rejected because it requires human intervention and is easily forgotten.
- **Per-issuer retention policies** — deferred; V1 is single-issuer and the extra complexity has no current payoff.
