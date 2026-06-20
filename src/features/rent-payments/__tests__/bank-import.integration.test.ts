// @vitest-environment node
//
// CSV import against PostgreSQL: staging is idempotent (re-import skips known
// rows), the suggestion finds the right lease, and confirming books a Payment
// that settles the receivable.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateRentChargesForOrg } from "../charge.service";
import {
  confirmBankTransaction,
  importBankStatement,
  listPendingTransactions,
} from "../bank-import.service";
import { db } from "~/server/db";

const itDb = process.env.DATABASE_URL ? it : it.skip;

let orgId: string;
let leaseId: string;

const csv = (rows: string[]) =>
  [
    "Buchungstag;Wertstellung;Verwendungszweck;Beguenstigter/Zahlungspflichtiger;Betrag",
    ...rows,
  ].join("\n");

beforeAll(async () => {
  if (!process.env.DATABASE_URL) return;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const org = await db.organization.create({
    data: { name: `Imp ${stamp}`, slug: `imp-${stamp}` },
  });
  orgId = org.id;
  const property = await db.property.create({
    data: { organizationId: orgId, name: "O", street: "S", houseNo: "1", postalCode: "1", city: "C" },
  });
  const unit = await db.unit.create({
    data: { organizationId: orgId, propertyId: property.id, label: "U" },
  });
  const tenant = await db.tenant.create({
    data: { organizationId: orgId, firstName: "Erika", lastName: "Musterfrau" },
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
  await generateRentChargesForOrg(db, orgId, { periodYear: 2025, periodMonth: 6 });
});

afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  await db.organization.deleteMany({ where: { id: orgId } });
  await db.$disconnect();
});

describe("importBankStatement", () => {
  itDb("stages rows, suggests the matching lease, and is idempotent", async () => {
    const content = csv([
      "03.06.2025;03.06.2025;Miete Juni Musterfrau;Erika Musterfrau;1.000,00",
    ]);
    const first = await importBankStatement(db, orgId, { fileName: "k.csv", content });
    expect(first.created).toBe(1);

    const pending = await listPendingTransactions(db, orgId);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.suggestedLeaseId).toBe(leaseId);

    // Re-import the identical file -> nothing new staged.
    const second = await importBankStatement(db, orgId, { fileName: "k.csv", content });
    expect(second.created).toBe(0);
    expect(second.duplicates).toBe(1);
  });

  itDb("confirming books a payment that settles the receivable", async () => {
    const pending = await listPendingTransactions(db, orgId);
    const txId = pending[0]!.id;
    const res = await confirmBankTransaction(db, orgId, {
      bankTransactionId: txId,
      leaseId,
    });
    expect(res.status).toBe("BOOKED");

    const june = await db.rentPayment.findFirstOrThrow({
      where: { organizationId: orgId, leaseId, periodYear: 2025, periodMonth: 6 },
    });
    expect(june.status).toBe("PAID");

    // Confirming again is a no-op (idempotent).
    const again = await confirmBankTransaction(db, orgId, {
      bankTransactionId: txId,
      leaseId,
    });
    expect(again.status).toBe("SKIPPED");
  });
});
