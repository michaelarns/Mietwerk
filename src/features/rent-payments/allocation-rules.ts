/**
 * Pure payment-allocation rules — no Prisma, no IO, fully unit-testable.
 *
 * A payment is split across one or more rent receivables. The unallocated
 * remainder is Guthaben (credit). All amounts are integer Cent.
 */

export interface OpenReceivable {
  id: string;
  dueDate: Date;
  targetCents: number;
  paidCents: number;
}

export interface PlannedAllocation {
  rentPaymentId: string;
  amountCents: number;
}

export interface AllocationPlan {
  allocations: PlannedAllocation[];
  /** Unallocated remainder of the payment → Guthaben. */
  creditCents: number;
}

/** Open (still owed) amount of a receivable, never negative. */
export function openAmount(r: { targetCents: number; paidCents: number }): number {
  return Math.max(0, r.targetCents - r.paidCents);
}

/**
 * FIFO auto-allocation: apply `amountCents` to the oldest open receivables first
 * (by `dueDate`, then `id` for stable ordering). Never allocates more than a
 * receivable's open remainder; whatever is left over becomes credit (Guthaben).
 *
 * - Teilzahlung  → a single partial allocation, no credit.
 * - Vollzahlung  → receivable fully covered.
 * - Überzahlung  → all open items covered, the rest is `creditCents`.
 */
export function planFifoAllocation(
  amountCents: number,
  receivables: OpenReceivable[],
): AllocationPlan {
  const sorted = [...receivables].sort(
    (a, b) =>
      a.dueDate.getTime() - b.dueDate.getTime() ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  let remaining = amountCents;
  const allocations: PlannedAllocation[] = [];
  for (const r of sorted) {
    if (remaining <= 0) break;
    const open = openAmount(r);
    if (open <= 0) continue;
    const amount = Math.min(open, remaining);
    allocations.push({ rentPaymentId: r.id, amountCents: amount });
    remaining -= amount;
  }

  return { allocations, creditCents: remaining };
}

export interface ExplicitAllocationCheck {
  ok: boolean;
  /** Reason key when not ok. */
  error?: "EXCEEDS_PAYMENT" | "EXCEEDS_OPEN" | "UNKNOWN_RECEIVABLE" | "NON_POSITIVE";
  creditCents: number;
}

/**
 * Validate user-provided allocations against the payment amount and the open
 * amounts of the targeted receivables. Returns the resulting credit (remainder).
 */
export function checkExplicitAllocations(
  amountCents: number,
  allocations: PlannedAllocation[],
  openByReceivable: Map<string, number>,
): ExplicitAllocationCheck {
  let sum = 0;
  for (const a of allocations) {
    if (a.amountCents <= 0) return { ok: false, error: "NON_POSITIVE", creditCents: 0 };
    const open = openByReceivable.get(a.rentPaymentId);
    if (open === undefined)
      return { ok: false, error: "UNKNOWN_RECEIVABLE", creditCents: 0 };
    if (a.amountCents > open)
      return { ok: false, error: "EXCEEDS_OPEN", creditCents: 0 };
    sum += a.amountCents;
  }
  if (sum > amountCents) return { ok: false, error: "EXCEEDS_PAYMENT", creditCents: 0 };
  return { ok: true, creditCents: amountCents - sum };
}
