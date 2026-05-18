import { z } from "zod";

export const machineHashSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/i, "machine_hash must be a SHA-256 hex digest")
  .transform((value) => value.toLowerCase());

export const productCodeSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

export const TRIAL_TOKEN_TTL_MIN_SECONDS = 60;
export const TRIAL_TOKEN_TTL_MAX_SECONDS = 60 * 60 * 24 * 90;

const trialFieldsSchema = {
  trial_enabled: z.boolean().optional(),
  trial_start_at: z.string().datetime().nullable().optional(),
  trial_end_at: z.string().datetime().nullable().optional(),
  trial_token_ttl_seconds: z
    .number()
    .int()
    .min(TRIAL_TOKEN_TTL_MIN_SECONDS)
    .max(TRIAL_TOKEN_TTL_MAX_SECONDS)
    .nullable()
    .optional()
};

export const createProductSchema = z.object({
  code: productCodeSchema,
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional().default(""),
  default_max_devices: z.number().int().min(1).max(100).optional().default(1),
  ...trialFieldsSchema
});

export const updateProductSchema = createProductSchema
  .partial()
  .extend({
    status: z.enum(["active", "archived"]).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field is required"
  });

export const createBatchSchema = z.object({
  product_id: z.string().min(1),
  batch_name: z.string().min(1).max(160),
  quantity: z.number().int().min(1).max(5000),
  max_devices: z.number().int().min(1).max(100).optional(),
  expires_at: z.string().datetime().nullable().optional(),
  code_prefix: z
    .string()
    .min(1)
    .max(24)
    .regex(/^[A-Z0-9][A-Z0-9_-]*$/)
    .nullable()
    .optional(),
  notes: z.string().max(5000).nullable().optional()
});

export const activateSchema = z.object({
  product_code: productCodeSchema,
  activation_code: z.string().min(1).max(160),
  machine_hash: machineHashSchema,
  device_label: z.string().max(160).nullable().optional(),
  client_version: z.string().max(80).nullable().optional(),
  platform: z.string().max(80).nullable().optional()
});

export const deactivateSchema = z.object({
  product_code: productCodeSchema,
  activation_code: z.string().min(1).max(160),
  machine_hash: machineHashSchema
});

export const trialRequestSchema = z.object({
  product_code: productCodeSchema,
  machine_hash: machineHashSchema,
  device_label: z.string().max(160).nullable().optional(),
  client_version: z.string().max(80).nullable().optional(),
  platform: z.string().max(80).nullable().optional()
});

export const licenseSearchSchema = z.object({
  q: z.string().max(160).optional(),
  product_id: z.string().optional(),
  batch_id: z.string().optional(),
  status: z.enum(["available", "activated", "disabled", "revoked"]).optional(),
  take: z.coerce.number().int().min(1).max(200).optional().default(50),
  skip: z.coerce.number().int().min(0).optional().default(0)
});

export const revokeLicenseSchema = z.object({
  reason: z.string().max(500).nullable().optional()
});

export const licenseGatePostVerifySchema = z.object({
  scope: z.string().optional(),
  challenge: z.string().optional(),
  metadata: z.string().optional()
});
