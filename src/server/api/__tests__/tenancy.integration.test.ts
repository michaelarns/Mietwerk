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
      startDate: new Date(),
      baseRentCents: 50000,
      leaseTenants: { create: { tenantId: tenant.id } },
    },
  });
  return {
    orgId: org.id,
    userId: user.id,
    propertyId: property.id,
    unitId: unit.id,
    tenantId: tenant.id,
    leaseId: lease.id,
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
