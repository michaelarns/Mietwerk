import "server-only";

import { TRPCError } from "@trpc/server";

import { type PrismaClient } from "../../../generated/prisma";
import { writeAuditLog } from "~/server/audit";
import { emptyToNull } from "~/lib/utils";
import {
  isValidLeasePeriod,
  leasePeriodsOverlap,
  leaseStatus,
  type LeasePeriod,
} from "./lease-rules";
import {
  type CreateLeaseInput,
  type CreateTenantInput,
  type UpdateLeaseInput,
  type UpdateTenantInput,
} from "./tenants-leases.schema";

const notFound = (what: string) =>
  new TRPCError({ code: "NOT_FOUND", message: `${what} nicht gefunden.` });

const blockingLeaseWhere = (now: Date) => ({
  deletedAt: null,
  OR: [{ endDate: null }, { endDate: { gte: now } }],
});

// ── Tenants ─────────────────────────────────────────────────────────────────

export function listTenants(db: PrismaClient, organizationId: string) {
  return db.tenant.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      _count: { select: { leaseTenants: true } },
    },
  });
}

export async function getTenant(
  db: PrismaClient,
  organizationId: string,
  id: string,
) {
  const tenant = await db.tenant.findFirst({
    where: { id, organizationId, deletedAt: null },
    include: {
      leaseTenants: {
        where: { lease: { deletedAt: null } },
        select: {
          lease: {
            select: {
              id: true,
              startDate: true,
              endDate: true,
              unit: { select: { id: true, label: true, propertyId: true } },
            },
          },
        },
      },
    },
  });
  if (!tenant) throw notFound("Mieter");
  return tenant;
}

export function createTenant(
  db: PrismaClient,
  organizationId: string,
  input: CreateTenantInput,
) {
  return db.tenant.create({
    data: {
      organizationId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: emptyToNull(input.email),
      phone: emptyToNull(input.phone),
    },
    select: { id: true },
  });
}

export async function updateTenant(
  db: PrismaClient,
  organizationId: string,
  input: UpdateTenantInput,
) {
  const { id, ...rest } = input;
  await assertTenantExists(db, organizationId, id);
  return db.tenant.update({
    where: { id },
    data: {
      firstName: rest.firstName,
      lastName: rest.lastName,
      email: rest.email === undefined ? undefined : emptyToNull(rest.email),
      phone: rest.phone === undefined ? undefined : emptyToNull(rest.phone),
    },
    select: { id: true },
  });
}

export async function softDeleteTenant(
  db: PrismaClient,
  organizationId: string,
  id: string,
  userId: string,
) {
  await assertTenantExists(db, organizationId, id);

  // Do not orphan an active/future lease whose only tenant is this one.
  const blockingLeases = await db.lease.findMany({
    where: {
      organizationId,
      ...blockingLeaseWhere(new Date()),
      leaseTenants: { some: { tenantId: id } },
    },
    select: { id: true, _count: { select: { leaseTenants: true } } },
  });
  if (blockingLeases.some((l) => l._count.leaseTenants <= 1)) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "Mieter ist alleiniger Mieter eines aktiven/zukünftigen Mietverhältnisses. Bitte zuerst das Mietverhältnis beenden.",
    });
  }

  const result = await db.tenant.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: { id: true },
  });
  await writeAuditLog(db, {
    organizationId,
    userId,
    action: "tenant.softDelete",
    entityType: "Tenant",
    entityId: id,
  });
  return result;
}

async function assertTenantExists(
  db: PrismaClient,
  organizationId: string,
  id: string,
) {
  const found = await db.tenant.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!found) throw notFound("Mieter");
}

// ── Leases ────────────────────────────────────────────────────────────────

export async function listLeasesForProperty(
  db: PrismaClient,
  organizationId: string,
  propertyId: string,
) {
  const leases = await db.lease.findMany({
    where: {
      organizationId,
      deletedAt: null,
      unit: { propertyId },
    },
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      type: true,
      startDate: true,
      endDate: true,
      baseRentCents: true,
      operatingCostAdvanceCents: true,
      depositCents: true,
      unit: { select: { id: true, label: true } },
      leaseTenants: {
        select: {
          tenant: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });
  const now = new Date();
  return leases.map((l) => ({ ...l, status: leaseStatus(l, now) }));
}

export async function getLease(
  db: PrismaClient,
  organizationId: string,
  id: string,
) {
  const lease = await db.lease.findFirst({
    where: { id, organizationId, deletedAt: null },
    include: {
      unit: { select: { id: true, label: true, propertyId: true } },
      leaseTenants: { select: { tenantId: true } },
    },
  });
  if (!lease) throw notFound("Mietverhältnis");
  return lease;
}

export async function createLease(
  db: PrismaClient,
  organizationId: string,
  input: CreateLeaseInput,
) {
  await assertUnitExists(db, organizationId, input.unitId);
  await assertTenantsExist(db, organizationId, input.tenantIds);

  const period: LeasePeriod = {
    startDate: input.startDate,
    endDate: input.endDate ?? null,
  };
  if (!isValidLeasePeriod(period)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Ende darf nicht vor dem Beginn liegen.",
    });
  }
  await assertNoOverlap(db, organizationId, input.unitId, period);

  return db.lease.create({
    data: {
      organizationId,
      unitId: input.unitId,
      type: input.type,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      baseRentCents: input.baseRentCents,
      operatingCostAdvanceCents: input.operatingCostAdvanceCents,
      depositCents: input.depositCents,
      leaseTenants: {
        create: input.tenantIds.map((tenantId) => ({ tenantId })),
      },
    },
    select: { id: true, unitId: true },
  });
}

export async function updateLease(
  db: PrismaClient,
  organizationId: string,
  input: UpdateLeaseInput,
) {
  const existing = await getLease(db, organizationId, input.id);

  const period: LeasePeriod = {
    startDate: input.startDate ?? existing.startDate,
    endDate: input.endDate === undefined ? existing.endDate : input.endDate,
  };
  if (!isValidLeasePeriod(period)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Ende darf nicht vor dem Beginn liegen.",
    });
  }
  await assertNoOverlap(db, organizationId, existing.unitId, period, input.id);

  if (input.tenantIds) {
    await assertTenantsExist(db, organizationId, input.tenantIds);
  }

  return db.$transaction(async (tx) => {
    const lease = await tx.lease.update({
      where: { id: input.id },
      data: {
        type: input.type,
        startDate: input.startDate,
        endDate: input.endDate,
        baseRentCents: input.baseRentCents,
        operatingCostAdvanceCents: input.operatingCostAdvanceCents,
        depositCents: input.depositCents,
      },
      select: { id: true, unitId: true },
    });
    if (input.tenantIds) {
      await tx.leaseTenant.deleteMany({ where: { leaseId: input.id } });
      await tx.leaseTenant.createMany({
        data: input.tenantIds.map((tenantId) => ({
          leaseId: input.id,
          tenantId,
        })),
      });
    }
    return lease;
  });
}

export async function softDeleteLease(
  db: PrismaClient,
  organizationId: string,
  id: string,
  userId: string,
) {
  const lease = await getLease(db, organizationId, id);
  const result = await db.lease.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: { id: true, unitId: true },
  });
  await writeAuditLog(db, {
    organizationId,
    userId,
    action: "lease.softDelete",
    entityType: "Lease",
    entityId: id,
    metadata: { unitId: lease.unitId },
  });
  return result;
}

// ── Internal guards ──

async function assertUnitExists(
  db: PrismaClient,
  organizationId: string,
  unitId: string,
) {
  const unit = await db.unit.findFirst({
    where: { id: unitId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!unit) throw notFound("Einheit");
}

async function assertTenantsExist(
  db: PrismaClient,
  organizationId: string,
  tenantIds: string[],
) {
  const count = await db.tenant.count({
    where: { id: { in: tenantIds }, organizationId, deletedAt: null },
  });
  if (count !== tenantIds.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Mindestens ein Mieter ist ungültig.",
    });
  }
}

/**
 * Enforce that a Unit never has two overlapping active leases. Loads the unit's
 * other non-deleted leases and checks each against the candidate period using
 * the pure rule {@link leasePeriodsOverlap}.
 */
async function assertNoOverlap(
  db: PrismaClient,
  organizationId: string,
  unitId: string,
  period: LeasePeriod,
  excludeLeaseId?: string,
) {
  const others = await db.lease.findMany({
    where: {
      organizationId,
      unitId,
      deletedAt: null,
      ...(excludeLeaseId ? { id: { not: excludeLeaseId } } : {}),
    },
    select: { startDate: true, endDate: true },
  });
  const clash = others.some((o) =>
    leasePeriodsOverlap(period, { startDate: o.startDate, endDate: o.endDate }),
  );
  if (clash) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "Überschneidung: Für diese Einheit existiert bereits ein Mietverhältnis im gewählten Zeitraum.",
    });
  }
}
