import { licenseSearchSchema, revokeLicenseSchema } from "../../../shared/src/schemas";
import type { ActivationRow, LicenseRow } from "../db/models";
import { all, first, nowIso, run } from "../db/d1";
import { ApiError } from "../utils/http";
import { writeAuditLog } from "./audit";

export async function searchLicenses(db: D1Database, issuerId: string, query: Record<string, string>) {
  const input = licenseSearchSchema.parse(query);
  const where: string[] = ["licenses.issuer_id = ?"];
  const bindings: unknown[] = [issuerId];

  if (input.q) {
    where.push("(licenses.activation_code LIKE ? OR licenses.issued_to LIKE ?)");
    bindings.push(`%${input.q}%`, `%${input.q}%`);
  }
  if (input.product_id) {
    where.push("licenses.product_id = ?");
    bindings.push(input.product_id);
  }
  if (input.batch_id) {
    where.push("licenses.batch_id = ?");
    bindings.push(input.batch_id);
  }
  if (input.status) {
    where.push("licenses.status = ?");
    bindings.push(input.status);
  }

  const whereSql = where.join(" AND ");
  const rows = await all(
    db
      .prepare(
        `SELECT
          licenses.*,
          products.code AS product_code,
          products.name AS product_name,
          COUNT(activations.id) AS active_device_count
         FROM licenses
         JOIN products ON products.id = licenses.product_id
         LEFT JOIN activations ON activations.license_id = licenses.id AND activations.status = 'active'
         WHERE ${whereSql}
         GROUP BY licenses.id
         ORDER BY licenses.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...bindings, input.take, input.skip)
  );
  const count = await first<{ count: number }>(
    db.prepare(`SELECT COUNT(*) AS count FROM licenses WHERE ${whereSql}`).bind(...bindings)
  );

  return { licenses: rows, count: count?.count ?? 0 };
}

export async function readLicense(db: D1Database, issuerId: string, licenseId: string) {
  const license = await first(
    db
      .prepare(
        `SELECT licenses.*, products.code AS product_code, products.name AS product_name
         FROM licenses
         JOIN products ON products.id = licenses.product_id
         WHERE licenses.id = ? AND licenses.issuer_id = ?`
      )
      .bind(licenseId, issuerId)
  );
  if (!license) {
    throw new ApiError(404, "NOT_FOUND", "License not found");
  }
  const activations = await all<ActivationRow>(
    db.prepare("SELECT * FROM activations WHERE license_id = ? ORDER BY activated_at DESC").bind(licenseId)
  );
  return { license, activations };
}

export async function setLicenseDisabled(
  db: D1Database,
  issuerId: string,
  actorId: string,
  licenseId: string,
  disabled: boolean
): Promise<LicenseRow> {
  const license = await first<LicenseRow>(
    db.prepare("SELECT * FROM licenses WHERE id = ? AND issuer_id = ?").bind(licenseId, issuerId)
  );
  if (!license) {
    throw new ApiError(404, "NOT_FOUND", "License not found");
  }
  if (license.status === "revoked") {
    throw new ApiError(409, "LICENSE_REVOKED", "Revoked licenses cannot be enabled or disabled");
  }

  let nextStatus: LicenseRow["status"] = "disabled";
  if (!disabled) {
    const activeCount = await first<{ count: number }>(
      db
        .prepare("SELECT COUNT(*) AS count FROM activations WHERE license_id = ? AND status = 'active'")
        .bind(licenseId)
    );
    nextStatus = (activeCount?.count ?? 0) > 0 ? "activated" : "available";
  }

  await run(
    db
      .prepare("UPDATE licenses SET status = ?, updated_at = ? WHERE id = ? AND issuer_id = ?")
      .bind(nextStatus, nowIso(), licenseId, issuerId)
  );
  await writeAuditLog(db, {
    issuerId,
    actorType: "admin",
    actorId,
    action: disabled ? "license.disable" : "license.enable",
    targetType: "license",
    targetId: licenseId
  });

  const updated = await first<LicenseRow>(db.prepare("SELECT * FROM licenses WHERE id = ?").bind(licenseId));
  if (!updated) {
    throw new ApiError(500, "SERVER_ERROR", "License update failed");
  }
  return updated;
}

export async function revokeLicense(db: D1Database, issuerId: string, actorId: string, licenseId: string, body: unknown) {
  const input = revokeLicenseSchema.parse(body ?? {});
  const license = await first<LicenseRow>(
    db.prepare("SELECT * FROM licenses WHERE id = ? AND issuer_id = ?").bind(licenseId, issuerId)
  );
  if (!license) {
    throw new ApiError(404, "NOT_FOUND", "License not found");
  }

  const now = nowIso();
  await run(
    db
      .prepare(
        `UPDATE licenses
         SET status = 'revoked', revoked_at = ?, revoked_reason = ?, updated_at = ?
         WHERE id = ? AND issuer_id = ?`
      )
      .bind(now, input.reason ?? null, now, licenseId, issuerId)
  );
  await writeAuditLog(db, {
    issuerId,
    actorType: "admin",
    actorId,
    action: "license.revoke",
    targetType: "license",
    targetId: licenseId,
    details: { reason: input.reason ?? null }
  });

  const updated = await first<LicenseRow>(db.prepare("SELECT * FROM licenses WHERE id = ?").bind(licenseId));
  if (!updated) {
    throw new ApiError(500, "SERVER_ERROR", "License revoke failed");
  }
  return updated;
}

export async function exportLicensesCsv(db: D1Database, issuerId: string, query: Record<string, string>): Promise<string> {
  const { licenses } = await searchLicenses(db, issuerId, { ...query, take: "200", skip: "0" });
  const rows = ["id,product_code,activation_code,status,max_devices,expires_at,created_at,activated_at"];
  for (const row of licenses as Array<Record<string, unknown>>) {
    rows.push(
      [
        row.id,
        row.product_code,
        row.activation_code,
        row.status,
        row.max_devices,
        row.expires_at,
        row.created_at,
        row.activated_at
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return rows.join("\n");
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
