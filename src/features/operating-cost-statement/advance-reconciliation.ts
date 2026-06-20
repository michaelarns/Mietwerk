/**
 * Vorauszahlungsabgleich — reine Logik (keine DB/IO), Geld als Integer-Cent.
 *
 * Die Nebenkostenvorauszahlungen werden gegen die umgelegten Kosten gerechnet:
 *   balance = allocated − advance   (>0 = Nachzahlung, <0 = Guthaben).
 *
 * Auftraggeber-Entscheidung: angerechnet wird die **IST** (tatsächlich
 * geleistete) Vorauszahlung — die formelle Anforderung (BGH, § 259 BGB) verlangt
 * den Abzug der *geleisteten* Vorauszahlungen. Die SOLL-Vorauszahlung wird zur
 * Transparenz mitgeführt.
 *
 * ⚠️ Daten­modell-Annahme: RentPayment/Sollmiete bündeln Kaltmiete + NK-
 * Vorauszahlung. Der NK-Anteil wird anteilig im Verhältnis NK/(Kalt+NK) aus den
 * Beträgen herausgerechnet (aktuelle Lease-Konditionen). Vor Freigabe prüfen.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const BP = 10000;

function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

function toUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function inclusiveDays(startMs: number, endMs: number): number {
  if (endMs < startMs) return 0;
  return Math.floor((endMs - startMs) / DAY_MS) + 1;
}

/** NK-Anteil eines (Brutto-)Betrags Kalt+NK, anteilig im Verhältnis NK/(Kalt+NK). */
export function nkPortionOf(
  amountCents: number,
  baseRentCents: number,
  advanceCents: number,
): number {
  const total = baseRentCents + advanceCents;
  if (total <= 0) return 0;
  return Math.round((amountCents * advanceCents) / total);
}

/**
 * Vereinbarte NK-Vorauszahlung (SOLL) eines Mietverhältnisses für den
 * Abrechnungszeitraum, tagesgenau monatsweise prorater (konsistent zu Phase 2:
 * volle Monate ungerundet, Teilmonate mit einer Cent-Rundung je Monat).
 */
export function proratedAdvanceSollCents(opts: {
  monthlyAdvanceCents: number;
  leaseStart: Date;
  leaseEnd: Date | null;
  periodStart: Date;
  periodEnd: Date;
}): number {
  const { monthlyAdvanceCents } = opts;
  const periodStart = toUtcDay(opts.periodStart);
  const periodEnd = toUtcDay(opts.periodEnd);
  const leaseStart = toUtcDay(opts.leaseStart);
  const leaseEnd = opts.leaseEnd ? toUtcDay(opts.leaseEnd) : periodEnd;

  let total = 0;
  const start = new Date(periodStart);
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth() + 1; // 1-12

  // Über die Monate des Zeitraums iterieren.
  while (Date.UTC(year, month - 1, 1) <= periodEnd) {
    const dim = daysInMonth(year, month);
    const monthFirst = Date.UTC(year, month - 1, 1);
    const monthLast = Date.UTC(year, month - 1, dim);

    const spanStart = Math.max(monthFirst, periodStart, leaseStart);
    const spanEnd = Math.min(monthLast, periodEnd, leaseEnd);
    const activeDays = inclusiveDays(spanStart, spanEnd);

    if (activeDays > 0) {
      total +=
        activeDays >= dim
          ? monthlyAdvanceCents
          : Math.round((monthlyAdvanceCents * activeDays) / dim);
    }

    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return total;
}

export type AdvanceBasis = "SOLL" | "IST";

export interface ReconciliationInput {
  allocatedCents: number;
  advanceSollCents: number;
  advanceIstCents: number;
  basis: AdvanceBasis;
}

export interface ReconciliationResult {
  /** Tatsächlich angerechnete Vorauszahlung gemäß Basis. */
  advanceCents: number;
  /** allocated − advance (>0 = Nachzahlung, <0 = Guthaben). */
  balanceCents: number;
  isNachzahlung: boolean;
  isGuthaben: boolean;
}

/** Rechnet die Vorauszahlung gegen die umgelegten Kosten. */
export function reconcile(input: ReconciliationInput): ReconciliationResult {
  const advanceCents =
    input.basis === "IST" ? input.advanceIstCents : input.advanceSollCents;
  const balanceCents = input.allocatedCents - advanceCents;
  return {
    advanceCents,
    balanceCents,
    isNachzahlung: balanceCents > 0,
    isGuthaben: balanceCents < 0,
  };
}

/** Verbrauchsanteil-Hilfe: Basispunkte → lesbarer Prozentsatz (z.B. 5000 → "50"). */
export function bpToPercentLabel(bp: number): string {
  return (bp / BP * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 });
}
