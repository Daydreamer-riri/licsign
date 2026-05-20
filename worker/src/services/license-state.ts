import type { ClientActivationError } from "../../../shared/src/types";
import type { LicenseWithProductRow } from "../db/models";
import { ApiError } from "../utils/http";

/**
 * Validates that a License is in a serviceable state for issuing a signed token.
 * Shared by `activate` and `restore` so the two paths cannot drift on what
 * counts as a serviceable License.
 */
export function ensureLicenseServiceable(
  license: LicenseWithProductRow,
  productCode: string,
): void {
  if (license.product_code !== productCode || license.product_status !== "active") {
    throw new ApiError<ClientActivationError>(409, "PRODUCT_MISMATCH", "License does not belong to this active product");
  }
  if (license.status === "disabled") {
    throw new ApiError<ClientActivationError>(403, "LICENSE_DISABLED", "License is disabled");
  }
  if (license.status === "revoked") {
    throw new ApiError<ClientActivationError>(403, "LICENSE_REVOKED", "License is revoked");
  }
  if (license.expires_at && new Date(license.expires_at).getTime() <= Date.now()) {
    throw new ApiError<ClientActivationError>(403, "LICENSE_EXPIRED", "License is expired");
  }
}
