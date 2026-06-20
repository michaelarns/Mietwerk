import "server-only";

import { TRPCError } from "@trpc/server";

import { type PrismaClient } from "../../../generated/prisma";
import { openAmount } from "./allocation-rules";
import { daysOverdue, isOverdue } from "./charge-rules";
import { listRentPaymentsForLease } from "./charge.service";
import { resolveDunningConfig } from "./dunning.service";
import { getLeaseCreditCents, listPaymentsForLease } from "./payment.service";
import { type ListOpenItemsInput } from "./rent-payments.schema";

/**
 * Open items (offene Posten) across the org, enriched with the derived
 * remaining amount and overdue flag (tolerance from the org's dunning policy).
 * Pass `onlyOverdue` for the Überfällig-Liste.
 */
export async function listOpenItems(
  db: PrismaClient,
  organizationId: string,
  input: ListOpenItemsInput,
) {
  const config = await resolveDunningConfig(db, organizationId);
  const now = new Date();

  const rows = await db.rentPayment.findMany({
    where: {
      organizationId,
      status: { in: ["OPEN", "PARTIAL"] },
      ...(input?.leaseId ? { leaseId: input.leaseId } : {}),
    },
    orderBy: [{ dueDate: "asc" }],
    select: {
      id: true,
      leaseId: true,
      periodYear: true,
      periodMonth: true,
      dueDate: true,
      targetCents: true,
      paidCents: true,
      status: true,
      dunnings: {
        select: { level: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      lease: {
        select: {
          unit: {
            select: { label: true, property: { select: { name: true } } },
          },
          leaseTenants: {
            select: { tenant: { select: { firstName: true, lastName: true } } },
          },
        },
      },
    },
  });

  return rows
    .map((r) => {
      const remainingCents = openAmount(r);
      const overdue = isOverdue({
        dueDate: r.dueDate,
        now,
        toleranceDays: config.toleranceDays,
        remainingCents,
      });
      return {
        id: r.id,
        leaseId: r.leaseId,
        periodYear: r.periodYear,
        periodMonth: r.periodMonth,
        dueDate: r.dueDate,
        targetCents: r.targetCents,
        paidCents: r.paidCents,
        remainingCents,
        status: r.status,
        overdue,
        daysOverdue: daysOverdue(r.dueDate, now),
        latestDunningLevel: r.dunnings[0]?.level ?? null,
        unitLabel: r.lease.unit.label,
        propertyName: r.lease.unit.property.name,
        tenants: r.lease.leaseTenants.map(
          (lt) => `${lt.tenant.firstName} ${lt.tenant.lastName}`.trim(),
        ),
      };
    })
    .filter((r) => (input?.onlyOverdue ? r.overdue : true));
}

/** Lightweight lease options (id + label) for selectors, e.g. import booking. */
export async function listLeaseOptions(
  db: PrismaClient,
  organizationId: string,
) {
  const leases = await db.lease.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      unit: { select: { label: true, property: { select: { name: true } } } },
      leaseTenants: { select: { tenant: { select: { lastName: true } } } },
    },
  });
  return leases.map((l) => ({
    id: l.id,
    label: `${l.unit.property.name} · ${l.unit.label} · ${l.leaseTenants
      .map((t) => t.tenant.lastName)
      .join(", ")}`,
  }));
}

/** Full payment picture for a single lease (history, Soll/Ist, Guthaben, Mahnungen). */
export async function getLeasePaymentOverview(
  db: PrismaClient,
  organizationId: string,
  leaseId: string,
) {
  const lease = await db.lease.findFirst({
    where: { id: leaseId, organizationId, deletedAt: null },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      baseRentCents: true,
      operatingCostAdvanceCents: true,
      unit: {
        select: {
          label: true,
          property: { select: { id: true, name: true } },
        },
      },
      leaseTenants: {
        select: {
          tenant: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      },
    },
  });
  if (!lease) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Mietverhältnis nicht gefunden." });
  }

  const config = await resolveDunningConfig(db, organizationId);
  const now = new Date();

  const [rentPaymentsRaw, payments, creditCents, dunnings] = await Promise.all([
    listRentPaymentsForLease(db, organizationId, leaseId),
    listPaymentsForLease(db, organizationId, leaseId),
    getLeaseCreditCents(db, organizationId, leaseId),
    db.dunning.findMany({
      where: { organizationId, rentPayment: { leaseId } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        level: true,
        sentAt: true,
        feeCents: true,
        interestCents: true,
        channel: true,
        recipient: true,
        rentPayment: { select: { periodYear: true, periodMonth: true } },
      },
    }),
  ]);

  const rentPayments = rentPaymentsRaw.map((rp) => {
    const remainingCents = openAmount(rp);
    return {
      ...rp,
      remainingCents,
      overdue: isOverdue({
        dueDate: rp.dueDate,
        now,
        toleranceDays: config.toleranceDays,
        remainingCents,
      }),
    };
  });

  return { lease, rentPayments, payments, creditCents, dunnings };
}
