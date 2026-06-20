/**
 * Reine Kategorisierungs-Logik: Zuordnung jeder Kostenkategorie zu
 *  (a) umlagefähig-Default + Umlageschlüssel-Vorschlag nach BetrKV (für die
 *      Betriebskostenabrechnung in Phase 4 — hier werden die Felder nur gesetzt),
 *  (b) Anlage-V-Zeilengruppe (Werbungskosten-Gliederung).
 * Zusätzlich ein **regelbasierter** Kategorisierungsvorschlag aus dem Buchungstext
 * (keine KI — das ist Phase 6).
 *
 * Rechtlicher Rahmen: umlagefähige Betriebskosten nach § 2 BetrKV; nicht
 * umlagefähig sind insb. Instandhaltung/Reparatur und Verwaltungskosten
 * (⚠️ kaufmännisch/rechtlich, vor Abrechnung in Phase 4 zu verifizieren).
 */
import {
  type AllocationKey,
  type TransactionCategory,
} from "../../../generated/prisma";

/** Gliederung der Werbungskosten/Einnahmen nach Anlage-V-Zeilengruppen. */
export type AnlageVGroup =
  | "EINNAHMEN_MIETE"
  | "AFA"
  | "SCHULDZINSEN"
  | "ERHALTUNGSAUFWAND"
  | "LAUFENDE_BETRIEBSKOSTEN"
  | "VERWALTUNGSKOSTEN"
  | "SONSTIGE_WERBUNGSKOSTEN";

export interface CategoryInfo {
  /** Umlagefähig nach BetrKV (Default; pro Beleg überschreibbar). */
  allocatableByDefault: boolean;
  /** Vorgeschlagener Umlageschlüssel (null, wenn nicht umlagefähig). */
  suggestedKey: AllocationKey | null;
  /** Anlage-V-Zeilengruppe für den Sofortabzug (Werbungskosten). */
  anlageVGroup: AnlageVGroup;
}

/**
 * Stammtabelle je Kategorie. Umlageschlüssel sind die in der Praxis üblichen
 * Vorschläge (⚠️ anpassbar): Heiz-/Wasserkosten verbrauchsabhängig
 * (Heizkostenverordnung), die übrigen i.d.R. nach Wohnfläche.
 */
export const CATEGORY_INFO: Record<TransactionCategory, CategoryInfo> = {
  GRUNDSTEUER: { allocatableByDefault: true, suggestedKey: "WOHNFLAECHE", anlageVGroup: "LAUFENDE_BETRIEBSKOSTEN" },
  VERSICHERUNG: { allocatableByDefault: true, suggestedKey: "WOHNFLAECHE", anlageVGroup: "LAUFENDE_BETRIEBSKOSTEN" },
  HEIZUNG: { allocatableByDefault: true, suggestedKey: "VERBRAUCH", anlageVGroup: "LAUFENDE_BETRIEBSKOSTEN" },
  WASSER: { allocatableByDefault: true, suggestedKey: "VERBRAUCH", anlageVGroup: "LAUFENDE_BETRIEBSKOSTEN" },
  ABWASSER: { allocatableByDefault: true, suggestedKey: "VERBRAUCH", anlageVGroup: "LAUFENDE_BETRIEBSKOSTEN" },
  MUELL: { allocatableByDefault: true, suggestedKey: "EINHEITEN", anlageVGroup: "LAUFENDE_BETRIEBSKOSTEN" },
  HAUSREINIGUNG: { allocatableByDefault: true, suggestedKey: "WOHNFLAECHE", anlageVGroup: "LAUFENDE_BETRIEBSKOSTEN" },
  HAUSMEISTER: { allocatableByDefault: true, suggestedKey: "WOHNFLAECHE", anlageVGroup: "LAUFENDE_BETRIEBSKOSTEN" },
  STROM_ALLGEMEIN: { allocatableByDefault: true, suggestedKey: "WOHNFLAECHE", anlageVGroup: "LAUFENDE_BETRIEBSKOSTEN" },
  AUFZUG: { allocatableByDefault: true, suggestedKey: "WOHNFLAECHE", anlageVGroup: "LAUFENDE_BETRIEBSKOSTEN" },
  GARTENPFLEGE: { allocatableByDefault: true, suggestedKey: "WOHNFLAECHE", anlageVGroup: "LAUFENDE_BETRIEBSKOSTEN" },
  SCHORNSTEINFEGER: { allocatableByDefault: true, suggestedKey: "WOHNFLAECHE", anlageVGroup: "LAUFENDE_BETRIEBSKOSTEN" },
  // Nicht umlagefähig:
  INSTANDHALTUNG: { allocatableByDefault: false, suggestedKey: null, anlageVGroup: "ERHALTUNGSAUFWAND" },
  VERWALTUNG: { allocatableByDefault: false, suggestedKey: null, anlageVGroup: "VERWALTUNGSKOSTEN" },
  FINANZIERUNGSZINSEN: { allocatableByDefault: false, suggestedKey: null, anlageVGroup: "SCHULDZINSEN" },
  SONSTIGE: { allocatableByDefault: false, suggestedKey: null, anlageVGroup: "SONSTIGE_WERBUNGSKOSTEN" },
};

/** Liefert die Default-Zuordnung einer Kategorie. */
export function categoryInfo(category: TransactionCategory): CategoryInfo {
  return CATEGORY_INFO[category];
}

/** Kürzel: ist diese Kategorie standardmäßig umlagefähig? */
export function isAllocatableByDefault(category: TransactionCategory): boolean {
  return CATEGORY_INFO[category].allocatableByDefault;
}

// ── Regelbasierter Kategorievorschlag (keine KI) ────────────────────────────

/** Schlüsselwörter → Kategorie. Erste Übereinstimmung gewinnt. */
const KEYWORDS: Array<[RegExp, TransactionCategory]> = [
  [/grundsteuer|grundabgaben/i, "GRUNDSTEUER"],
  [/versicherung|police|haftpflicht/i, "VERSICHERUNG"],
  [/zins|darlehen|kredit|annuität|annuitaet|finanzierung/i, "FINANZIERUNGSZINSEN"],
  [/verwaltung|hausverwaltung|weg-verwalt/i, "VERWALTUNG"],
  // Reparaturen vor den laufenden Betriebskosten prüfen, damit z.B.
  // "Reparatur Heizung" als Instandhaltung (nicht als Heizkosten) erkannt wird.
  [/reparatur|instandhaltung|instandsetzung|sanierung|renovierung|modernisierung|handwerker/i, "INSTANDHALTUNG"],
  [/heiz|heizöl|heizoel|\bgas\b|fernwärme|fernwaerme|brennstoff/i, "HEIZUNG"],
  [/abwasser|kanal|schmutzwasser/i, "ABWASSER"],
  [/wasser|frischwasser/i, "WASSER"],
  [/müll|muell|abfall|entsorgung/i, "MUELL"],
  [/aufzug|lift|fahrstuhl/i, "AUFZUG"],
  [/hausmeister|hauswart/i, "HAUSMEISTER"],
  [/reinigung|treppenhaus/i, "HAUSREINIGUNG"],
  [/garten|grünpflege|gruenpflege/i, "GARTENPFLEGE"],
  [/schornstein|kaminkehrer|kamin/i, "SCHORNSTEINFEGER"],
  [/allgemeinstrom|hausstrom|\bstrom\b/i, "STROM_ALLGEMEIN"],
];

/**
 * Schlägt anhand des Buchungstexts eine Kategorie vor. Rein regelbasiert; gibt
 * `null` zurück, wenn kein Schlüsselwort greift (dann manuell wählen).
 */
export function suggestCategory(text: string | null | undefined): TransactionCategory | null {
  if (!text) return null;
  for (const [re, category] of KEYWORDS) {
    if (re.test(text)) return category;
  }
  return null;
}
