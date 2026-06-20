import "server-only";

import { TRPCError } from "@trpc/server";

import {
  type DepreciationMethod,
  type PrismaClient,
  type PropertyType,
} from "../../../generated/prisma";
import { writeAuditLog } from "~/server/audit";
import {
  type AfaYearAmount,
  type DepreciationEntry,
  DEGRESSIVE_RATE,
  checkDegressiveEligibility,
  computeDepreciationSchedule,
  deriveLinearRate,
} from "./afa-rules";
import { type CreateScheduleInput } from "./afa.schema";

/**
 * Data access für die AfA-Verwaltung. Org-gescoped; die Jahres-Beträge werden
 * **aus den gespeicherten Plan-Parametern berechnet** (afa-rules), nicht
 * redundant gespeichert — eine einzige Quelle der Wahrheit.
 */

const notFound = (what: string) =>
  new TRPCError({ code: "NOT_FOUND", message: `${what} nicht gefunden.` });

/** Wohnzwecke i.S.d. § 7 Abs. 4/5a — alles außer reinem Gewerbe (⚠️ Annahme). */
export function isResidential(type: PropertyType): boolean {
  return type !== "GEWERBE";
}

async function assertPropertyOwned(
  db: PrismaClient,
  organizationId: string,
  propertyId: string,
) {
  const found = await db.property.findFirst({
    where: { id: propertyId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!found) throw notFound("Objekt");
}

/** Berechnet den AfA-Plan (Jahr → Cent) aus einer gespeicherten Schedule-Zeile. */
export function scheduleToEntries(schedule: {
  method: DepreciationMethod;
  baseCents: number;
  ratePercent: number;
  startYear: number;
  startMonth: number;
  usefulLifeYears: number | null;
}): DepreciationEntry[] {
  return computeDepreciationSchedule({
    method: schedule.method,
    baseCents: schedule.baseCents,
    ratePercent: schedule.ratePercent,
    startYear: schedule.startYear,
    startMonth: schedule.startMonth,
    usefulLifeYears: schedule.usefulLifeYears ?? undefined,
  });
}

/** Alle AfA-Jahresbeträge eines Objekts (über alle Pläne summiert). */
export async function getAfaEntriesForProperty(
  db: PrismaClient,
  organizationId: string,
  propertyId: string,
): Promise<AfaYearAmount[]> {
  const schedules = await db.depreciationSchedule.findMany({
    where: { organizationId, propertyId },
  });
  const byYear = new Map<number, number>();
  for (const s of schedules) {
    for (const e of scheduleToEntries(s)) {
      byYear.set(e.year, (byYear.get(e.year) ?? 0) + e.amountCents);
    }
  }
  return [...byYear.entries()]
    .map(([year, amountCents]) => ({ year, amountCents }))
    .sort((a, b) => a.year - b.year);
}

/** AfA-Übersicht eines Objekts: Pläne inkl. berechneter Jahresbeträge. */
export async function listSchedulesForProperty(
  db: PrismaClient,
  organizationId: string,
  propertyId: string,
) {
  await assertPropertyOwned(db, organizationId, propertyId);
  const schedules = await db.depreciationSchedule.findMany({
    where: { organizationId, propertyId },
    orderBy: { startYear: "asc" },
  });
  return schedules.map((s) => ({
    ...s,
    entries: scheduleToEntries(s),
  }));
}

/**
 * Vorschlag für einen neuen AfA-Plan aus den Objekt-Stammdaten: Methode LINEAR,
 * Satz aus der Fertigstellung hergeleitet, Bemessungsgrundlage = Gebäudeanteil +
 * anteilige Anschaffungsnebenkosten. Zusätzlich die Eignung für die degressive AfA.
 */
export async function suggestScheduleForProperty(
  db: PrismaClient,
  organizationId: string,
  propertyId: string,
) {
  const property = await db.property.findFirst({
    where: { id: propertyId, organizationId, deletedAt: null },
  });
  if (!property) throw notFound("Objekt");

  const residential = isResidential(property.type);
  const completionYear =
    property.completionDate?.getUTCFullYear() ?? property.buildYear ?? null;
  const linear = deriveLinearRate({ completionYear, residential });

  const baseCents =
    (property.buildingValueCents ?? 0) + (property.acquisitionCostCents ?? 0);
  const startYear =
    property.completionDate?.getUTCFullYear() ??
    property.purchaseDate?.getUTCFullYear() ??
    new Date().getUTCFullYear();
  const startMonth =
    (property.purchaseDate ?? property.completionDate)?.getUTCMonth() != null
      ? ((property.purchaseDate ?? property.completionDate)!.getUTCMonth() + 1)
      : 1;

  const degressive = checkDegressiveEligibility({
    residential,
    constructionStart: property.constructionStartDate,
    acquisitionContractDate: property.purchaseDate,
    completionDate: property.completionDate,
  });

  return {
    method: "LINEAR" as DepreciationMethod,
    baseCents,
    ratePercent: linear.ratePercent,
    usefulLifeYears: linear.usefulLifeYears,
    startYear,
    startMonth,
    basis: linear.basis,
    degressive: { ...degressive, ratePercent: DEGRESSIVE_RATE },
  };
}

/** Legt einen AfA-Plan an. Fehlt der Satz, wird er hergeleitet. */
export async function createSchedule(
  db: PrismaClient,
  organizationId: string,
  input: CreateScheduleInput,
  actor: { userId: string },
) {
  const property = await db.property.findFirst({
    where: { id: input.propertyId, organizationId, deletedAt: null },
    select: { id: true, type: true, completionDate: true, buildYear: true },
  });
  if (!property) throw notFound("Objekt");

  let ratePercent = input.ratePercent ?? 0;
  if (input.method === "LINEAR" && !ratePercent) {
    const completionYear =
      property.completionDate?.getUTCFullYear() ?? property.buildYear ?? null;
    ratePercent = deriveLinearRate({
      completionYear,
      residential: isResidential(property.type),
    }).ratePercent;
  } else if (input.method === "DEGRESSIV" && !ratePercent) {
    ratePercent = DEGRESSIVE_RATE;
  } else if (input.method === "RESTNUTZUNGSDAUER") {
    if (!input.usefulLifeYears) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Restnutzungsdauer (Jahre) ist erforderlich.",
      });
    }
    ratePercent = 100 / input.usefulLifeYears;
  }

  const schedule = await db.depreciationSchedule.create({
    data: {
      organizationId,
      propertyId: input.propertyId,
      method: input.method,
      baseCents: input.baseCents,
      ratePercent,
      startYear: input.startYear,
      startMonth: input.startMonth ?? 1,
      usefulLifeYears: input.usefulLifeYears ?? null,
      note: input.note ?? null,
    },
    select: { id: true },
  });
  await writeAuditLog(db, {
    organizationId,
    userId: actor.userId,
    action: "afa.create",
    entityType: "DepreciationSchedule",
    entityId: schedule.id,
    metadata: { method: input.method, baseCents: input.baseCents, ratePercent },
  });
  return schedule;
}

/** Löscht einen AfA-Plan (kein personenbezogener Datensatz → Hard-Delete + Audit). */
export async function deleteSchedule(
  db: PrismaClient,
  organizationId: string,
  id: string,
  actor: { userId: string },
) {
  const found = await db.depreciationSchedule.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!found) throw notFound("AfA-Plan");
  await db.depreciationSchedule.delete({ where: { id } });
  await writeAuditLog(db, {
    organizationId,
    userId: actor.userId,
    action: "afa.delete",
    entityType: "DepreciationSchedule",
    entityId: id,
  });
  return { id };
}
