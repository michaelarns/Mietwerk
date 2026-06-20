/**
 * Reine Logik zur Verteilung größeren Erhaltungsaufwands über 2–5 Jahre
 * (§ 82b EStDV). Nur für Gebäude im Privatvermögen, die überwiegend Wohnzwecken
 * dienen (⚠️ vom Nutzer zu beachten; Default ist der Sofortabzug). Die Verteilung
 * erfolgt **gleichmäßig**; die Cent-Rundung ist verlustfrei (Largest-Remainder).
 *
 * Bei Veräußerung/Wegfall der Einkünfteerzielung während des Verteilungszeitraums
 * ist der noch nicht abgezogene Rest im Ereignisjahr abzuziehen.
 */
import { distributeCents } from "~/lib/money";

export const MIN_YEARS = 2;
export const MAX_YEARS = 5;

export interface DistributionEntry {
  year: number;
  amountCents: number;
}

/**
 * Verteilt `totalCents` gleichmäßig auf `years` (2–5) Jahresscheiben ab
 * `startYear`. Die Summe der Scheiben ergibt exakt `totalCents`.
 */
export function distribute82b(
  totalCents: number,
  years: number,
  startYear: number,
): DistributionEntry[] {
  if (!Number.isInteger(years) || years < MIN_YEARS || years > MAX_YEARS) {
    throw new Error(`§ 82b EStDV: Verteilung nur über ${MIN_YEARS}–${MAX_YEARS} Jahre zulässig.`);
  }
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error("distribute82b: totalCents muss ein nicht-negativer Integer sein.");
  }
  const parts = distributeCents(totalCents, new Array<number>(years).fill(1));
  return parts.map((amountCents, i) => ({ year: startYear + i, amountCents }));
}

/**
 * Fasst bei einem Ereignis (Veräußerung etc.) im Jahr `eventYear` den ab diesem
 * Jahr noch offenen Rest in das Ereignisjahr zusammen (Sofortabzug des Rests).
 */
export function collapseOnEvent(
  entries: DistributionEntry[],
  eventYear: number,
): DistributionEntry[] {
  const before = entries.filter((e) => e.year < eventYear);
  const fromEvent = entries.filter((e) => e.year >= eventYear);
  if (fromEvent.length === 0) return [...before];
  const rest = fromEvent.reduce((sum, e) => sum + e.amountCents, 0);
  return [...before, { year: eventYear, amountCents: rest }];
}

/** AfA-/Verteilungsbetrag eines Jahres aus einer Verteilung (0, wenn nicht enthalten). */
export function distributionForYear(
  entries: DistributionEntry[],
  year: number,
): number {
  return entries.find((e) => e.year === year)?.amountCents ?? 0;
}
