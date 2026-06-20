/**
 * Reine Heizkosten-Regeln nach Heizkostenverordnung (HeizkostenV) — keine DB,
 * keine IO, voll testbar. Geld als Integer-Cent.
 *
 * RECHTLICHER RAHMEN (recherchiert, in dieser Session gegen Primärquellen
 * geprüft — siehe ADR 0010; ⚠️ = vom Auftraggeber freizugeben):
 *
 *  - § 7 Abs. 1 HeizkostenV (Heizung) / § 8 Abs. 1 HeizkostenV (Warmwasser):
 *    Von den Kosten sind **mindestens 50 v.H., höchstens 70 v.H.** nach dem
 *    erfassten Verbrauch zu verteilen; der Rest (Grundkosten) nach Wohn-/
 *    Nutzfläche oder umbautem Raum.
 *    Quelle: HeizkostenV § 7 Abs. 1 / § 8 Abs. 1
 *    (https://www.gesetze-im-internet.de/heizkostenv/__7.html, __8.html).
 *
 *  - § 12 Abs. 1 HeizkostenV (Kürzungsrecht): Wird entgegen der Verordnung
 *    **nicht verbrauchsabhängig** abgerechnet, darf der Nutzer seinen Anteil
 *    **um 15 v.H. kürzen**. ⇒ Das Tool warnt, statt das Risiko stillschweigend
 *    einzugehen (vereinfachte Behandlung = Hinweis).
 */

/** Verbrauchsanteil in Basispunkten (10000 bp = 100 %). */
export const BP_PER_100_PERCENT = 10000;

/** § 7 Abs. 1 / § 8 Abs. 1 HeizkostenV: erlaubter Korridor des Verbrauchsanteils. */
export const MIN_CONSUMPTION_SHARE_BP = 5000; // 50 % (gesetzliches Minimum)
export const MAX_CONSUMPTION_SHARE_BP = 7000; // 70 % (gesetzliches Maximum)

/**
 * Default-Verbrauchsanteil. ⚠️ ANNAHME (freizugeben): 50 % Verbrauch / 50 %
 * Grundkosten — die untere, stets zulässige Grenze. Pro Abrechnung und pro
 * Position konfigurierbar (Korridor 50–70 %).
 */
export const DEFAULT_CONSUMPTION_SHARE_BP = 5000;

/** § 12 Abs. 1 HeizkostenV: Kürzungsrecht des Mieters (15 %). Informativ. */
export const KUERZUNG_SHARE_BP = 1500;

/**
 * Begrenzt einen Verbrauchsanteil auf den gesetzlichen Korridor (50–70 %).
 * Werte außerhalb werden auf die nächste Grenze gezogen.
 */
export function clampConsumptionShareBp(bp: number): number {
  if (bp < MIN_CONSUMPTION_SHARE_BP) return MIN_CONSUMPTION_SHARE_BP;
  if (bp > MAX_CONSUMPTION_SHARE_BP) return MAX_CONSUMPTION_SHARE_BP;
  return Math.round(bp);
}

export interface HeatingSplit {
  /** Verbrauchskosten (nach erfasstem Verbrauch zu verteilen). */
  verbrauchCents: number;
  /** Grundkosten (nach Fläche zu verteilen). */
  grundCents: number;
}

/**
 * Teilt die Gesamtkosten einer Heizungs-/Warmwasserposition verlustfrei in
 * Verbrauchs- und Grundkosten gemäß `shareBp` (Verbrauchsanteil). Es gilt stets
 * `verbrauchCents + grundCents === totalCents` (kein Cent geht verloren).
 */
export function splitHeating(totalCents: number, shareBp: number): HeatingSplit {
  const clamped = clampConsumptionShareBp(shareBp);
  const verbrauchCents = Math.round((totalCents * clamped) / BP_PER_100_PERCENT);
  return { verbrauchCents, grundCents: totalCents - verbrauchCents };
}
