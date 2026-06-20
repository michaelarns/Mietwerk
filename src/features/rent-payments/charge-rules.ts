/**
 * Pure Sollstellung / receivable rules — no Prisma, no IO, fully unit-testable.
 *
 * Money is integer Cent throughout. Dates are treated as UTC calendar days
 * (Mietwerk stores UTC, renders Europe/Berlin elsewhere).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Strip a Date to its UTC midnight timestamp (date-only) for day arithmetic. */
function toUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Inclusive count of calendar days between two UTC day timestamps. */
function inclusiveDays(startMs: number, endMs: number): number {
  return Math.floor((endMs - startMs) / DAY_MS) + 1;
}

/** Number of calendar days in a given month (`month` is 1-12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export interface LeaseChargeInput {
  startDate: Date;
  endDate: Date | null;
  baseRentCents: number;
  operatingCostAdvanceCents: number;
}

export interface ChargeResult {
  /** Total receivable for the month (Kaltmiete + NK-Vorauszahlung), prorated. */
  targetCents: number;
  /** Active days of the lease within the month (0 = not active that month). */
  activeDays: number;
  /** Total calendar days in the month. */
  totalDays: number;
  /** True when the lease covers the entire month — no proration applied. */
  fullMonth: boolean;
}

/**
 * Compute the rent receivable for a lease in a given period.
 *
 * Proration policy (confirmed business decision): **tagesgenau / actual-days**.
 * A partial first or last month is charged `fullMonth * activeDays / daysInMonth`
 * (single Cent rounding). Returns `null` when the lease is not active at all in
 * the month, so no Sollstellung is created.
 */
export function computeCharge(
  lease: LeaseChargeInput,
  year: number,
  month: number,
): ChargeResult | null {
  const totalDays = daysInMonth(year, month);
  const monthStart = Date.UTC(year, month - 1, 1);
  const monthEnd = Date.UTC(year, month - 1, totalDays);

  const leaseStart = toUtcDay(lease.startDate);
  const leaseEnd = lease.endDate ? toUtcDay(lease.endDate) : null;

  const spanStart = Math.max(leaseStart, monthStart);
  const spanEnd = leaseEnd === null ? monthEnd : Math.min(leaseEnd, monthEnd);

  if (spanEnd < spanStart) return null; // lease not active in this month

  const activeDays = inclusiveDays(spanStart, spanEnd);
  const fullMonthCents = lease.baseRentCents + lease.operatingCostAdvanceCents;
  const fullMonth = activeDays >= totalDays;

  const targetCents = fullMonth
    ? fullMonthCents
    : Math.round((fullMonthCents * activeDays) / totalDays);

  return { targetCents, activeDays, totalDays, fullMonth };
}

/**
 * The n-th business day (Mon–Fri) of a month as a UTC Date.
 *
 * Default due date for rent: 3rd business day (§ 556b Abs. 1 BGB — "spätestens
 * bis zum dritten Werktag"). NOTE/ASSUMPTION: public holidays are NOT considered
 * and Saturday is treated as a non-Werktag (BGH VIII ZR 222/15 for the
 * Mietzahlung). This is a documented simplification to verify legally.
 */
export function nthBusinessDay(year: number, month: number, n: number): Date {
  const total = daysInMonth(year, month);
  let count = 0;
  let day = 1;
  for (; day <= total; day++) {
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun..6=Sat
    if (dow !== 0 && dow !== 6) {
      count++;
      if (count === n) break;
    }
  }
  return new Date(Date.UTC(year, month - 1, Math.min(day, total)));
}

/** Default Sollstellungs-Fälligkeit: 3rd business day of the period. */
export function defaultDueDate(year: number, month: number): Date {
  return nthBusinessDay(year, month, 3);
}

// ── Status & overdue derivation ──────────────────────────────────────────────

/**
 * Payment progress stored on RentPayment.status. Overdue is intentionally NOT
 * stored: it is time-dependent and derived (see {@link isOverdue}) so it never
 * goes stale and never hides the partial-payment state.
 */
export type PaymentProgress = "OPEN" | "PARTIAL" | "PAID" | "WAIVED";

export function derivePaymentProgress(opts: {
  targetCents: number;
  paidCents: number;
  waived?: boolean;
}): PaymentProgress {
  if (opts.waived) return "WAIVED";
  if (opts.paidCents >= opts.targetCents) return "PAID";
  if (opts.paidCents > 0) return "PARTIAL";
  return "OPEN";
}

/** Whole days `now` is past `dueDate` (negative if not yet due). */
export function daysOverdue(dueDate: Date, now: Date): number {
  return Math.floor((toUtcDay(now) - toUtcDay(dueDate)) / DAY_MS);
}

/**
 * A receivable is overdue once it is unpaid past `dueDate + toleranceDays`.
 * Tolerance models the Karenzzeit before the item counts as "überfällig".
 */
export function isOverdue(opts: {
  dueDate: Date;
  now: Date;
  toleranceDays: number;
  remainingCents: number;
}): boolean {
  if (opts.remainingCents <= 0) return false;
  return daysOverdue(opts.dueDate, opts.now) > opts.toleranceDays;
}
