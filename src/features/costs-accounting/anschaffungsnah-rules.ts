/**
 * Reine Logik zur 15 %-Grenze für **anschaffungsnahe Herstellungskosten**
 * (§ 6 Abs. 1 Nr. 1a EStG): Instandsetzungs-/Modernisierungsaufwendungen
 * innerhalb von **drei Jahren** nach Anschaffung, die **ohne USt 15 % der
 * Anschaffungskosten des Gebäudes** übersteigen, sind zwingend Herstellungs-
 * kosten (→ AfA, kein Sofortabzug).
 *
 * Ausnahmen (§ 6 Abs. 1 Nr. 1a Satz 2): Erweiterungen (§ 255 Abs. 2 HGB) sowie
 * jährlich üblicherweise anfallende Erhaltungsarbeiten zählen NICHT mit — diese
 * werden bereits beim Erfassen ausgeklammert (Aufrufer übergibt nur die
 * relevanten Netto-Beträge). ⚠️ Schwellen/Frist sind konfigurierbar (ADR 0009).
 */

/** Drei-Jahres-Frist ab Anschaffung (Übergang Besitz/Nutzen/Lasten). */
export const WINDOW_YEARS = 3;
/** Schwelle: 15 % der Gebäude-Anschaffungskosten (netto). */
export const THRESHOLD_RATIO = 0.15;
/** Ab diesem Anteil der Schwelle wird vorgewarnt (Default 80 %). */
export const DEFAULT_WARN_RATIO = 0.8;

export interface AnschaffungsnahCandidate {
  /** Maßgebliches Datum (Durchführung/Abfluss innerhalb der Frist). */
  date: Date;
  /** Netto-Betrag (ohne USt) in Cent. */
  netCents: number;
}

export interface AnschaffungsnahInput {
  purchaseDate: Date;
  /** Anschaffungskosten des Gebäudes (Bezugsgröße der 15 %) in Cent. */
  buildingAcquisitionCostCents: number;
  candidates: AnschaffungsnahCandidate[];
  /** Vorwarn-Anteil (Default 0,8). */
  warnRatio?: number;
}

export type AnschaffungsnahStatus = "UNTER" | "NAHE" | "UEBERSCHRITTEN";

export interface AnschaffungsnahResult {
  thresholdCents: number;
  cumulativeNetCents: number;
  /** Schwelle minus kumulierter Aufwand (negativ = überschritten). */
  remainingCents: number;
  windowStart: Date;
  windowEnd: Date;
  inWindowCount: number;
  status: AnschaffungsnahStatus;
}

/** Ende der Drei-Jahres-Frist (Anschaffung + 3 Jahre). */
export function windowEndFor(purchaseDate: Date): Date {
  return new Date(
    Date.UTC(
      purchaseDate.getUTCFullYear() + WINDOW_YEARS,
      purchaseDate.getUTCMonth(),
      purchaseDate.getUTCDate(),
    ),
  );
}

/** Liegt ein Datum im Drei-Jahres-Fenster [Anschaffung, Anschaffung+3J)? */
export function isWithinWindow(date: Date, purchaseDate: Date): boolean {
  return date.getTime() >= purchaseDate.getTime() && date.getTime() < windowEndFor(purchaseDate).getTime();
}

/**
 * Kumuliert die relevanten Netto-Aufwendungen im Drei-Jahres-Fenster und
 * vergleicht sie mit der 15 %-Schwelle. Liefert einen Status zum Warnen.
 */
export function assessAnschaffungsnah(input: AnschaffungsnahInput): AnschaffungsnahResult {
  const warnRatio = input.warnRatio ?? DEFAULT_WARN_RATIO;
  const thresholdCents = Math.round(input.buildingAcquisitionCostCents * THRESHOLD_RATIO);

  const inWindow = input.candidates.filter((c) => isWithinWindow(c.date, input.purchaseDate));
  const cumulativeNetCents = inWindow.reduce((sum, c) => sum + c.netCents, 0);

  let status: AnschaffungsnahStatus = "UNTER";
  if (cumulativeNetCents > thresholdCents) {
    status = "UEBERSCHRITTEN";
  } else if (thresholdCents > 0 && cumulativeNetCents >= thresholdCents * warnRatio) {
    status = "NAHE";
  }

  return {
    thresholdCents,
    cumulativeNetCents,
    remainingCents: thresholdCents - cumulativeNetCents,
    windowStart: input.purchaseDate,
    windowEnd: windowEndFor(input.purchaseDate),
    inWindowCount: inWindow.length,
    status,
  };
}
