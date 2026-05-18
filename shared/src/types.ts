export type ProductStatus = "active" | "archived";

export type LicenseStatus = "available" | "activated" | "disabled" | "revoked";

export type ActivationStatus = "active" | "deactivated";

export type ClientActivationError =
  | "INVALID_CODE"
  | "LICENSE_DISABLED"
  | "LICENSE_REVOKED"
  | "LICENSE_EXPIRED"
  | "PRODUCT_MISMATCH"
  | "DEVICE_LIMIT_REACHED"
  | "INVALID_MACHINE"
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

export interface OfflineLicensePayload {
  version: 1;
  license_id: string;
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
