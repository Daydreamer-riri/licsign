// Response shapes for the admin API. Kept local to the SPA so the Vite build
// stays independent of the worker package.

export type ProductStatus = "active" | "archived";
export type LicenseStatus = "available" | "activated" | "disabled" | "revoked";

export interface Product {
  id: string;
  issuer_id: string;
  code: string;
  name: string;
  description: string | null;
  status: ProductStatus;
  default_max_devices: number;
  trial_enabled: number;
  trial_start_at: string | null;
  trial_end_at: string | null;
  trial_token_ttl_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProductWithCount extends Product {
  license_count: number;
}

export interface License {
  id: string;
  activation_code: string;
  product_id: string;
  batch_id: string | null;
  status: LicenseStatus;
  max_devices: number;
  issued_to: string | null;
  expires_at: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
  product_code: string;
  product_name: string;
  active_device_count: number;
}

export interface Activation {
  id: string;
  license_id: string;
  machine_hash: string;
  device_label: string | null;
  platform: string | null;
  status: string;
  activated_at: string;
  deactivated_at: string | null;
}

export interface Batch {
  id: string;
  product_id: string;
  batch_name: string;
  code_prefix: string | null;
  quantity: number;
  max_devices: number;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  product_code: string;
  product_name: string;
}

export interface BatchLicense {
  id: string;
  activation_code: string;
  status: LicenseStatus;
  max_devices: number;
  expires_at: string | null;
  activated_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  details_json: string | null;
  created_at: string;
}

export interface RecentActivation {
  activation_id: string;
  license_id: string;
  activation_code: string;
  product_code?: string;
  machine_hash: string;
  device_label: string | null;
  platform: string | null;
  activated_at: string;
}

export interface DashboardStats {
  product_count: number;
  license_count: number;
  recent_activations: RecentActivation[];
}

export interface LicenseCounts {
  available: number;
  activated: number;
  disabled: number;
  revoked: number;
  total: number;
}

export interface ProductOverview {
  product: Product;
  license_counts: LicenseCounts;
  batch_count: number;
  recent_activations: RecentActivation[];
}

export interface Admin {
  id: string;
  issuer_id: string;
  email: string;
  status: string;
  created_at: string;
  updated_at: string;
}
