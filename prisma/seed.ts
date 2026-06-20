/**
 * Seed script with ANONYMIZED demo data (DSGVO: no real personal data).
 * Creates two independent organizations (Mandanten) so multi-tenant isolation
 * can be exercised end to end.
 *
 * Run with: npm run db:seed
 */
import { PrismaClient } from "../generated/prisma";

const db = new PrismaClient();

async function seedOrganization(opts: {
  slug: string;
  name: string;
  ownerEmail: string;
  ownerName: string;
  city: string;
  postalCode: string;
}) {
  const org = await db.organization.upsert({
    where: { slug: opts.slug },
    update: { name: opts.name },
    create: { slug: opts.slug, name: opts.name, planTier: "STARTER" },
  });

  const owner = await db.user.upsert({
    where: { email: opts.ownerEmail },
    update: { name: opts.ownerName },
    create: { email: opts.ownerEmail, name: opts.ownerName },
  });

  await db.membership.upsert({
    where: {
      organizationId_userId: { organizationId: org.id, userId: owner.id },
    },
    update: { role: "OWNER" },
    create: { organizationId: org.id, userId: owner.id, role: "OWNER" },
  });

  // Property + units
  const property = await db.property.create({
    data: {
      organizationId: org.id,
      name: `${opts.city} – Musterstraße 1`,
      type: "MEHRFAMILIENHAUS",
      street: "Musterstraße",
      houseNo: "1",
      postalCode: opts.postalCode,
      city: opts.city,
      buildYear: 1998,
      purchaseDate: new Date(Date.UTC(2019, 5, 1)),
      purchasePriceCents: 65_000_000, // 650.000 €
      landValueCents: 13_000_000, // 130.000 €
      buildingValueCents: 52_000_000, // 520.000 €
      units: {
        create: [
          {
            organizationId: org.id,
            label: "EG links",
            floor: "EG",
            rooms: 3,
            areaSqm: 72,
            baseRentCents: 78_000,
            operatingCostAdvanceCents: 18_000,
          },
          {
            organizationId: org.id,
            label: "1. OG rechts",
            floor: "1. OG",
            rooms: 2,
            areaSqm: 58,
            baseRentCents: 64_000,
            operatingCostAdvanceCents: 15_000,
          },
        ],
      },
    },
    include: { units: true },
  });

  // AfA: linear 2 % auf den Gebäudeanteil
  await db.depreciationSchedule.create({
    data: {
      organizationId: org.id,
      propertyId: property.id,
      method: "LINEAR",
      baseCents: property.buildingValueCents ?? 0,
      ratePercent: 2,
      startYear: 2019,
    },
  });

  // One lease per unit with anonymized tenants
  const tenantNames = [
    { firstName: "Mieter", lastName: "Eins" },
    { firstName: "Mieter", lastName: "Zwei" },
  ];

  for (const [idx, unit] of property.units.entries()) {
    const tn = tenantNames[idx % tenantNames.length]!;
    const tenant = await db.tenant.create({
      data: {
        organizationId: org.id,
        firstName: tn.firstName,
        lastName: `${tn.lastName} (${opts.slug})`,
        email: `${opts.slug}-tenant${idx + 1}@example.test`,
      },
    });

    const lease = await db.lease.create({
      data: {
        organizationId: org.id,
        unitId: unit.id,
        type: "STANDARD",
        startDate: new Date(Date.UTC(2022, 0, 1)),
        baseRentCents: unit.baseRentCents ?? 0,
        operatingCostAdvanceCents: unit.operatingCostAdvanceCents ?? 0,
        depositCents: (unit.baseRentCents ?? 0) * 3,
        leaseTenants: { create: { tenantId: tenant.id } },
      },
    });

    // Rent payments for the first three months of 2025
    const target =
      (unit.baseRentCents ?? 0) + (unit.operatingCostAdvanceCents ?? 0);
    for (let month = 1; month <= 3; month++) {
      await db.rentPayment.create({
        data: {
          organizationId: org.id,
          leaseId: lease.id,
          periodYear: 2025,
          periodMonth: month,
          dueDate: new Date(Date.UTC(2025, month - 1, 3)),
          targetCents: target,
          paidCents: month === 3 ? 0 : target,
          status: month === 3 ? "OPEN" : "PAID",
          paidAt: month === 3 ? null : new Date(Date.UTC(2025, month - 1, 2)),
        },
      });
    }
  }

  // A couple of operating-cost transactions
  await db.transaction.createMany({
    data: [
      {
        organizationId: org.id,
        propertyId: property.id,
        bookingDate: new Date(Date.UTC(2025, 0, 15)),
        category: "VERSICHERUNG",
        description: "Gebäudeversicherung 2025",
        amountCents: 84_000,
        isAllocatable: true,
      },
      {
        organizationId: org.id,
        propertyId: property.id,
        bookingDate: new Date(Date.UTC(2025, 1, 10)),
        category: "GRUNDSTEUER",
        description: "Grundsteuer Q1",
        amountCents: 31_000,
        isAllocatable: true,
      },
      {
        organizationId: org.id,
        propertyId: property.id,
        bookingDate: new Date(Date.UTC(2025, 2, 5)),
        category: "INSTANDHALTUNG",
        description: "Reparatur Heizung",
        amountCents: 47_500,
        isAllocatable: false,
        isLaborCost35a: true,
      },
    ],
  });

  // ── More variety for realistic data ──

  // A third unit (DG) with a *beendetes* (ended) lease followed by an active one.
  const dg = await db.unit.create({
    data: {
      organizationId: org.id,
      propertyId: property.id,
      label: "DG Mitte",
      floor: "DG",
      rooms: 2,
      areaSqm: 49,
      baseRentCents: 60_000,
      operatingCostAdvanceCents: 12_000,
    },
  });
  const former = await db.tenant.create({
    data: {
      organizationId: org.id,
      firstName: "Vormieter",
      lastName: `Ehemalig (${opts.slug})`,
      email: `${opts.slug}-former@example.test`,
    },
  });
  await db.lease.create({
    data: {
      organizationId: org.id,
      unitId: dg.id,
      type: "STANDARD",
      startDate: new Date(Date.UTC(2019, 0, 1)),
      endDate: new Date(Date.UTC(2020, 11, 31)), // beendet
      baseRentCents: 55_000,
      operatingCostAdvanceCents: 11_000,
      depositCents: 165_000,
      leaseTenants: { create: { tenantId: former.id } },
    },
  });
  const dgTenant = await db.tenant.create({
    data: {
      organizationId: org.id,
      firstName: "Aktuell",
      lastName: `Bewohner (${opts.slug})`,
      email: `${opts.slug}-dg@example.test`,
    },
  });
  await db.lease.create({
    data: {
      organizationId: org.id,
      unitId: dg.id,
      type: "STAFFELMIETE",
      startDate: new Date(Date.UTC(2021, 1, 1)), // kein Overlap mit beendetem
      baseRentCents: 60_000,
      operatingCostAdvanceCents: 12_000,
      depositCents: 180_000,
      leaseTenants: { create: { tenantId: dgTenant.id } },
    },
  });

  // A second property: Einfamilienhaus rented to a couple (multi-tenant lease).
  const efh = await db.property.create({
    data: {
      organizationId: org.id,
      name: `${opts.city} – Gartenweg 7`,
      type: "EINFAMILIENHAUS",
      street: "Gartenweg",
      houseNo: "7",
      postalCode: opts.postalCode,
      city: opts.city,
      buildYear: 2012,
      purchaseDate: new Date(Date.UTC(2021, 8, 1)),
      purchasePriceCents: 48_000_000,
      landValueCents: 16_000_000,
      buildingValueCents: 32_000_000,
      units: {
        create: [
          {
            organizationId: org.id,
            label: "Gesamtobjekt",
            rooms: 5,
            areaSqm: 142,
            baseRentCents: 145_000,
            operatingCostAdvanceCents: 25_000,
          },
        ],
      },
    },
    include: { units: true },
  });
  const couple = await Promise.all([
    db.tenant.create({
      data: {
        organizationId: org.id,
        firstName: "Partner A",
        lastName: `Haushalt (${opts.slug})`,
        email: `${opts.slug}-efh-a@example.test`,
      },
    }),
    db.tenant.create({
      data: {
        organizationId: org.id,
        firstName: "Partner B",
        lastName: `Haushalt (${opts.slug})`,
        email: `${opts.slug}-efh-b@example.test`,
      },
    }),
  ]);
  await db.lease.create({
    data: {
      organizationId: org.id,
      unitId: efh.units[0]!.id,
      type: "INDEXMIETE",
      startDate: new Date(Date.UTC(2023, 3, 1)),
      baseRentCents: 145_000,
      operatingCostAdvanceCents: 25_000,
      depositCents: 435_000,
      leaseTenants: {
        create: [{ tenantId: couple[0].id }, { tenantId: couple[1].id }],
      },
    },
  });

  return org;
}

async function main() {
  // Clean slate for repeatable seeds (dev only).
  await db.organization.deleteMany({
    where: { slug: { in: ["wohnbau-nord", "immo-sued"] } },
  });

  await seedOrganization({
    slug: "wohnbau-nord",
    name: "Wohnbau Nord GbR",
    ownerEmail: "owner-nord@example.test",
    ownerName: "Inhaber Nord",
    city: "Hamburg",
    postalCode: "20095",
  });

  await seedOrganization({
    slug: "immo-sued",
    name: "Immo Süd e.K.",
    ownerEmail: "owner-sued@example.test",
    ownerName: "Inhaber Süd",
    city: "München",
    postalCode: "80331",
  });

  console.log(
    "✅ Seed complete: 2 Mandanten mit Objekten und Mietverhältnissen.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
