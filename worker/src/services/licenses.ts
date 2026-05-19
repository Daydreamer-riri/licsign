import { licenseSearchSchema, revokeLicenseSchema } from "../../../shared/src/schemas";
import type { LicenseRow } from "../db/models";
import * as licenseQueries from "../db/queries/licenses";
import * as activationQueries from "../db/queries/activations";
import { nowIso } from "../utils/time";
import { ApiError } from "../utils/http";
import type { AdminActor } from "../types";
import { auditActorFromAdminActor, writeAuditLog } from "./audit";

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
  const rows = await licenseQueries.search(db, whereSql, bindings, input.take, input.skip);
  const count = await licenseQueries.countForSearch(db, whereSql, bindings);

  return { licenses: rows, count };
}

export async function readLicense(db: D1Database, issuerId: string, licenseId: string) {
  const license = await licenseQueries.findById(db, licenseId, issuerId);
  if (!license) {
    throw new ApiError(404, "NOT_FOUND", "License not found");
  }
  const activations = await activationQueries.listByLicense(db, licenseId);
  return { license, activations };
}

export async function setLicenseDisabled(
  db: D1Database,
  issuerId: string,
  actor: AdminActor,
  licenseId: string,
  disabled: boolean
): Promise<LicenseRow> {
  const license = await licenseQueries.findByIdAndIssuer(db, licenseId, issuerId);
  if (!license) {
    throw new ApiError(404, "NOT_FOUND", "License not found");
  }
  if (license.status === "revoked") {
    throw new ApiError(409, "LICENSE_REVOKED", "Revoked licenses cannot be enabled or disabled");
  }

  let nextStatus: LicenseRow["status"] = "disabled";
  if (!disabled) {
    const count = await activationQueries.countActiveByLicense(db, licenseId);
    nextStatus = count > 0 ? "activated" : "available";
  }

  await licenseQueries.updateStatus(db, licenseId, issuerId, nextStatus, nowIso());
  await writeAuditLog(db, {
    issuerId,
    ...auditActorFromAdminActor(actor),
    action: disabled ? "license.disable" : "license.enable",
    targetType: "license",
    targetId: licenseId
  });

  const updated = await licenseQueries.findByIdSimple(db, licenseId);
  if (!updated) {
    throw new ApiError(500, "SERVER_ERROR", "License update failed");
  }
  return updated;
}

export async function revokeLicense(
  db: D1Database,
  issuerId: string,
  actor: AdminActor,
  licenseId: string,
  body: unknown
) {
  const input = revokeLicenseSchema.parse(body ?? {});
  const license = await licenseQueries.findByIdAndIssuer(db, licenseId, issuerId);
  if (!license) {
    throw new ApiError(404, "NOT_FOUND", "License not found");
  }

  const now = nowIso();
  await licenseQueries.updateRevoked(db, licenseId, issuerId, input.reason ?? null, now);
  await writeAuditLog(db, {
    issuerId,
    ...auditActorFromAdminActor(actor),
    action: "license.revoke",
    targetType: "license",
    targetId: licenseId,
    details: { reason: input.reason ?? null }
  });

  const updated = await licenseQueries.findByIdSimple(db, licenseId);
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
