import "server-only";

import { TRPCError } from "@trpc/server";

import { type PrismaClient } from "../../../generated/prisma";

const notFound = (what: string) =>
  new TRPCError({ code: "NOT_FOUND", message: `${what} nicht gefunden.` });

/** Objekte für die Auswahl beim Anlegen einer Abrechnung. */
export function listPropertyOptions(db: PrismaClient, organizationId: string) {
  return db.property.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/** 4.5 Liste vergangener/aktueller Abrechnungen je Objekt. */
export async function listStatements(db: PrismaClient, organizationId: string) {
  const rows = await db.operatingCostStatement.findMany({
    where: { organizationId },
    orderBy: [{ periodYear: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      periodYear: true,
      periodStart: true,
      periodEnd: true,
      status: true,
      advanceBasis: true,
      property: { select: { id: true, name: true } },
      _count: { select: { results: true, lineItems: true } },
    },
  });
  return rows;
}

/** Vollständige Abrechnung für die Ergebnisvorschau und das PDF. */
export async function getStatementDetail(
  db: PrismaClient,
  organizationId: string,
  statementId: string,
) {
  const statement = await db.operatingCostStatement.findFirst({
    where: { id: statementId, organizationId },
    include: {
      property: {
        select: {
          id: true,
          name: true,
          street: true,
          houseNo: true,
          postalCode: true,
          city: true,
        },
      },
      lineItems: {
        orderBy: { sortOrder: "asc" },
        include: { shares: true },
      },
      results: true,
      consumptions: { select: { itemId: true, unitId: true, value: true } },
    },
  });
  if (!statement) throw notFound("Abrechnung");

  const units = await db.unit.findMany({
    where: { organizationId, propertyId: statement.property.id, deletedAt: null },
    orderBy: { label: "asc" },
    select: { id: true, label: true, areaSqm: true },
  });

  // Mieter-/Einheit-Namen je Ergebniszeile (über leaseId).
  const leaseIds = statement.results.map((r) => r.leaseId);
  const leases = await db.lease.findMany({
    where: { organizationId, id: { in: leaseIds } },
    select: {
      id: true,
      unit: { select: { id: true, label: true } },
      leaseTenants: { select: { tenant: { select: { firstName: true, lastName: true } } } },
    },
  });
  const leaseInfo = new Map(
    leases.map((l) => [
      l.id,
      {
        unitLabel: l.unit.label,
        unitId: l.unit.id,
        tenantNames: l.leaseTenants
          .map((lt) => `${lt.tenant.firstName} ${lt.tenant.lastName}`)
          .join(", "),
      },
    ]),
  );

  const results = statement.results
    .map((r) => ({
      ...r,
      unitLabel: leaseInfo.get(r.leaseId)?.unitLabel ?? "—",
      unitId: leaseInfo.get(r.leaseId)?.unitId ?? null,
      tenantNames: leaseInfo.get(r.leaseId)?.tenantNames ?? "(unbekannt)",
    }))
    .sort((a, b) => a.unitLabel.localeCompare(b.unitLabel, "de"));

  return { statement, units, results };
}

/** Detail einer einzelnen Mieter-Abrechnung (für das PDF je Mieter). */
export async function getLeaseStatement(
  db: PrismaClient,
  organizationId: string,
  statementId: string,
  leaseId: string,
) {
  const detail = await getStatementDetail(db, organizationId, statementId);
  const result = detail.results.find((r) => r.leaseId === leaseId);
  if (!result) throw notFound("Mieter-Ergebnis");
  return { ...detail, result };
}
