import "server-only";

import { type Prisma, type PrismaClient } from "../../../generated/prisma";
import { writeAuditLog } from "~/server/audit";
import { computeCharge, defaultDueDate } from "./charge-rules";

export interface GenerateChargesResult {
  /** Newly created receivables. */
  created: number;
  /** Candidates skipped because a receivable already existed (idempotency). */
  alreadyExisted: number;
}

/**
 * Generate the monthly rent receivables (Sollstellung) for all active leases of
 * an organization in a period. Total Soll = Kaltmiete + NK-Vorauszahlung,
 * prorated tagesgenau for partial first/last months (see {@link computeCharge}).
 *
 * **Idempotent:** the `@@unique([leaseId, periodYear, periodMonth])` constraint
 * together with `skipDuplicates` guarantees no Doppel-Soll. Existing rows (and
 * their `paidCents`) are never overwritten.
 */
export async function generateRentChargesForOrg(
  db: PrismaClient,
  organizationId: string,
  period: { periodYear: number; periodMonth: number; leaseId?: string },
  opts?: { userId?: string | null },
): Promise<GenerateChargesResult> {
  const { periodYear, periodMonth, leaseId } = period;
  const monthStart = new Date(Date.UTC(periodYear, periodMonth - 1, 1));
  const monthEnd = new Date(Date.UTC(periodYear, periodMonth, 0));

  const leases = await db.lease.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(leaseId ? { id: leaseId } : {}),
      startDate: { lte: monthEnd },
      OR: [{ endDate: null }, { endDate: { gte: monthStart } }],
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      baseRentCents: true,
      operatingCostAdvanceCents: true,
    },
  });

  const dueDate = defaultDueDate(periodYear, periodMonth);
  const rows: Prisma.RentPaymentCreateManyInput[] = [];
  for (const lease of leases) {
    const charge = computeCharge(lease, periodYear, periodMonth);
    if (!charge || charge.targetCents <= 0) continue;
    rows.push({
      organizationId,
      leaseId: lease.id,
      periodYear,
      periodMonth,
      dueDate,
      targetCents: charge.targetCents,
      paidCents: 0,
      status: "OPEN",
    });
  }

  let created = 0;
  if (rows.length > 0) {
    const res = await db.rentPayment.createMany({
      data: rows,
      skipDuplicates: true,
    });
    created = res.count;
  }

  if (created > 0) {
    await writeAuditLog(db, {
      organizationId,
      userId: opts?.userId ?? null,
      action: "rentCharge.generate",
      entityType: "RentPayment",
      entityId: `${periodYear}-${String(periodMonth).padStart(2, "0")}`,
      metadata: { periodYear, periodMonth, created, candidates: rows.length },
    });
  }

  return { created, alreadyExisted: rows.length - created };
}

/** Rent receivables of a single lease, newest period first. */
export function listRentPaymentsForLease(
  db: PrismaClient,
  organizationId: string,
  leaseId: string,
) {
  return db.rentPayment.findMany({
    where: { organizationId, leaseId },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    select: {
      id: true,
      periodYear: true,
      periodMonth: true,
      dueDate: true,
      targetCents: true,
      paidCents: true,
      status: true,
    },
  });
}
