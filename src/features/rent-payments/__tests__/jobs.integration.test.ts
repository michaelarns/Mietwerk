// @vitest-environment node
//
// Background-job logic against PostgreSQL:
//  - runRentChargeJob is idempotent (no Doppel-Soll on re-run),
//  - the per-org job functions are strictly tenant-isolated: a run for org A
//    never creates, reads or dunns org B's data.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateRentChargesForOrg } from "../charge.service";
import { runDunningForOrg } from "../dunning.service";
import { runRentChargeJob } from "../jobs";
import { db } from "~/server/db";

const itDb = process.env.DATABASE_URL ? it : it.skip;

async function seedOrgWithLease(tag: string) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const org = await db.organization.create({
    data: { name: `Job ${tag} ${stamp}`, slug: `job-${tag}-${stamp}` },
  });
  const property = await db.property.create({
    data: { organizationId: org.id, name: "O", street: "S", houseNo: "1", postalCode: "1", city: "C" },
  });
  const unit = await db.unit.create({
    data: { organizationId: org.id, propertyId: property.id, label: "U" },
  });
  const tenant = await db.tenant.create({
    data: { organizationId: org.id, firstName: "Ohne", lastName: "Mail" },
  });
  const lease = await db.lease.create({
    data: {
      organizationId: org.id,
      unitId: unit.id,
      startDate: new Date(Date.UTC(2024, 0, 1)),
      baseRentCents: 80_000,
      operatingCostAdvanceCents: 20_000,
      leaseTenants: { create: { tenantId: tenant.id } },
    },
  });
  return { orgId: org.id, leaseId: lease.id };
}

let A: Awaited<ReturnType<typeof seedOrgWithLease>>;
let B: Awaited<ReturnType<typeof seedOrgWithLease>>;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) return;
  A = await seedOrgWithLease("A");
  B = await seedOrgWithLease("B");
  // Give B an overdue receivable to test isolation of the dunning run.
  await generateRentChargesForOrg(db, B.orgId, { periodYear: 2025, periodMonth: 1 });
});

afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  await db.organization.deleteMany({ where: { id: { in: [A?.orgId, B?.orgId].filter(Boolean) } } });
  await db.$disconnect();
});

describe("runRentChargeJob", () => {
  itDb("is idempotent per lease across runs", async () => {
    const now = new Date(Date.UTC(2031, 4, 15)); // -> period 2031-05
    await runRentChargeJob(db, now);
    await runRentChargeJob(db, now);
    const countA = await db.rentPayment.count({
      where: { leaseId: A.leaseId, periodYear: 2031, periodMonth: 5 },
    });
    expect(countA).toBe(1);
  });
});

describe("dunning run tenant isolation", () => {
  itDb("a run for A never dunns B's receivable", async () => {
    const now = new Date(Date.UTC(2025, 2, 1));
    const a = await runDunningForOrg(db, A.orgId, now);
    expect(a.issued).toBe(0); // A has no overdue item
    const bDunnings = await db.dunning.count({
      where: { rentPayment: { leaseId: B.leaseId } },
    });
    expect(bDunnings).toBe(0); // A's run did not touch B

    // Only B's own run dunns B.
    const b = await runDunningForOrg(db, B.orgId, now);
    expect(b.issued).toBe(1);
    expect(
      await db.dunning.count({ where: { rentPayment: { leaseId: B.leaseId } } }),
    ).toBe(1);
  });

  itDb("a manual generate for A cannot target B's lease", async () => {
    const res = await generateRentChargesForOrg(db, A.orgId, {
      periodYear: 2027,
      periodMonth: 3,
      leaseId: B.leaseId, // belongs to B
    });
    expect(res.created).toBe(0);
    const leaked = await db.rentPayment.count({
      where: { leaseId: B.leaseId, periodYear: 2027, periodMonth: 3 },
    });
    expect(leaked).toBe(0);
  });
});
