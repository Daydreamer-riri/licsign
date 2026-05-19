import type { OfflineLicenseKind, OfflineLicensePayload, SignedLicenseResponse } from "../../../shared/src/types";
import type { Env } from "../types";
import { signOfflineLicense } from "../crypto/signing";

export interface IssueLicenseInput {
  kind?: OfflineLicenseKind;
  license_id: string | null;
  product_code: string;
  machine_hash: string;
  expires_at: string | null;
  max_devices: number;
  issued_at: string;
}

export async function issueSignedLicense(
  env: Env,
  input: IssueLicenseInput,
): Promise<SignedLicenseResponse> {
  const payload: OfflineLicensePayload = {
    version: 1,
    kind: input.kind,
    license_id: input.license_id,
    product_code: input.product_code,
    machine_hash: input.machine_hash,
    features: [],
    issued_at: input.issued_at,
    expires_at: input.expires_at,
    max_devices: input.max_devices,
    issuer: env.LICENSE_ISSUER,
    key_id: env.SIGNING_KEY_ID,
  };
  const signed = await signOfflineLicense(payload, env);
  return {
    license: payload,
    signature: signed.signature,
    token: signed.token,
  };
}