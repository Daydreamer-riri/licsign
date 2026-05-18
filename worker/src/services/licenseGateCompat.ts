import type { LicenseGateValidationResult } from "../../../shared/src/types";
import { licenseGatePostVerifySchema } from "../../../shared/src/schemas";
import type { Env } from "../types";
import { first } from "../db/d1";
import { signJws } from "../crypto/signing";

interface CompatLicenseRow {
  id: string;
  issuer_id: string;
  activation_code: string;
  status: "available" | "activated" | "disabled" | "revoked";
  expires_at: string | null;
  product_status: "active" | "archived";
}

export async function verifyLicenseGateCompat(
  env: Env,
  input: {
    userId: string;
    licenseKey: string;
    options: unknown;
  }
): Promise<{ valid: boolean; result: LicenseGateValidationResult; signedChallenge?: string }> {
  const options = licenseGatePostVerifySchema.parse(input.options ?? {});
  const license = await first<CompatLicenseRow>(
    env.DB
      .prepare(
        `SELECT licenses.*, products.status AS product_status
         FROM licenses
         JOIN products ON products.id = licenses.product_id
         JOIN issuers ON issuers.id = licenses.issuer_id
         WHERE licenses.activation_code = ?
           AND issuers.public_user_id = ?`
      )
      .bind(input.licenseKey, input.userId)
  );

  const result = mapCompatResult(license);
  if (result !== "VALID") {
    return { valid: false, result };
  }

  let signedChallenge: string | undefined;
  if (options.challenge) {
    signedChallenge = await signJws(
      {
        kind: "licensegate-challenge",
        challenge: options.challenge,
        license_id: license!.id,
        issued_at: new Date().toISOString(),
        key_id: env.SIGNING_KEY_ID
      },
      env
    );
  }

  return { valid: true, result: "VALID", signedChallenge };
}

function mapCompatResult(license: CompatLicenseRow | null): LicenseGateValidationResult {
  if (!license) {
    return "NOT_FOUND";
  }
  if (license.product_status !== "active" || license.status === "disabled" || license.status === "revoked") {
    return "NOT_ACTIVE";
  }
  if (license.expires_at && new Date(license.expires_at).getTime() <= Date.now()) {
    return "EXPIRED";
  }
  return "VALID";
}
