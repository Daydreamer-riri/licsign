export type ProductStatus = "active" | "archived";

export type LicenseStatus = "available" | "activated" | "disabled" | "revoked";

export type ActivationStatus = "active" | "deactivated";

export type ClientActivationError =
  | "INVALID_CODE"
  | "LICENSE_DISABLED"
  | "LICENSE_REVOKED"
  | "LICENSE_EXPIRED"
  | "PRODUCT_MISMATCH"
  | "PRODUCT_NOT_FOUND"
  | "NO_ACTIVATION"
  | "DEVICE_LIMIT_REACHED"
  | "TRIAL_INACTIVE"
  | "BAD_REQUEST"
  | "SERVER_ERROR";

export type LicenseGateValidationResult =
  | "VALID"
  | "NOT_FOUND"
  | "NOT_ACTIVE"
  | "EXPIRED"
  | "LICENSE_SCOPE_FAILED"
  | "IP_LIMIT_EXCEEDED"
  | "RATE_LIMIT_EXCEEDED";

export type OfflineLicenseKind = "license" | "trial";

export interface OfflineLicensePayload {
  version: 1;
  kind?: OfflineLicenseKind;
  license_id: string | null;
  product_code: string;
  machine_hash: string;
  features: string[];
  issued_at: string;
  expires_at: string | null;
  max_devices: number;
  issuer: string;
  key_id: string;
}

export interface SignedLicenseResponse {
  license: OfflineLicensePayload;
  signature: string;
  token: string;
}

export interface ApiErrorResponse<TCode extends string = string> {
  error: TCode;
  message: string;
  details?: unknown;
}

/** An ES256 (P-256) public key in JWK form, used to verify Offline License tokens. */
export interface PublicJwk {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
}

/** One signing key a client must embed to verify tokens carrying its `kid`. */
export interface SigningKeyEntry {
  kid: string;
  alg: "ES256";
  public_jwk: PublicJwk;
}

/**
 * Every integration-time input a client integrator needs to activate against and
 * locally verify one product. See docs/client-integration.md §2.
 */
export interface ClientIntegrationConfig {
  base_url: string;
  product_code: string;
  expected_issuer: string;
  trial_enabled: boolean;
  signing_keys: SigningKeyEntry[];
}
