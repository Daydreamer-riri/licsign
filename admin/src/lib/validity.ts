import { formatDate } from "./format";

const SECONDS_PER_DAY = 60 * 60 * 24;

export interface ValidityInput {
  expires_at: string | null;
  validity_duration_seconds: number | null;
  /** Omit for batch-level rows; provide for license rows. */
  activated_at?: string | null;
}

function durationDays(seconds: number): number {
  return Math.round(seconds / SECONDS_PER_DAY);
}

/**
 * Renders the License/Batch validity per docs/prd-admin-ui.md
 * "Display convention: License validity" (4 cases).
 */
export function formatLicenseValidity(input: ValidityInput): string {
  const { expires_at, validity_duration_seconds, activated_at } = input;
  if (validity_duration_seconds != null) {
    const days = durationDays(validity_duration_seconds);
    if (activated_at && expires_at) {
      return `Expires ${formatDate(expires_at)} (activation-relative, ${days} days)`;
    }
    return `Valid for ${days} days from activation`;
  }
  if (expires_at) {
    return `Expires ${formatDate(expires_at)}`;
  }
  return "Perpetual";
}
