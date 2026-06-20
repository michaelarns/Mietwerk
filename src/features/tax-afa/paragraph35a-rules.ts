/**
 * Reine Hinweis-Logik zu § 35a EStG (niedrigste Priorität, ADR 0009).
 *
 * Die Steuerermäßigung des § 35a EStG gilt für den **eigenen Haushalt** des
 * Steuerpflichtigen und ist ausgeschlossen, **soweit die Aufwendungen
 * Werbungskosten/Betriebsausgaben sind** (§ 35a Abs. 5 S. 1). Bei **vermieteten**
 * Objekten sind Handwerkerleistungen für den Vermieter regelmäßig
 * **Werbungskosten → kein § 35a**. Der Arbeitslohnanteil ist aber für den
 * **Mieter** relevant (Bescheinigung). Mietwerk gibt daher nur einen Hinweis.
 */

export interface Paragraph35aHint {
  relevant: boolean;
  hint: string;
}

/**
 * Liefert einen Hinweis für eine als § 35a-Arbeitslohn markierte Ausgabe.
 * Es findet **keine** Berechnung statt (das wäre außerhalb des Scope von Phase 3).
 */
export function paragraph35aHint(isLaborCost35a: boolean): Paragraph35aHint {
  if (!isLaborCost35a) return { relevant: false, hint: "" };
  return {
    relevant: true,
    hint:
      "Arbeitslohnanteil einer Handwerkerleistung. Bei Vermietung i.d.R. " +
      "Werbungskosten (kein § 35a für den Vermieter); relevant ist der Anteil " +
      "v.a. für die Mieter-Bescheinigung. ⚠️ Steuerlich prüfen.",
  };
}
