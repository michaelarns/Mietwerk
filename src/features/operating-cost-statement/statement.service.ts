import "server-only";

import { TRPCError } from "@trpc/server";

import {
  type AllocationKey,
  type Prisma,
  type PrismaClient,
} from "../../../generated/prisma";
import { writeAuditLog } from "~/server/audit";
import { categoryInfo } from "../costs-accounting/category-rules";
import { CATEGORY_LABELS, ALLOCATION_KEY_LABELS } from "../costs-accounting/labels";
import {
  type EngineInput,
  type EngineLease,
  runEngine,
} from "./statement-engine";
import {
  nkPortionOf,
  proratedAdvanceSollCents,
  reconcile,
} from "./advance-reconciliation";
import {
  type CreateStatementInput,
  type SetConsumptionInput,
  type UpdateStatementInput,
} from "./statement.schema";

const DAY_MS = 24 * 60 * 60 * 1000;

const notFound = (what: string) =>
  new TRPCError({ code: "NOT_FOUND", message: `${what} nicht gefunden.` });

const conflict = (msg: string) =>
  new TRPCError({ code: "CONFLICT", message: msg });

/** Default-Abrechnungszeitraum: das Kalenderjahr (konfigurierbar). */
function defaultPeriod(year: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year, 11, 31)),
  };
}

function inclusiveDays(start: Date, end: Date): number {
  const s = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const e = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.floor((e - s) / DAY_MS) + 1;
}

async function getOwnedStatement(
  db: PrismaClient,
  organizationId: string,
  statementId: string,
) {
  const st = await db.operatingCostStatement.findFirst({
    where: { id: statementId, organizationId },
  });
  if (!st) throw notFound("Abrechnung");
  return st;
}

/**
 * 4.1 Anlegen einer Abrechnung für ein Objekt + Zeitraum. Die Positionen werden
 * aus den **umlagefähigen** Belegen (Phase 3, `isAllocatable`) des Objekts im
 * Zeitraum vorbefüllt, gruppiert je Kategorie, mit dem vorgeschlagenen
 * Umlageschlüssel (Beleg-Override > Kategorie-Default > Wohnfläche).
 *
 * ⚠️ Annahme: Kostenzuordnung nach **Leistungs-/Buchungsdatum** (bookingDate)
 * im Zeitraum (Betriebskosten-Leistungsprinzip), nicht nach Kassenbasis.
 */
export async function createStatement(
  db: PrismaClient,
  organizationId: string,
  input: CreateStatementInput,
  meta: { userId: string },
) {
  const property = await db.property.findFirst({
    where: { id: input.propertyId, organizationId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!property) throw notFound("Objekt");

  const fallback = defaultPeriod(input.periodYear);
  const periodStart = input.periodStart ?? fallback.start;
  const periodEnd = input.periodEnd ?? fallback.end;

  // § 556 Abs. 3 BGB: jährlich, höchstens 12 Monate.
  const days = inclusiveDays(periodStart, periodEnd);
  if (days < 1) throw conflict("Ungültiger Abrechnungszeitraum.");
  if (days > 366) {
    throw conflict(
      "Der Abrechnungszeitraum darf höchstens 12 Monate umfassen (§ 556 Abs. 3 BGB).",
    );
  }

  // Umlagefähige Belege des Objekts im Zeitraum (Leistungsprinzip).
  const txns = await db.transaction.findMany({
    where: {
      organizationId,
      deletedAt: null,
      isAllocatable: true,
      OR: [{ propertyId: input.propertyId }, { unit: { propertyId: input.propertyId } }],
      bookingDate: { gte: periodStart, lte: periodEnd },
    },
    select: { category: true, allocationKey: true, amountCents: true },
  });

  // Gruppieren je Kategorie → eine Position.
  const groups = new Map<
    string,
    { totalCents: number; allocationKey: AllocationKey | null; category: typeof txns[number]["category"] }
  >();
  for (const t of txns) {
    const g = groups.get(t.category);
    if (g) {
      g.totalCents += t.amountCents;
      g.allocationKey = g.allocationKey ?? t.allocationKey;
    } else {
      groups.set(t.category, {
        totalCents: t.amountCents,
        allocationKey: t.allocationKey,
        category: t.category,
      });
    }
  }

  const items = [...groups.values()].map((g, i) => {
    const key: AllocationKey =
      g.allocationKey ?? categoryInfo(g.category).suggestedKey ?? "WOHNFLAECHE";
    // Heizung/Brennstoffe (inkl. Warmwasser) → verbrauchsabhängiger Split.
    const consumptionSplit = g.category === "HEIZUNG";
    return {
      label: CATEGORY_LABELS[g.category],
      category: g.category,
      totalCents: g.totalCents,
      allocationKey: consumptionSplit ? "VERBRAUCH" : key,
      consumptionSplit,
      note: `Verteilung nach ${ALLOCATION_KEY_LABELS[consumptionSplit ? "VERBRAUCH" : key]}`,
      sortOrder: i,
    };
  });

  const statement = await db.operatingCostStatement.create({
    data: {
      organizationId,
      propertyId: input.propertyId,
      title: input.title ?? `Betriebskostenabrechnung ${input.periodYear}`,
      periodYear: input.periodYear,
      periodStart,
      periodEnd,
      advanceBasis: input.advanceBasis ?? "IST",
      heatingConsumptionShareBp: input.heatingConsumptionShareBp ?? 5000,
      createdById: meta.userId,
      lineItems: { create: items },
    },
    select: { id: true },
  });

  await writeAuditLog(db, {
    organizationId,
    userId: meta.userId,
    action: "statement.create",
    entityType: "OperatingCostStatement",
    entityId: statement.id,
    metadata: { propertyId: input.propertyId, periodYear: input.periodYear },
  });

  // Direkt einmal rechnen, damit die Vorschau sofort gefüllt ist.
  await runStatement(db, organizationId, statement.id, meta);
  return statement;
}

/**
 * 4.2/4.3 Abrechnung rechnen: Engine ausführen, Anteile je Position/Mieter und
 * Ergebnisse (Nachzahlung/Guthaben) neu persistieren. Idempotent (löscht und
 * schreibt neu). Nur im Entwurf zulässig.
 */
export async function runStatement(
  db: PrismaClient,
  organizationId: string,
  statementId: string,
  meta: { userId: string },
) {
  const st = await db.operatingCostStatement.findFirst({
    where: { id: statementId, organizationId },
    include: { lineItems: true, consumptions: true },
  });
  if (!st) throw notFound("Abrechnung");
  if (st.status !== "DRAFT") {
    throw conflict("Eine finalisierte Abrechnung kann nicht neu berechnet werden.");
  }

  // Einheiten des Objekts.
  const units = await db.unit.findMany({
    where: { organizationId, propertyId: st.propertyId, deletedAt: null },
    select: { id: true, areaSqm: true },
  });
  const unitIds = units.map((u) => u.id);

  // Mietverhältnisse, die im Zeitraum aktiv sind.
  const leases = await db.lease.findMany({
    where: {
      organizationId,
      deletedAt: null,
      unitId: { in: unitIds },
      startDate: { lte: st.periodEnd },
      OR: [{ endDate: null }, { endDate: { gte: st.periodStart } }],
    },
    include: { occupancies: true },
  });

  const engineLeases: EngineLease[] = leases.map((l) => ({
    id: l.id,
    unitId: l.unitId,
    startDate: l.startDate,
    endDate: l.endDate,
    occupancies: l.occupancies.map((o) => ({
      validFrom: o.validFrom,
      validTo: o.validTo,
      personCount: o.personCount,
    })),
  }));

  // Verbrauchswerte je Position/Einheit.
  const consumptionByItem = new Map<string, Record<string, number>>();
  for (const c of st.consumptions) {
    const m = consumptionByItem.get(c.itemId) ?? {};
    m[c.unitId] = c.value;
    consumptionByItem.set(c.itemId, m);
  }

  const engineInput: EngineInput = {
    period: { start: st.periodStart, end: st.periodEnd },
    units: units.map((u) => ({ id: u.id, areaSqm: u.areaSqm ?? 0 })),
    leases: engineLeases,
    items: st.lineItems.map((it) => ({
      id: it.id,
      label: it.label,
      totalCents: it.totalCents,
      allocationKey: it.allocationKey,
      consumptionSplit: it.consumptionSplit,
      consumptionShareBp: it.consumptionShareBp,
      consumptionByUnitId: consumptionByItem.get(it.id) ?? {},
    })),
    heatingConsumptionShareBp: st.heatingConsumptionShareBp,
  };

  const result = runEngine(engineInput);

  // Vorauszahlungen je Mietverhältnis (Soll prorater, Ist aus echten Zahlungen).
  const leaseById = new Map(leases.map((l) => [l.id, l]));
  const resultRows = await Promise.all(
    result.perLease.map(async (pl) => {
      const lease = leaseById.get(pl.leaseId)!;
      const advanceSollCents = proratedAdvanceSollCents({
        monthlyAdvanceCents: lease.operatingCostAdvanceCents,
        leaseStart: lease.startDate,
        leaseEnd: lease.endDate,
        periodStart: st.periodStart,
        periodEnd: st.periodEnd,
      });
      const advanceIstCents = await computeAdvanceIst(db, organizationId, lease, st.periodStart, st.periodEnd);
      const rec = reconcile({
        allocatedCents: pl.allocatedCents,
        advanceSollCents,
        advanceIstCents,
        basis: st.advanceBasis,
      });
      return {
        statementId: st.id,
        leaseId: pl.leaseId,
        allocatedCents: pl.allocatedCents,
        advanceSollCents,
        advanceIstCents,
        advanceCents: rec.advanceCents,
        balanceCents: rec.balanceCents,
        daysActive: pl.daysActive,
        periodDays: pl.periodDays,
      };
    }),
  );

  await db.$transaction(async (tx) => {
    await tx.operatingCostStatementItemShare.deleteMany({ where: { statementId: st.id } });
    await tx.operatingCostStatementResult.deleteMany({ where: { statementId: st.id } });

    if (result.itemShares.length > 0) {
      await tx.operatingCostStatementItemShare.createMany({
        data: result.itemShares.map((s) => ({
          organizationId,
          statementId: st.id,
          itemId: s.itemId,
          leaseId: s.leaseId,
          shareCents: s.shareCents,
          basisLabel: s.basisLabel,
        })),
      });
    }
    if (resultRows.length > 0) {
      await tx.operatingCostStatementResult.createMany({ data: resultRows });
    }
    await tx.operatingCostStatement.update({
      where: { id: st.id },
      data: { updatedAt: new Date() },
    });
  });

  await writeAuditLog(db, {
    organizationId,
    userId: meta.userId,
    action: "statement.run",
    entityType: "OperatingCostStatement",
    entityId: st.id,
    metadata: {
      totalCents: result.totalCents,
      landlordCents: result.landlordCents,
      leases: resultRows.length,
    },
  });

  return { id: st.id, landlordCents: result.landlordCents, totalCents: result.totalCents };
}

/** NK-Anteil der im Zeitraum tatsächlich gezahlten Mieten (Ist). */
async function computeAdvanceIst(
  db: PrismaClient,
  organizationId: string,
  lease: { id: string; baseRentCents: number; operatingCostAdvanceCents: number },
  periodStart: Date,
  periodEnd: Date,
): Promise<number> {
  const rentPayments = await db.rentPayment.findMany({
    where: { organizationId, leaseId: lease.id },
    select: { periodYear: true, periodMonth: true, paidCents: true },
  });
  let ist = 0;
  for (const rp of rentPayments) {
    const monthFirst = new Date(Date.UTC(rp.periodYear, rp.periodMonth - 1, 1));
    if (monthFirst >= periodStart && monthFirst <= periodEnd) {
      ist += nkPortionOf(rp.paidCents, lease.baseRentCents, lease.operatingCostAdvanceCents);
    }
  }
  return ist;
}

/** Verbrauchswert je Einheit für eine Position setzen (für VERBRAUCH/Heizung). */
export async function setConsumption(
  db: PrismaClient,
  organizationId: string,
  input: SetConsumptionInput,
) {
  const item = await db.operatingCostStatementItem.findFirst({
    where: { id: input.itemId, statement: { id: input.statementId, organizationId } },
    select: { id: true, statement: { select: { status: true } } },
  });
  if (!item) throw notFound("Position");
  if (item.statement.status !== "DRAFT") throw conflict("Abrechnung ist finalisiert.");

  return db.operatingCostConsumption.upsert({
    where: { itemId_unitId: { itemId: input.itemId, unitId: input.unitId } },
    create: {
      organizationId,
      statementId: input.statementId,
      itemId: input.itemId,
      unitId: input.unitId,
      value: input.value,
    },
    update: { value: input.value },
    select: { id: true },
  });
}

/** Statement-Stammdaten (Titel, Anrechnungsbasis, Heizkostenanteil) ändern. */
export async function updateStatement(
  db: PrismaClient,
  organizationId: string,
  input: UpdateStatementInput,
) {
  const st = await getOwnedStatement(db, organizationId, input.statementId);
  if (st.status !== "DRAFT") throw conflict("Abrechnung ist finalisiert.");
  return db.operatingCostStatement.update({
    where: { id: st.id },
    data: {
      title: input.title ?? undefined,
      advanceBasis: input.advanceBasis,
      heatingConsumptionShareBp: input.heatingConsumptionShareBp,
    },
    select: { id: true },
  });
}

/** 4.x Finalisieren: Abrechnung festschreiben (Audit-Log). */
export async function finalizeStatement(
  db: PrismaClient,
  organizationId: string,
  statementId: string,
  meta: { userId: string },
) {
  const st = await getOwnedStatement(db, organizationId, statementId);
  if (st.status !== "DRAFT") throw conflict("Abrechnung ist bereits finalisiert.");

  const result = await db.operatingCostStatement.update({
    where: { id: st.id },
    data: { status: "FINALIZED", finalizedAt: new Date() },
    select: { id: true, status: true },
  });
  await writeAuditLog(db, {
    organizationId,
    userId: meta.userId,
    action: "statement.finalize",
    entityType: "OperatingCostStatement",
    entityId: st.id,
  });
  return result;
}

/** Entwurf löschen (Hard-Delete erlaubt, da nicht personenbezogen; Audit). */
export async function deleteStatement(
  db: PrismaClient,
  organizationId: string,
  statementId: string,
  meta: { userId: string },
) {
  const st = await getOwnedStatement(db, organizationId, statementId);
  if (st.status !== "DRAFT") throw conflict("Nur Entwürfe können gelöscht werden.");
  await db.operatingCostStatement.delete({ where: { id: st.id } });
  await writeAuditLog(db, {
    organizationId,
    userId: meta.userId,
    action: "statement.delete",
    entityType: "OperatingCostStatement",
    entityId: st.id,
  });
  return { id: st.id };
}

export type AuditableDb = PrismaClient | Prisma.TransactionClient;
