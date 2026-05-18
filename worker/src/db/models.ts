import type { LicenseStatus, ProductStatus } from "../../../shared/src/types";

export interface IssuerRow {
  id: string;
  public_user_id: string;
  name: string;
  status: "active" | "disabled";
  created_at: string;
  updated_at: string;
}

export interface ApiKeyRow {
  id: string;
  issuer_id: string;
  name: string;
  key_hash: string;
  status: "active" | "disabled";
  created_at: string;
  last_used_at: string | null;
}

export interface ProductRow {
  id: string;
  issuer_id: string;
  code: string;
  name: string;
  description: string;
  status: ProductStatus;
  default_max_devices: number;
  created_at: string;
  updated_at: string;
}

export interface LicenseRow {
  id: string;
  issuer_id: string;
  product_id: string;
  batch_id: string | null;
  activation_code: string;
  status: LicenseStatus;
  max_devices: number;
  issued_to: string | null;
  metadata_json: string | null;
  expires_at: string | null;
  activated_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivationRow {
  id: string;
  license_id: string;
  machine_hash: string;
  device_label: string | null;
  client_version: string | null;
  platform: string | null;
  status: "active" | "deactivated";
  activated_at: string;
  deactivated_at: string | null;
  last_seen_at: string | null;
  license_payload_version: number;
}

export interface LicenseWithProductRow extends LicenseRow {
  product_code: string;
  product_status: ProductStatus;
  product_issuer_id: string;
}
