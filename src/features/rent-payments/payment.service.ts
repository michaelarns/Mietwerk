import "server-only";

import { TRPCError } from "@trpc/server";

import { type Prisma, type PrismaClient } from "../../../generated/prisma";
import { writeAuditLog } from "~/server/audit";
import { derivePaymentProgress } from "./charge-rules";
import {
  checkExplicitAllocations,
  openAmount,
  planFifoAllocation,
  type PlannedAllocation,
} from "./allocation-rules";
import { type RecordPaymentInput } from "./rent-payments.schema";

type Tx = Prisma.TransactionClient;

const allocationErrors: Record<string, string> = {
  EXCEEDS_PAYMENT: "Die Zuordnungen übersteigen den Zahlbetrag.",
  EXCEEDS_OPEN: "Eine Zuordnung übersteigt den offenen Betrag der Forderung.",
  UNKNOWN_RECEIVABLE: "Unbekannte oder fremde Forderung in der Zuordnung.",
  NON_POSITIVE: "Zuordnungsbeträge müssen positiv sein.",
};

/**
 * Recompute a receivable's cached `paidCents` from its allocations and derive
 * its status. Sets `paidAt` to `asOf` once fully paid, clears it otherwise.
 * WAIVED stays WAIVED. Kept in one place so every mutation stays consistent.
 */
async function recomputeReceivable(tx: Tx, rentPaymentId: string, asOf: Date) {
  const rp = await tx.rentPayment.findUniqueOrThrow({
    where: { id: rentPaymentId },
    select: { targetCents: true, status: true },
  });
  const agg = await tx.paymentAllocation.aggregate({
    where: { rentPaymentId },
    _sum: { amountCents: true },
  });
  const paidCents = agg._sum.amountCents ?? 0;
  const status = derivePaymentProgress({
    targetCents: rp.targetCents,
    paidCents,
    waived: rp.status === "WAIVED",
  });
  await tx.rentPayment.update({
    where: { id: rentPaymentId },
    data: { paidCents, status, paidAt: status === "PAID" ? asOf : null },
  });
  return status;
}

export interface RecordPaymentResult {
  paymentId: string;
  allocations: PlannedAllocation[];
  /** Unallocated remainder kept as Guthaben for the lease. */
  creditCents: number;
}

/**
 * Record an incoming payment for a lease and allocate it to receivables.
 * Explicit `allocations` are validated; otherwise the amount is auto-applied
 * FIFO (oldest open first). Any remainder becomes Guthaben.
 */
export async function recordPayment(
  db: PrismaClient,
  organizationId: string,
  input: RecordPaymentInput,
  opts: {
    userId?: string | null;
    method?: "MANUAL" | "BANK_IMPORT";
    /** Link to the imported bank line (1:1, unique) — makes booking idempotent. */
    bankTransactionId?: string;
  } = {},
): Promise<RecordPaymentResult> {
  return db.$transaction(async (tx) => {
    const lease = await tx.lease.findFirst({
      where: { id: input.leaseId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!lease) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Mietverhältnis nicht gefunden." });
    }

    // Candidate receivables: still owed (not fully paid, not waived).
    const receivables = await tx.rentPayment.findMany({
      where: {
        organizationId,
        leaseId: input.leaseId,
        status: { in: ["OPEN", "PARTIAL"] },
      },
      select: { id: true, dueDate: true, targetCents: true, paidCents: true },
    });
    const openByReceivable = new Map(receivables.map((r) => [r.id, openAmount(r)]));

    let planned: PlannedAllocation[];
    let creditCents: number;
    if (input.allocations && input.allocations.length > 0) {
      const check = checkExplicitAllocations(
        input.amountCents,
        input.allocations,
        openByReceivable,
      );
      if (!check.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: allocationErrors[check.error ?? ""] ?? "Ungültige Zuordnung.",
        });
      }
      planned = input.allocations;
      creditCents = check.creditCents;
    } else {
      const plan = planFifoAllocation(input.amountCents, receivables);
      planned = plan.allocations;
      creditCents = plan.creditCents;
    }

    const payment = await tx.payment.create({
      data: {
        organizationId,
        leaseId: input.leaseId,
        amountCents: input.amountCents,
        valueDate: input.valueDate,
        method: opts.method ?? "MANUAL",
        counterparty: input.counterparty ?? null,
        reference: input.reference ?? null,
        note: input.note ?? null,
        bankTransactionId: opts.bankTransactionId ?? null,
        allocations: {
          create: planned.map((a) => ({
            organizationId,
            rentPaymentId: a.rentPaymentId,
            amountCents: a.amountCents,
          })),
        },
      },
      select: { id: true },
    });

    for (const a of planned) {
      await recomputeReceivable(tx, a.rentPaymentId, input.valueDate);
    }

    await writeAuditLog(tx, {
      organizationId,
      userId: opts.userId ?? null,
      action: "payment.record",
      entityType: "Payment",
      entityId: payment.id,
      metadata: {
        leaseId: input.leaseId,
        amountCents: input.amountCents,
        allocated: planned.reduce((s, a) => s + a.amountCents, 0),
        creditCents,
        method: opts.method ?? "MANUAL",
      },
    });

    return { paymentId: payment.id, allocations: planned, creditCents };
  });
}

/**
 * Guthaben for a lease = total received minus total allocated. Computed (never
 * stored) so it cannot drift from the underlying payments/allocations.
 */
export async function getLeaseCreditCents(
  db: PrismaClient,
  organizationId: string,
  leaseId: string,
): Promise<number> {
  const [received, allocated] = await Promise.all([
    db.payment.aggregate({
      where: { organizationId, leaseId, deletedAt: null },
      _sum: { amountCents: true },
    }),
    db.paymentAllocation.aggregate({
      where: { organizationId, payment: { leaseId, deletedAt: null } },
      _sum: { amountCents: true },
    }),
  ]);
  return (received._sum.amountCents ?? 0) - (allocated._sum.amountCents ?? 0);
}

/** Payment history of a lease, newest first, with allocations. */
export function listPaymentsForLease(
  db: PrismaClient,
  organizationId: string,
  leaseId: string,
) {
  return db.payment.findMany({
    where: { organizationId, leaseId, deletedAt: null },
    orderBy: { valueDate: "desc" },
    select: {
      id: true,
      amountCents: true,
      valueDate: true,
      method: true,
      counterparty: true,
      reference: true,
      allocations: {
        select: {
          amountCents: true,
          rentPayment: {
            select: { id: true, periodYear: true, periodMonth: true },
          },
        },
      },
    },
  });
}
