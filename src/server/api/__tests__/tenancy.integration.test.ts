// @vitest-environment node
//
// THE most important test of Phase 1: prove the tenant boundary holds. It
// exercises the two layers that enforce it for every new router:
//   1. `resolveActiveOrganization` — the resolver behind the `orgProcedure`
//      chokepoint: a user can only ever activate an org they belong to.
//   2. the org-scoped service functions every router delegates to — scoping all
//      reads/writes by `organizationId`.
// Mandant A must never read or mutate Mandant B's data. Runs against PostgreSQL.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveActiveOrganization } from "~/server/auth/tenancy";
import {
  createUnit,
  getProperty,
  listProperties,
  softDeleteProperty,
  updateProperty,
} from "~/features/properties/property.service";
import {
  getLease,
  getTenant,
  listLeasesForProperty,
  softDeleteLease,
  softDeleteTenant,
} from "~/features/tenants-leases/tenants-leases.service";
import {
  generateRentChargesForOrg,
  listRentPaymentsForLease,
} from "~/features/rent-payments/charge.service";
import { recordPayment } from "~/features/rent-payments/payment.service";
import { runDunningForOrg } from "~/features/rent-payments/dunning.service";
import {
  getLeasePaymentOverview,
  listOpenItems,
} from "~/features/rent-payments/queries.service";
import {
  createTransaction,
  getTransaction,
  softDeleteTransaction,
  updateTransaction,
} from "~/features/costs-accounting/costs.service";
import {
  getAnlageV,
  getAnschaffungsnahStatus,
  listTransactions,
} from "~/features/costs-accounting/queries.service";
import {
  createSchedule,
  deleteSchedule,
  getAfaEntriesForProperty,
  listSchedulesForProperty,
} from "~/features/tax-afa/afa.service";
import {
  createStatement,
  deleteStatement,
  finalizeStatement,
  runStatement,
  setConsumption,
} from "~/features/operating-cost-statement/statement.service";
import {
  getStatementDetail,
  listStatements,
} from "~/features/operating-cost-statement/queries.service";
import { generateStatementPdf } from "~/features/operating-cost-statement/pdf/statement-pdf.service";
import { db } from "~/server/db";

// Gate on DATABASE_URL so `npm test` stays green where no DB is available.
const itDb = process.env.DATABASE_URL ? it : it.skip;

async function seedOrg(tag: string) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const org = await db.organization.create({
    data: { name: `Integ ${tag}`, slug: `int-${tag}-${stamp}` },
  });
  const user = await db.user.create({
    data: { email: `int-${tag}-${stamp}@example.test`, name: tag },
  });
  await db.membership.create({
    data: { organizationId: org.id, userId: user.id, role: "OWNER" },
  });
  const property = await db.property.create({
    data: {
      organizationId: org.id,
      name: `Objekt ${tag}`,
      street: "Teststr",
      houseNo: "1",
      postalCode: "10000",
      city: "Teststadt",
    },
  });
  const unit = await db.unit.create({
    data: { organizationId: org.id, propertyId: property.id, label: `Unit ${tag}` },
  });
  const tenant = await db.tenant.create({
    data: { organizationId: org.id, firstName: "Max", lastName: tag },
  });
  const lease = await db.lease.create({
    data: {
      organizationId: org.id,
      unitId: unit.id,
      startDate: new Date(Date.UTC(2024, 0, 1)),
      baseRentCents: 50000,
      operatingCostAdvanceCents: 10000,
      leaseTenants: { create: { tenantId: tenant.id } },
    },
  });
  // A past-due receivable so the dunning/open-item isolation can be exercised.
  await generateRentChargesForOrg(db, org.id, {
    periodYear: 2025,
    periodMonth: 1,
  });
  const rp = await db.rentPayment.findFirstOrThrow({
    where: { organizationId: org.id, leaseId: lease.id },
    select: { id: true },
  });
  // A cost transaction and an AfA schedule, to exercise Phase-3 isolation.
  const transaction = await db.transaction.create({
    data: {
      organizationId: org.id,
      propertyId: property.id,
      bookingDate: new Date(Date.UTC(2025, 2, 1)),
      category: "INSTANDHALTUNG",
      amountCents: 100_000,
      expenseType: "SOFORTABZUG",
    },
  });
  const schedule = await db.depreciationSchedule.create({
    data: {
      organizationId: org.id,
      propertyId: property.id,
      method: "LINEAR",
      baseCents: 30_000_000,
      ratePercent: 2,
      startYear: 2024,
    },
  });
  // An allocatable cost + a Betriebskostenabrechnung, to exercise Phase-4 isolation.
  await db.transaction.create({
    data: {
      organizationId: org.id,
      propertyId: property.id,
      bookingDate: new Date(Date.UTC(2025, 1, 1)),
      category: "GRUNDSTEUER",
      amountCents: 30_000,
      isAllocatable: true,
      allocationKey: "WOHNFLAECHE",
      expenseType: "SOFORTABZUG",
    },
  });
  const statement = await createStatement(
    db,
    org.id,
    { propertyId: property.id, periodYear: 2025 },
    { userId: user.id },
  );
  return {
    orgId: org.id,
    userId: user.id,
    propertyId: property.id,
    unitId: unit.id,
    tenantId: tenant.id,
    leaseId: lease.id,
    rentPaymentId: rp.id,
    transactionId: transaction.id,
    scheduleId: schedule.id,
    statementId: statement.id,
  };
}

let A: Awaited<ReturnType<typeof seedOrg>>;
let B: Awaited<ReturnType<typeof seedOrg>>;
let outsiderId: string;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) return;
  A = await seedOrg("A");
  B = await seedOrg("B");
  const outsider = await db.user.create({
    data: { email: `int-out-${Date.now()}@example.test`, name: "Outsider" },
  });
  outsiderId = outsider.id;
});

afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  await db.organization.deleteMany({
    where: { id: { in: [A?.orgId, B?.orgId].filter(Boolean) } },
  });
  await db.user.deleteMany({
    where: {
      id: { in: [A?.userId, B?.userId, outsiderId].filter(Boolean) },
    },
  });
  await db.$disconnect();
});

describe("active organization resolver (orgProcedure chokepoint)", () => {
  itDb("falls back to the user's own org when requesting a foreign one", async () => {
    const m = await resolveActiveOrganization({
      db,
      userId: A.userId,
      requestedOrgId: B.orgId, // A is NOT a member of B
    });
    expect(m?.organizationId).toBe(A.orgId);
    expect(m?.organizationId).not.toBe(B.orgId);
  });

  itDb("returns null for a user without any membership", async () => {
    const m = await resolveActiveOrganization({ db, userId: outsiderId });
    expect(m).toBeNull();
  });
});

describe("org-scoped services isolate mandanten", () => {
  itDb("A lists only its own properties", async () => {
    const list = await listProperties(db, A.orgId);
    const ids = list.map((p) => p.id);
    expect(ids).toContain(A.propertyId);
    expect(ids).not.toContain(B.propertyId);
  });

  itDb("A reads its own property but not B's", async () => {
    await expect(getProperty(db, A.orgId, A.propertyId)).resolves.toBeTruthy();
    await expect(getProperty(db, A.orgId, B.propertyId)).rejects.toThrow();
  });

  itDb("A cannot update or soft-delete B's property", async () => {
    await expect(
      updateProperty(db, A.orgId, { id: B.propertyId, name: "hijack" }),
    ).rejects.toThrow();
    await expect(
      softDeleteProperty(db, A.orgId, B.propertyId, A.userId),
    ).rejects.toThrow();
  });

  itDb("A cannot add a unit under B's property", async () => {
    await expect(
      createUnit(db, A.orgId, { propertyId: B.propertyId, label: "x" }),
    ).rejects.toThrow();
  });

  itDb("A cannot read or soft-delete B's tenant", async () => {
    await expect(getTenant(db, A.orgId, B.tenantId)).rejects.toThrow();
    await expect(
      softDeleteTenant(db, A.orgId, B.tenantId, A.userId),
    ).rejects.toThrow();
  });

  itDb("A cannot read or delete B's lease, and sees none for B's property", async () => {
    await expect(getLease(db, A.orgId, B.leaseId)).rejects.toThrow();
    await expect(
      softDeleteLease(db, A.orgId, B.leaseId, A.userId),
    ).rejects.toThrow();
    await expect(
      listLeasesForProperty(db, A.orgId, B.propertyId),
    ).resolves.toHaveLength(0);
  });
});

describe("rent-payments services isolate mandanten", () => {
  itDb("A sees its own open items but never B's", async () => {
    const items = await listOpenItems(db, A.orgId, undefined);
    const ids = items.map((i) => i.id);
    expect(ids).toContain(A.rentPaymentId);
    expect(ids).not.toContain(B.rentPaymentId);
  });

  itDb("A cannot list B's receivables or read B's lease overview", async () => {
    await expect(
      listRentPaymentsForLease(db, A.orgId, B.leaseId),
    ).resolves.toHaveLength(0);
    await expect(
      getLeasePaymentOverview(db, A.orgId, B.leaseId),
    ).rejects.toThrow();
  });

  itDb("A cannot record a payment against B's lease", async () => {
    await expect(
      recordPayment(db, A.orgId, {
        leaseId: B.leaseId,
        amountCents: 1000,
        valueDate: new Date(),
      }),
    ).rejects.toThrow();
  });

  itDb("A's dunning run never dunns B's overdue receivable", async () => {
    const now = new Date(Date.UTC(2025, 5, 1));
    await runDunningForOrg(db, A.orgId, now);
    const bDunnings = await db.dunning.count({
      where: { rentPaymentId: B.rentPaymentId },
    });
    expect(bDunnings).toBe(0);
  });
});

describe("costs-accounting & tax-afa services isolate mandanten", () => {
  itDb("A lists only its own cost transactions", async () => {
    const list = await listTransactions(db, A.orgId, undefined);
    const ids = list.map((t) => t.id);
    expect(ids).toContain(A.transactionId);
    expect(ids).not.toContain(B.transactionId);
  });

  itDb("A cannot read, update or soft-delete B's transaction", async () => {
    await expect(getTransaction(db, A.orgId, B.transactionId)).rejects.toThrow();
    await expect(
      updateTransaction(db, A.orgId, { id: B.transactionId, amountCents: 999 }),
    ).rejects.toThrow();
    await expect(
      softDeleteTransaction(db, A.orgId, B.transactionId, { userId: A.userId }),
    ).rejects.toThrow();
  });

  itDb("A cannot book a cost onto B's property", async () => {
    await expect(
      createTransaction(
        db,
        A.orgId,
        {
          propertyId: B.propertyId,
          bookingDate: new Date(),
          category: "SONSTIGE",
          amountCents: 100,
          isAllocatable: false,
          isAfaRelevant: false,
          isLaborCost35a: false,
          expenseType: "SOFORTABZUG",
        },
        { userId: A.userId },
      ),
    ).rejects.toThrow();
  });

  itDb("A cannot read B's Anlage-V or anschaffungsnah-Status", async () => {
    await expect(getAnlageV(db, A.orgId, B.propertyId, 2025)).rejects.toThrow();
    await expect(
      getAnschaffungsnahStatus(db, A.orgId, B.propertyId),
    ).rejects.toThrow();
  });

  itDb("A cannot read, create or delete AfA on B's property", async () => {
    await expect(
      listSchedulesForProperty(db, A.orgId, B.propertyId),
    ).rejects.toThrow();
    await expect(
      getAfaEntriesForProperty(db, A.orgId, B.propertyId),
    ).resolves.toHaveLength(0);
    await expect(
      createSchedule(
        db,
        A.orgId,
        {
          propertyId: B.propertyId,
          method: "LINEAR",
          baseCents: 1000,
          startYear: 2024,
          startMonth: 1,
        },
        { userId: A.userId },
      ),
    ).rejects.toThrow();
    await expect(
      deleteSchedule(db, A.orgId, B.scheduleId, { userId: A.userId }),
    ).rejects.toThrow();
  });
});

describe("operating-cost-statement services isolate mandanten", () => {
  itDb("A lists only its own statements", async () => {
    const list = await listStatements(db, A.orgId);
    const ids = list.map((s) => s.id);
    expect(ids).toContain(A.statementId);
    expect(ids).not.toContain(B.statementId);
  });

  itDb("A cannot read B's statement detail", async () => {
    await expect(
      getStatementDetail(db, A.orgId, A.statementId),
    ).resolves.toBeTruthy();
    await expect(
      getStatementDetail(db, A.orgId, B.statementId),
    ).rejects.toThrow();
  });

  itDb("A cannot run, finalize or delete B's statement", async () => {
    await expect(
      runStatement(db, A.orgId, B.statementId, { userId: A.userId }),
    ).rejects.toThrow();
    await expect(
      finalizeStatement(db, A.orgId, B.statementId, { userId: A.userId }),
    ).rejects.toThrow();
    await expect(
      deleteStatement(db, A.orgId, B.statementId, { userId: A.userId }),
    ).rejects.toThrow();
  });

  itDb("A cannot set consumption or generate a PDF on B's statement", async () => {
    await expect(
      setConsumption(db, A.orgId, {
        statementId: B.statementId,
        itemId: "whatever",
        unitId: B.unitId,
        value: 100,
      }),
    ).rejects.toThrow();
    await expect(
      generateStatementPdf(db, A.orgId, B.statementId, B.leaseId, {
        userId: A.userId,
      }),
    ).rejects.toThrow();
  });
});
