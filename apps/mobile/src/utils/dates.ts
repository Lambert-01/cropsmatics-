/**
 * Date helpers for harvest start/end capture.
 *
 * Dates are stored as ISO `YYYY-MM-DD` strings so they are unambiguous, sorting
 * as strings equals sorting chronologically, and SQLite comparisons behave.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function isValidIsoDate(value: string | null | undefined): boolean {
  if (!value || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const parsed = new Date(y, m - 1, d);
  // Rejects e.g. 2026-02-31, which `new Date` would roll forward.
  return (
    parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d
  );
}

export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!isValidIsoDate(value)) return null;
  const [y, m, d] = (value as string).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export interface DateValidation {
  ok: boolean;
  /** Which field is wrong, so the UI can point at it. */
  field?: "start" | "end";
  error?: string;
}

/** How far in the past a harvest start may plausibly be, in days. */
export const MAX_BACKDATE_DAYS = 730;

/**
 * Validate a harvest window.
 *
 * Rules: both dates must be real calendar dates, the end must not precede the
 * start, and the start must not be implausibly far in the past (a mistyped year
 * is the usual cause).
 */
export function validateHarvestDates(
  start: string | null | undefined,
  end: string | null | undefined,
  options: { today?: string } = {},
): DateValidation {
  const today = options.today ?? todayIso();

  if (start && !isValidIsoDate(start)) {
    return { ok: false, field: "start", error: "Start date is not a valid date" };
  }
  if (end && !isValidIsoDate(end)) {
    return { ok: false, field: "end", error: "End date is not a valid date" };
  }
  if (start && end && end < start) {
    return { ok: false, field: "end", error: "End date must be on or after the start date" };
  }
  if (start) {
    const startDate = parseIsoDate(start);
    const todayDate = parseIsoDate(today);
    if (startDate && todayDate) {
      const daysAgo = (todayDate.getTime() - startDate.getTime()) / 86_400_000;
      if (daysAgo > MAX_BACKDATE_DAYS) {
        return {
          ok: false,
          field: "start",
          error: `Start date is more than ${MAX_BACKDATE_DAYS} days in the past — check the year`,
        };
      }
    }
  }
  return { ok: true };
}
