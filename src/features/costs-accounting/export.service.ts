/**
 * CSV-Export für den Steuerberater (ADR 0009: CSV statt Excel/PDF in Phase 3).
 * UTF-8 mit BOM (Excel-freundlich), Semikolon-getrennt, deutsches Dezimalkomma.
 * Reine String-Erzeugung — keine DB.
 */
import { type AnlageVResult } from "./anlage-v";
import { type AnlageVGroup } from "./category-rules";
import {
  ANLAGE_V_GROUP_LABELS,
  CATEGORY_LABELS,
  EXPENSE_TYPE_LABELS,
} from "./labels";

const BOM = "﻿";

/** Cent → "1234,56" (kein Tausenderpunkt, deutsches Komma, importfreundlich). */
function centsToCsv(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Feld für CSV quoten, wenn nötig. */
function csvField(value: string): string {
  if (/[";\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsv(rows: string[][]): string {
  return BOM + rows.map((r) => r.map(csvField).join(";")).join("\r\n") + "\r\n";
}

const ORDER: AnlageVGroup[] = [
  "AFA",
  "SCHULDZINSEN",
  "ERHALTUNGSAUFWAND",
  "LAUFENDE_BETRIEBSKOSTEN",
  "VERWALTUNGSKOSTEN",
  "SONSTIGE_WERBUNGSKOSTEN",
];

/** Anlage-V-Aufstellung eines Objekts/Jahres als CSV. */
export function buildAnlageVCsv(data: {
  property: { name: string };
  result: AnlageVResult;
}): { fileName: string; content: string } {
  const { property, result } = data;
  const rows: string[][] = [
    ["Position", "Betrag (EUR)"],
    ["Objekt", property.name],
    ["Jahr", String(result.year)],
    ["Einnahmen (Zufluss)", centsToCsv(result.einnahmenCents)],
    ["— Werbungskosten —", ""],
    ...ORDER.map((g): string[] => [
      ANLAGE_V_GROUP_LABELS[g],
      centsToCsv(result.groups[g]),
    ]),
    ["Summe Werbungskosten", centsToCsv(result.werbungskostenCents)],
    [
      result.isUeberschuss ? "Überschuss" : "Verlust",
      centsToCsv(result.ergebnisCents),
    ],
  ];
  return {
    fileName: `anlage-v_${property.name.replace(/\W+/g, "-")}_${result.year}.csv`,
    content: toCsv(rows),
  };
}

export interface CostExportRow {
  bookingDate: Date;
  paidDate: Date | null;
  propertyName: string | null;
  unitLabel: string | null;
  category: keyof typeof CATEGORY_LABELS;
  description: string | null;
  amountCents: number;
  netAmountCents: number | null;
  isAllocatable: boolean;
  expenseType: keyof typeof EXPENSE_TYPE_LABELS;
  isAfaRelevant: boolean;
  isLaborCost35a: boolean;
}

const de = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;

/** Kostenliste als CSV (Belegjournal für den Steuerberater). */
export function buildCostsCsv(rows: CostExportRow[]): {
  fileName: string;
  content: string;
} {
  const header = [
    "Belegdatum",
    "Zahlungsdatum",
    "Objekt",
    "Einheit",
    "Kategorie",
    "Beschreibung",
    "Betrag",
    "Netto",
    "Umlagefähig",
    "Behandlung",
    "AfA-relevant",
    "§35a",
  ];
  const body = rows.map((r): string[] => [
    de(r.bookingDate),
    r.paidDate ? de(r.paidDate) : "",
    r.propertyName ?? "",
    r.unitLabel ?? "",
    CATEGORY_LABELS[r.category],
    r.description ?? "",
    centsToCsv(r.amountCents),
    r.netAmountCents != null ? centsToCsv(r.netAmountCents) : "",
    r.isAllocatable ? "ja" : "nein",
    EXPENSE_TYPE_LABELS[r.expenseType],
    r.isAfaRelevant ? "ja" : "nein",
    r.isLaborCost35a ? "ja" : "nein",
  ]);
  return {
    fileName: "kosten-export.csv",
    content: toCsv([header, ...body]),
  };
}
