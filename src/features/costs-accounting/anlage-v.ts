/**
 * Reine Anlage-V-Aggregation je Objekt und Jahr: Einnahmen − Werbungskosten −
 * AfA = Überschuss/Verlust, auf **Kassenbasis** (§ 11 EStG: Zufluss/Abfluss).
 *
 * Hinweise / ⚠️ markierte Annahmen (ADR 0009):
 *  - Einnahmen aus tatsächlichen Zahlungseingängen (`Payment.valueDate`),
 *    Ausgaben aus dem Zahlungsabfluss (`Transaction.paidDate`), NICHT aus dem
 *    Soll-/Rechnungsdatum.
 *  - Die 10-Tage-Regel (§ 11 Abs. 1 S. 2 / Abs. 2 S. 2) wird hier NICHT automatisch
 *    angewandt (Hinweis im UI); das Jahr ergibt sich aus dem Kassendatum.
 *  - Aktivierte Beträge (Herstellung/anschaffungsnah/Anschaffungsnebenkosten) sind
 *    KEINE direkten Werbungskosten — sie fließen über die AfA ein.
 *  - Anlage-V-Zeilennummern variieren je Steuerjahr → nur als Hinweis in `labels`.
 */
import { type ExpenseType } from "../../../generated/prisma";

import { distribute82b } from "./erhaltung-82b-rules";
import { type AnlageVGroup } from "./category-rules";

/** Werbungskosten-Gruppen (ohne Einnahmen). */
export const WERBUNGSKOSTEN_GROUPS: AnlageVGroup[] = [
  "AFA",
  "SCHULDZINSEN",
  "ERHALTUNGSAUFWAND",
  "LAUFENDE_BETRIEBSKOSTEN",
  "VERWALTUNGSKOSTEN",
  "SONSTIGE_WERBUNGSKOSTEN",
];

export interface ExpenseRecord {
  /** Kassendatum (Zahlungsabfluss); Fallback Belegdatum trifft der Aufrufer. */
  cashDate: Date;
  /** Gebuchter (Brutto-)Betrag in Cent = Werbungskosten bei Sofortabzug. */
  amountCents: number;
  /** Anlage-V-Gruppe aus der Kategorie (für den Sofortabzug-Pfad). */
  group: AnlageVGroup;
  expenseType: ExpenseType;
  distributionYears?: number | null;
  distributionStartYear?: number | null;
}

export interface IncomeRecord {
  /** Kassendatum des Zahlungseingangs (`Payment.valueDate`). */
  cashDate: Date;
  amountCents: number;
}

export interface AfaYearAmount {
  year: number;
  amountCents: number;
}

export interface AnlageVResult {
  year: number;
  einnahmenCents: number;
  afaCents: number;
  /** Werbungskosten je Gruppe (inkl. AFA). */
  groups: Record<AnlageVGroup, number>;
  /** Summe aller Werbungskosten inkl. AfA. */
  werbungskostenCents: number;
  /** Einnahmen − Werbungskosten (positiv = Überschuss). */
  ergebnisCents: number;
  isUeberschuss: boolean;
}

const yearOf = (d: Date) => d.getUTCFullYear();

/**
 * Beitrag einer einzelnen Ausgabe zu den Werbungskosten eines Jahres, abhängig
 * von der steuerlichen Behandlung. Gibt `null` zurück, wenn die Ausgabe in
 * diesem Jahr nicht (direkt) abziehbar ist.
 */
export function expenseContributionForYear(
  e: ExpenseRecord,
  year: number,
): { group: AnlageVGroup; amountCents: number } | null {
  switch (e.expenseType) {
    case "SOFORTABZUG":
      return yearOf(e.cashDate) === year
        ? { group: e.group, amountCents: e.amountCents }
        : null;
    case "VERTEILUNG_82B": {
      const years = e.distributionYears ?? 0;
      const start = e.distributionStartYear ?? yearOf(e.cashDate);
      if (years < 2 || years > 5) {
        // Ungültig konfiguriert → wie Sofortabzug im Kassenjahr behandeln.
        return yearOf(e.cashDate) === year
          ? { group: "ERHALTUNGSAUFWAND", amountCents: e.amountCents }
          : null;
      }
      const slice = distribute82b(e.amountCents, years, start).find((s) => s.year === year);
      return slice ? { group: "ERHALTUNGSAUFWAND", amountCents: slice.amountCents } : null;
    }
    // Aktiviert / nicht abziehbar → kein direkter Werbungskosten-Abzug.
    case "HERSTELLUNG_AKTIVIEREN":
    case "ANSCHAFFUNGSNAH":
    case "ANSCHAFFUNGSNEBENKOSTEN":
    case "NICHT_ABZIEHBAR":
      return null;
  }
}

/** Aggregiert Einnahmen, Werbungskosten und AfA zu einem Anlage-V-Ergebnis. */
export function aggregateAnlageV(opts: {
  year: number;
  income: IncomeRecord[];
  expenses: ExpenseRecord[];
  afaEntries: AfaYearAmount[];
}): AnlageVResult {
  const { year } = opts;

  const einnahmenCents = opts.income
    .filter((i) => yearOf(i.cashDate) === year)
    .reduce((sum, i) => sum + i.amountCents, 0);

  const groups: Record<AnlageVGroup, number> = {
    EINNAHMEN_MIETE: 0,
    AFA: 0,
    SCHULDZINSEN: 0,
    ERHALTUNGSAUFWAND: 0,
    LAUFENDE_BETRIEBSKOSTEN: 0,
    VERWALTUNGSKOSTEN: 0,
    SONSTIGE_WERBUNGSKOSTEN: 0,
  };

  for (const e of opts.expenses) {
    const c = expenseContributionForYear(e, year);
    if (c) groups[c.group] += c.amountCents;
  }

  const afaCents = opts.afaEntries
    .filter((a) => a.year === year)
    .reduce((sum, a) => sum + a.amountCents, 0);
  groups.AFA += afaCents;

  const werbungskostenCents = WERBUNGSKOSTEN_GROUPS.reduce(
    (sum, g) => sum + groups[g],
    0,
  );
  const ergebnisCents = einnahmenCents - werbungskostenCents;

  return {
    year,
    einnahmenCents,
    afaCents,
    groups,
    werbungskostenCents,
    ergebnisCents,
    isUeberschuss: ergebnisCents >= 0,
  };
}
