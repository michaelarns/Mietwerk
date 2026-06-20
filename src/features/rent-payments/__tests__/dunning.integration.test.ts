// @vitest-environment node
//
// Dunning state machine against PostgreSQL: monotone escalation, idempotency,
// and a settling payment that closes the Mahnlauf.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateRentChargesForOrg } from "../charge.service";
import { recordPayment } from "../payment.service";
import { runDunningForOrg } from "../dunning.service";
import { db } from "~/server/db";

const itDb = process.env.DATABASE_URL ? it : it.skip;

let orgId: string;
let leaseId: string;
const NOW = new Date(Date.UTC(2025, 2, 1)); // well past the 2025-01 due date

function levels() {
  return db.dunning
    .findMany({
      where: { organizationId: orgId, rentPayment: { leaseId } },
      orderBy: { createdAt: "asc" },
      select: { level: true },
    })
    .then((rows) => rows.map((r) => r.level));
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) return;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const org = await db.organization.create({
    data: { name: `Dun ${stamp}`, slug: `dun-${stamp}` },
  });
  orgId = org.id;
  const property = await db.property.create({
    data: { organizationId: orgId, name: "O", street: "S", houseNo: "1", postalCode: "1", city: "C" },
  });
  const unit = await db.unit.create({
    data: { organizationId: orgId, propertyId: property.id, label: "U" },
  });
  // Tenant intentionally without email -> letter channel TEXT, no SMTP needed.
  const tenant = await db.tenant.create({
    data: { organizationId: orgId, firstName: "Ohne", lastName: "Mail" },
  });
  const lease = await db.lease.create({
    data: {
      organizationId: orgId,
      unitId: unit.id,
      startDate: new Date(Date.UTC(2024, 0, 1)),
      baseRentCents: 80_000,
      operatingCostAdvanceCents: 20_000,
      leaseTenants: { create: { tenantId: tenant.id } },
    },
  });
  leaseId = lease.id;
  await generateRentChargesForOrg(db, orgId, { periodYear: 2025, periodMonth: 1 });
});

afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  await db.organization.deleteMany({ where: { id: orgId } });
  await db.$disconnect();
});

describe("runDunningForOrg", () => {
  itDb("escalates one monotone step per run and is idempotent", async () => {
    const r1 = await runDunningForOrg(db, orgId, NOW);
    expect(r1.issued).toBe(1);
    expect(await levels()).toEqual(["REMINDER"]);

    const r2 = await runDunningForOrg(db, orgId, NOW);
    expect(r2.issued).toBe(1);
    expect(await levels()).toEqual(["REMINDER", "FIRST"]);

    await runDunningForOrg(db, orgId, NOW);
    expect(await levels()).toEqual(["REMINDER", "FIRST", "SECOND"]);

    // No more levels configured -> nothing further, no duplicates.
    const r4 = await runDunningForOrg(db, orgId, NOW);
    expect(r4.issued).toBe(0);
    expect(await levels()).toEqual(["REMINDER", "FIRST", "SECOND"]);
  });

  itDb("a settling payment closes the Mahnlauf", async () => {
    const rp = await db.rentPayment.findFirstOrThrow({
      where: { organizationId: orgId, leaseId, periodYear: 2025, periodMonth: 1 },
    });
    await recordPayment(db, orgId, {
      leaseId,
      amountCents: rp.targetCents,
      valueDate: NOW,
    });
    const after = await runDunningForOrg(db, orgId, NOW);
    expect(after.issued).toBe(0);
    // The receivable is no longer a candidate.
    expect(after.candidates).toBe(0);
  });
});
