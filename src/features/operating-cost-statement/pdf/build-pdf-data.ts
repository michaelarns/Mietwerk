/**
 * Reiner Mapper: Abrechnungs-Detail → PDF-Daten je Mieter. Keine DB/IO, damit
 * die Aufbereitung der rechtlich relevanten Felder unabhängig testbar bleibt.
 */
import { type AllocationKey } from "../../../../generated/prisma";
import { formatDate } from "~/lib/date";

import { ADVANCE_BASIS_LABELS, ALLOCATION_KEY_LABELS } from "../labels";
import { type StatementPdfData } from "./statement-pdf";

export interface LeaseStatementInput {
  statement: {
    title: string | null;
    periodYear: number;
    periodStart: Date;
    periodEnd: Date;
    status: "DRAFT" | "FINALIZED" | "SENT";
    advanceBasis: "SOLL" | "IST";
    property: {
      name: string;
      street: string;
      houseNo: string;
      postalCode: string;
      city: string;
    };
    lineItems: Array<{
      id: string;
      label: string;
      allocationKey: AllocationKey;
      consumptionSplit: boolean;
      totalCents: number;
      shares: Array<{ leaseId: string | null; shareCents: number; basisLabel: string | null }>;
    }>;
  };
  result: {
    leaseId: string;
    unitLabel: string;
    tenantNames: string;
    allocatedCents: number;
    advanceCents: number;
    balanceCents: number;
    daysActive: number;
    periodDays: number;
  };
}

/** Letzter Tag der Abrechnungsfrist: Ende des 12. Monats nach Periodenende. */
function deadlineDate(periodEnd: Date): Date {
  return new Date(
    Date.UTC(periodEnd.getUTCFullYear() + 1, periodEnd.getUTCMonth() + 1, 0),
  );
}

export function buildStatementPdfData(
  input: LeaseStatementInput,
  orgName: string,
): StatementPdfData {
  const { statement: s, result } = input;
  const hasHeating = s.lineItems.some((i) => i.consumptionSplit);

  const rows = s.lineItems.map((item) => {
    const share = item.shares.find((sh) => sh.leaseId === result.leaseId);
    return {
      label: item.label,
      totalCents: item.totalCents,
      schluesselLabel: item.consumptionSplit
        ? "Verbrauch + Fläche (HeizkostenV)"
        : ALLOCATION_KEY_LABELS[item.allocationKey],
      basisLabel: share?.basisLabel ?? "—",
      shareCents: share?.shareCents ?? 0,
    };
  });

  const legalNotes = [
    "Soweit nichts anderes vereinbart ist, werden die Betriebskosten nach dem Anteil der Wohnfläche umgelegt (§ 556a Abs. 1 BGB).",
    "Auf leerstehende oder nicht vermietete Einheiten entfallende Kosten trägt der Vermieter und werden nicht auf die Mieter umgelegt (BGH VIII ZR 159/05).",
  ];
  if (hasHeating) {
    legalNotes.splice(
      1,
      0,
      "Heizungs- und Warmwasserkosten werden überwiegend verbrauchsabhängig abgerechnet (mind. 50 %, höchstens 70 % nach Verbrauch; §§ 7, 8 HeizkostenV).",
    );
  }

  return {
    orgName,
    propertyName: s.property.name,
    propertyAddress: `${s.property.street} ${s.property.houseNo}, ${s.property.postalCode} ${s.property.city}`,
    title: s.title ?? `Betriebskostenabrechnung ${s.periodYear}`,
    periodLabel: `${formatDate(s.periodStart)} – ${formatDate(s.periodEnd)}`,
    deadlineLabel: `Abrechnungsfrist: Die Abrechnung ist dem Mieter spätestens bis zum ${formatDate(deadlineDate(s.periodEnd))} mitzuteilen (Ende des 12. Monats nach dem Abrechnungszeitraum, § 556 Abs. 3 BGB).`,
    tenantNames: result.tenantNames,
    unitLabel: result.unitLabel,
    daysActive: result.daysActive,
    periodDays: result.periodDays,
    advanceBasisLabel: ADVANCE_BASIS_LABELS[s.advanceBasis],
    rows,
    allocatedCents: result.allocatedCents,
    advanceCents: result.advanceCents,
    balanceCents: result.balanceCents,
    legalNotes,
    draft: s.status === "DRAFT",
  };
}
