import "server-only";

import { TRPCError } from "@trpc/server";

import { type PrismaClient } from "../../../generated/prisma";
import { getAfaEntriesForProperty } from "~/features/tax-afa/afa.service";
import { categoryInfo } from "./category-rules";
import {
  type AnschaffungsnahResult,
  assessAnschaffungsnah,
} from "./anschaffungsnah-rules";
import {
  aggregateAnlageV,
  type ExpenseRecord,
  type IncomeRecord,
} from "./anlage-v";
import { type ListTransactionsInput } from "./costs.schema";

const notFound = (what: string) =>
  new TRPCError({ code: "NOT_FOUND", message: `${what} nicht gefunden.` });

/** Kostenliste mit Objekt-/Einheit-Namen, optional gefiltert. */
export function listTransactions(
  db: PrismaClient,
  organizationId: string,
  filter?: ListTransactionsInput,
) {
  const yearWhere =
    filter?.year != null
      ? {
          bookingDate: {
            gte: new Date(Date.UTC(filter.year, 0, 1)),
            lt: new Date(Date.UTC(filter.year + 1, 0, 1)),
          },
        }
      : {};

  return db.transaction.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(filter?.propertyId ? { propertyId: filter.propertyId } : {}),
      ...(filter?.category ? { category: filter.category } : {}),
      ...yearWhere,
    },
    orderBy: { bookingDate: "desc" },
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, label: true } },
      _count: { select: { documents: { where: { deletedAt: null } } } },
    },
  });
}

/** Objekte für Auswahl-Felder (AfA-Übersicht, Anlage-V-Vorschau). */
export function listPropertyOptions(db: PrismaClient, organizationId: string) {
  return db.property.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * Status der 15 %-Grenze (anschaffungsnahe HK) für ein Objekt. Kumuliert
 * Instandsetzungs-/Modernisierungsaufwand (netto) im 3-Jahres-Fenster ab
 * Anschaffung. ⚠️ Welche Belege zählen, entscheidet der Nutzer; hier werden
 * Instandhaltung sowie als Herstellung/anschaffungsnah markierte Aufwendungen
 * berücksichtigt (jährlich übliche Wartung bitte als andere Kategorie erfassen).
 */
export async function getAnschaffungsnahStatus(
  db: PrismaClient,
  organizationId: string,
  propertyId: string,
): Promise<
  | { applicable: false; reason: string }
  | ({ applicable: true } & AnschaffungsnahResult)
> {
  const property = await db.property.findFirst({
    where: { id: propertyId, organizationId, deletedAt: null },
    select: { id: true, purchaseDate: true, buildingValueCents: true, acquisitionCostCents: true },
  });
  if (!property) throw notFound("Objekt");

  if (!property.purchaseDate || !property.buildingValueCents) {
    return {
      applicable: false,
      reason: "Kaufdatum und Gebäudeanteil müssen gepflegt sein.",
    };
  }

  const candidates = await db.transaction.findMany({
    where: {
      organizationId,
      deletedAt: null,
      OR: [{ propertyId }, { unit: { propertyId } }],
      AND: [
        {
          OR: [
            { category: "INSTANDHALTUNG" },
            { expenseType: "ANSCHAFFUNGSNAH" },
            { expenseType: "HERSTELLUNG_AKTIVIEREN" },
          ],
        },
      ],
    },
    select: { bookingDate: true, paidDate: true, amountCents: true, netAmountCents: true },
  });

  const result = assessAnschaffungsnah({
    purchaseDate: property.purchaseDate,
    buildingAcquisitionCostCents:
      property.buildingValueCents + (property.acquisitionCostCents ?? 0),
    candidates: candidates.map((c) => ({
      date: c.paidDate ?? c.bookingDate,
      netCents: c.netAmountCents ?? c.amountCents, // ⚠️ ohne Netto-Angabe: Brutto als Näherung
    })),
  });

  return { applicable: true, ...result };
}

/**
 * Vollständige Anlage-V-Aufstellung eines Objekts für ein Jahr (Kassenbasis):
 * Einnahmen (Zahlungseingänge), Werbungskosten und AfA.
 */
export async function getAnlageV(
  db: PrismaClient,
  organizationId: string,
  propertyId: string,
  year: number,
) {
  const property = await db.property.findFirst({
    where: { id: propertyId, organizationId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!property) throw notFound("Objekt");

  // Einnahmen: Zahlungseingänge für Mietverhältnisse unter diesem Objekt.
  const payments = await db.payment.findMany({
    where: {
      organizationId,
      deletedAt: null,
      lease: { unit: { propertyId } },
    },
    select: { valueDate: true, amountCents: true },
  });
  const income: IncomeRecord[] = payments.map((p) => ({
    cashDate: p.valueDate,
    amountCents: p.amountCents,
  }));

  // Ausgaben: alle Transaktionen des Objekts (auch Einheit-bezogene). Alle Jahre
  // laden, da § 82b-Verteilungen aus Vorjahren in dieses Jahr hineinwirken.
  const transactions = await db.transaction.findMany({
    where: {
      organizationId,
      deletedAt: null,
      OR: [{ propertyId }, { unit: { propertyId } }],
    },
    select: {
      bookingDate: true,
      paidDate: true,
      amountCents: true,
      category: true,
      expenseType: true,
      distributionYears: true,
      distributionStartYear: true,
    },
  });
  const expenses: ExpenseRecord[] = transactions.map((t) => ({
    cashDate: t.paidDate ?? t.bookingDate,
    amountCents: t.amountCents,
    group: categoryInfo(t.category).anlageVGroup,
    expenseType: t.expenseType,
    distributionYears: t.distributionYears,
    distributionStartYear: t.distributionStartYear,
  }));

  const afaEntries = await getAfaEntriesForProperty(db, organizationId, propertyId);

  const result = aggregateAnlageV({ year, income, expenses, afaEntries });
  return { property, result };
}
