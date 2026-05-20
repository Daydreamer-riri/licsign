/** Em dash shown in place of missing values. */
export const DASH = "—";

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
const numberFmt = new Intl.NumberFormat();

type DateInput = string | number | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Locale-aware date, or an em dash when absent/invalid. */
export function formatDate(value: DateInput): string {
  const d = toDate(value);
  return d ? dateFmt.format(d) : DASH;
}

/** Locale-aware date + time, or an em dash when absent/invalid. */
export function formatDateTime(value: DateInput): string {
  const d = toDate(value);
  return d ? dateTimeFmt.format(d) : DASH;
}

/** Locale-aware integer/decimal grouping. */
export function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" ? numberFmt.format(value) : DASH;
}
