// @vitest-environment node
//
// Payment allocation against PostgreSQL: partial -> PARTIAL, full -> PAID,
// overpayment -> Guthaben. Exercises status recomputation end to end.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateRentChargesForOrg } from "../charge.service";
import {
  getLeaseCreditCents,
  recordPayment,
} from "../payment.service";
import { db } from "~/server/db";

const itDb = process.env.DATABASE_URL ? it : it.skip;

let orgId: string;
let leaseId: string;

async function rp(year: number, month: number) {
  return db.rentPayment.findFirstOrThrow({
    where: { organizationId: orgId, leaseId, periodYear: year, periodMonth: month },
  });
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) return;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const org = await db.organization.create({
    data: { name: `Pay ${stamp}`, slug: `pay-${stamp}` },
  });
  orgId = org.id;
  const property = await db.property.create({
    data: { organizationId: orgId, name: "O", street: "S", houseNo: "1", postalCode: "1", city: "C" },
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
  // Two receivables: 2025-06 and 2025-07, 100.000 each.
  await generateRentChargesForOrg(db, orgId, { periodYear: 2025, periodMonth: 6 });
  await generateRentChargesForOrg(db, orgId, { periodYear: 2025, periodMonth: 7 });
});

afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  await db.organization.deleteMany({ where: { id: orgId } });
  await db.$disconnect();
});

describe("recordPayment (FIFO allocation + status)", () => {
  itDb("partial payment marks the oldest receivable PARTIAL", async () => {
    await recordPayment(db, orgId, {
      leaseId,
      amountCents: 40_000,
      valueDate: new Date(Date.UTC(2025, 5, 5)),
    });
    const june = await rp(2025, 6);
    expect(june.paidCents).toBe(40_000);
    expect(june.status).toBe("PARTIAL");
    expect(june.paidAt).toBeNull();
  });

  itDb("a further payment completes June, spills into July, leaves Guthaben", async () => {
    // 60.000 finishes June; 100.000 finishes July; 30.000 left -> credit.
    await recordPayment(db, orgId, {
      leaseId,
      amountCents: 190_000,
      valueDate: new Date(Date.UTC(2025, 6, 2)),
    });
    const june = await rp(2025, 6);
    const july = await rp(2025, 7);
    expect(june.status).toBe("PAID");
    expect(june.paidAt).not.toBeNull();
    expect(july.status).toBe("PAID");
    expect(await getLeaseCreditCents(db, orgId, leaseId)).toBe(30_000);
  });

  itDb("rejects an explicit allocation exceeding the open amount", async () => {
    const july = await rp(2025, 7);
    await expect(
      recordPayment(db, orgId, {
        leaseId,
        amountCents: 10_000,
        valueDate: new Date(),
        allocations: [{ rentPaymentId: july.id, amountCents: 10_000 }],
      }),
    ).rejects.toThrow();
  });
});
