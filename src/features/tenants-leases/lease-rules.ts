/**
 * Pure, framework-free lease rules. Kept free of Prisma/IO so they can be unit
 * tested directly (these are fachlich kritische Regeln). The services in the
 * tenants-leases and properties slices build their DB queries to match these.
 */

export type LeaseStatus = "future" | "active" | "ended";

export interface LeasePeriod {
  startDate: Date;
  /** `null` = unbefristet (open-ended). */
  endDate: Date | null;
}

/**
 * Derive the status of a lease relative to `now` — never stored as a field.
 *  - `future`: starts after now
 *  - `ended`: has an end date that is before now
 *  - `active`: otherwise (running, possibly open-ended)
 */
export function leaseStatus(lease: LeasePeriod, now: Date): LeaseStatus {
  if (lease.startDate.getTime() > now.getTime()) return "future";
  if (lease.endDate !== null && lease.endDate.getTime() < now.getTime()) {
    return "ended";
  }
  return "active";
}

/**
 * Whether a lease prevents soft-deleting its parent Unit/Property. Active and
 * future leases block deletion; ended leases do not. (See ADR 0006.)
 */
export function leaseBlocksParentDeletion(
  lease: LeasePeriod,
  now: Date,
): boolean {
  return leaseStatus(lease, now) !== "ended";
}

/**
 * Validate that a lease period is internally consistent: if an end date is set,
 * it must not be before the start date.
 */
export function isValidLeasePeriod(lease: LeasePeriod): boolean {
  if (lease.endDate === null) return true;
  return lease.endDate.getTime() >= lease.startDate.getTime();
}

/**
 * Do two lease periods overlap in time? Open-ended leases (endDate null) extend
 * to +infinity. Touching at a single instant (one ends exactly when the other
 * starts) is treated as an overlap to stay on the safe side for a single Unit.
 */
export function leasePeriodsOverlap(a: LeasePeriod, b: LeasePeriod): boolean {
  const aEnd = a.endDate?.getTime() ?? Infinity;
  const bEnd = b.endDate?.getTime() ?? Infinity;
  return a.startDate.getTime() <= bEnd && b.startDate.getTime() <= aEnd;
}
