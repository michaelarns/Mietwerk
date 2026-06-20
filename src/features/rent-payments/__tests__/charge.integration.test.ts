// @vitest-environment node
//
// Sollstellung idempotency against PostgreSQL: re-running the generation for the
// same period must never create a Doppel-Soll.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateRentChargesForOrg } from "../charge.service";
import { db } from "~/server/db";

const itDb = process.env.DATABASE_URL ? it : it.skip;

let orgId: string;
let leaseId: string;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) return;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const org = await db.organization.create({
    data: { name: `Charge ${stamp}`, slug: `charge-${stamp}` },
  });
  orgId = org.id;
  const property = await db.property.create({
    data: {
      organizationId: orgId,
      name: "Obj",
      street: "S",
      houseNo: "1",
      postalCode: "10000",
      city: "Stadt",
    },
  });
  const unit = await db.unit.create({
    data: { organizationId: orgId, propertyId: property.id, label: "U" },
  });
  const lease = await db.lease.create({
    data: {
      organizationId: orgId,
      unitId: unit.id,
      startDate: new Date(Date.UTC(2024, 0, 1)),
      baseRentCents: 80_000,
      operatingCostAdvanceCents: 20_000,
    },
  });
  leaseId = lease.id;
});

afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  await db.organization.deleteMany({ where: { id: orgId } });
  await db.$disconnect();
});

describe("generateRentChargesForOrg", () => {
  itDb("creates one receivable for an active lease and is idempotent", async () => {
    const first = await generateRentChargesForOrg(db, orgId, {
      periodYear: 2025,
      periodMonth: 6,
    });
    expect(first.created).toBe(1);

    const second = await generateRentChargesForOrg(db, orgId, {
      periodYear: 2025,
      periodMonth: 6,
    });
    expect(second.created).toBe(0);
    expect(second.alreadyExisted).toBe(1);

    const rows = await db.rentPayment.findMany({
      where: { organizationId: orgId, leaseId, periodYear: 2025, periodMonth: 6 },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.targetCents).toBe(100_000); // full month
    expect(rows[0]!.status).toBe("OPEN");
  });
});
