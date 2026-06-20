/**
 * Reine AfA-Rechenlogik (Gebäudeabschreibung). Keine DB, keine Prisma-Queries —
 * direkt testbar. Sätze und Regeln sind recherchiert und in ADR 0009 mit Quellen
 * belegt; alle Werte sind ⚠️ steuerlich sensibel und konfigurierbar.
 *
 * Rechtsgrundlagen:
 *  - § 7 Abs. 4 EStG  — lineare Gebäude-AfA (2,5 % / 2 % / 3 %).
 *  - § 7 Abs. 4 S. 2  — kürzere tatsächliche Nutzungsdauer (RESTNUTZUNGSDAUER).
 *  - § 7 Abs. 5a EStG — degressive AfA (5 %) für neue Wohngebäude
 *                       (Wachstumschancengesetz; Baubeginn 1.10.2023–30.9.2029).
 *  - § 7 Abs. 1 S. 4  — monatsgenaue AfA im Anschaffungs-/Fertigstellungsjahr.
 */
import { type DepreciationMethod } from "../../../generated/prisma";

// ── Konstanten (⚠️ steuerlich sensibel, ADR 0009) ───────────────────────────

/** Linearer AfA-Satz für Gebäude, fertiggestellt vor dem 1.1.1925 (40 Jahre). */
export const RATE_BEFORE_1925 = 2.5;
/** Linearer Satz für Gebäude, fertiggestellt 1925–2022 (50 Jahre). */
export const RATE_1925_TO_2022 = 2.0;
/** Linearer Satz für Wohngebäude, fertiggestellt nach dem 31.12.2022 (≈33⅓ Jahre). */
export const RATE_RESIDENTIAL_FROM_2023 = 3.0;
/** Degressiver Satz für neue Wohngebäude (§ 7 Abs. 5a — final 5 %, nicht 6 %). */
export const DEGRESSIVE_RATE = 5.0;
/** Fallback-Nutzungsdauer (Jahre) für den Wechsel der degressiven AfA zur linearen. */
export const DEGRESSIVE_FALLBACK_USEFUL_LIFE = 33;

/** Förderzeitraum degressive AfA: Baubeginn ab diesem Datum (inkl.). */
export const DEGRESSIVE_START = Date.UTC(2023, 9, 1); // 2023-10-01
/** Förderzeitraum degressive AfA: Baubeginn bis zu diesem Datum (inkl.). */
export const DEGRESSIVE_END = Date.UTC(2029, 8, 30); // 2029-09-30

// ── Linearen Satz aus der Fertigstellung herleiten ──────────────────────────

export interface LinearRateResult {
  ratePercent: number;
  usefulLifeYears: number;
  /** Menschlich lesbare Begründung des hergeleiteten Satzes. */
  basis: string;
}

/**
 * Leitet den linearen AfA-Satz nach § 7 Abs. 4 EStG aus dem Fertigstellungsjahr
 * her. Der erhöhte 3 %-Satz gilt nur für **Wohnzwecke** und Fertigstellung nach
 * dem 31.12.2022. Bei unbekannter Fertigstellung wird konservativ 2 % (50 Jahre)
 * angenommen — ⚠️ vom Nutzer zu prüfen.
 */
export function deriveLinearRate(opts: {
  completionYear?: number | null;
  residential: boolean;
}): LinearRateResult {
  const year = opts.completionYear ?? null;

  if (year === null) {
    return {
      ratePercent: RATE_1925_TO_2022,
      usefulLifeYears: 50,
      basis: "Fertigstellung unbekannt — Annahme 2 % (50 Jahre), bitte prüfen.",
    };
  }
  if (year < 1925) {
    return {
      ratePercent: RATE_BEFORE_1925,
      usefulLifeYears: 40,
      basis: "Fertigstellung vor 1925 → 2,5 % (40 Jahre), § 7 Abs. 4 S. 1 Nr. 2c.",
    };
  }
  if (opts.residential && year >= 2023) {
    return {
      ratePercent: RATE_RESIDENTIAL_FROM_2023,
      usefulLifeYears: 33,
      basis:
        "Wohngebäude, fertiggestellt nach 31.12.2022 → 3 % (~33 Jahre), § 7 Abs. 4 S. 1 Nr. 2a.",
    };
  }
  return {
    ratePercent: RATE_1925_TO_2022,
    usefulLifeYears: 50,
    basis: "Fertigstellung 1925–2022 → 2 % (50 Jahre), § 7 Abs. 4 S. 1 Nr. 2b.",
  };
}

// ── Eignung für die degressive AfA (§ 7 Abs. 5a) ────────────────────────────

export interface DegressiveEligibility {
  eligible: boolean;
  reason: string;
}

/**
 * Prüft (als Hinweis, nicht bindend), ob die degressive AfA in Frage kommt:
 * nur Wohnzwecke; **Baubeginn** im Förderzeitraum 1.10.2023–30.9.2029, ODER
 * Anschaffung mit obligatorischem Kaufvertrag im Jahr der Fertigstellung
 * (Vertrag im Förderzeitraum). Endgültige Beurteilung trifft der Steuerberater.
 */
export function checkDegressiveEligibility(opts: {
  residential: boolean;
  constructionStart?: Date | null;
  acquisitionContractDate?: Date | null;
  completionDate?: Date | null;
}): DegressiveEligibility {
  if (!opts.residential) {
    return {
      eligible: false,
      reason: "Degressive AfA nur für Gebäude, die Wohnzwecken dienen.",
    };
  }

  const inWindow = (d: Date) => {
    const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return t >= DEGRESSIVE_START && t <= DEGRESSIVE_END;
  };

  if (opts.constructionStart && inWindow(opts.constructionStart)) {
    return {
      eligible: true,
      reason: "Baubeginn im Förderzeitraum (1.10.2023–30.9.2029).",
    };
  }

  if (opts.acquisitionContractDate && opts.completionDate) {
    const contractInWindow = inWindow(opts.acquisitionContractDate);
    const contractInCompletionYear =
      opts.acquisitionContractDate.getUTCFullYear() ===
      opts.completionDate.getUTCFullYear();
    if (contractInWindow && contractInCompletionYear) {
      return {
        eligible: true,
        reason:
          "Anschaffung: Kaufvertrag im Förderzeitraum und im Jahr der Fertigstellung.",
      };
    }
  }

  return {
    eligible: false,
    reason:
      "Kein Baubeginn im Förderzeitraum bzw. keine begünstigte Anschaffung erkennbar.",
  };
}

// ── AfA-Plan berechnen ──────────────────────────────────────────────────────

export interface DepreciationInput {
  method: DepreciationMethod;
  /** Bemessungsgrundlage in Cent: Gebäudeanteil + anteilige Nebenkosten. */
  baseCents: number;
  startYear: number;
  /** 1–12; monatsgenaue AfA im ersten Jahr (§ 7 Abs. 1 S. 4). Default 1. */
  startMonth?: number;
  /** Linearer/degressiver Satz in Prozent. Bei RESTNUTZUNGSDAUER ignoriert. */
  ratePercent?: number;
  /** (Rest-)Nutzungsdauer in Jahren. Pflicht bei RESTNUTZUNGSDAUER. */
  usefulLifeYears?: number;
}

export interface DepreciationEntry {
  year: number;
  amountCents: number;
}

/** AfA-Betrag eines Jahres (Aggregat über alle Pläne eines Objekts). */
export interface AfaYearAmount {
  year: number;
  amountCents: number;
}

/** Anteil des ersten Jahres (monatsgenau): ab Monat `startMonth` bis Dezember. */
function firstYearFactor(startMonth: number): number {
  const m = Math.min(12, Math.max(1, startMonth));
  return (12 - m + 1) / 12;
}

/**
 * Erzeugt den vollständigen AfA-Plan (Jahr → Betrag in Cent). Die Summe aller
 * Jahresbeträge ergibt **exakt** die Bemessungsgrundlage (verlustfreie
 * Cent-Rundung). Im Anschaffungs-/Fertigstellungsjahr wird monatsgenau gekürzt;
 * der gekürzte Teil verlängert den Plan um ein (Teil-)Jahr am Ende.
 */
export function computeDepreciationSchedule(
  input: DepreciationInput,
): DepreciationEntry[] {
  const { method, baseCents, startYear } = input;
  if (!Number.isInteger(baseCents) || baseCents < 0) {
    throw new Error("computeDepreciationSchedule: baseCents muss ein nicht-negativer Integer sein.");
  }
  if (baseCents === 0) return [];

  const factor = firstYearFactor(input.startMonth ?? 1);

  if (method === "DEGRESSIV") {
    const rate = input.ratePercent ?? DEGRESSIVE_RATE;
    const life = input.usefulLifeYears ?? DEGRESSIVE_FALLBACK_USEFUL_LIFE;
    return computeDegressive(baseCents, startYear, rate, life, factor);
  }

  // LINEAR und RESTNUTZUNGSDAUER teilen dieselbe Mechanik (fester Jahresbetrag).
  let annual: number;
  if (method === "RESTNUTZUNGSDAUER") {
    if (!input.usefulLifeYears || input.usefulLifeYears <= 0) {
      throw new Error("RESTNUTZUNGSDAUER benötigt usefulLifeYears > 0.");
    }
    annual = Math.round(baseCents / input.usefulLifeYears);
  } else {
    if (!input.ratePercent || input.ratePercent <= 0) {
      throw new Error("LINEAR benötigt ratePercent > 0.");
    }
    annual = Math.round((baseCents * input.ratePercent) / 100);
  }
  if (annual <= 0) annual = baseCents; // Schutz gegen Endlosschleife bei Mini-Basen

  return spreadFixedAnnual(baseCents, startYear, annual, factor);
}

/** Fester Jahresbetrag (linear/RND), erstes Jahr monatsgenau, Rest am Ende. */
function spreadFixedAnnual(
  baseCents: number,
  startYear: number,
  annual: number,
  factor: number,
): DepreciationEntry[] {
  const entries: DepreciationEntry[] = [];
  let remaining = baseCents;
  let year = startYear;

  const first = Math.min(remaining, Math.round(annual * factor));
  entries.push({ year, amountCents: first });
  remaining -= first;
  year += 1;

  while (remaining > 0) {
    const amt = Math.min(annual, remaining);
    entries.push({ year, amountCents: amt });
    remaining -= amt;
    year += 1;
  }
  return entries;
}

/**
 * Degressive AfA: 5 % vom Restwert, mit optimalem **Wechsel zur linearen AfA**
 * (sobald die lineare AfA auf die Restnutzungsdauer den degressiven Betrag
 * übersteigt — § 7 Abs. 4 i.V.m. Abs. 5a zulässig). Erstes Jahr monatsgenau.
 */
function computeDegressive(
  baseCents: number,
  startYear: number,
  ratePercent: number,
  life: number,
  factor: number,
): DepreciationEntry[] {
  const entries: DepreciationEntry[] = [];
  let residual = baseCents;
  let i = 0;
  const maxIterations = life + 2; // Sicherheitsgrenze inkl. monatsgenauem Teiljahr

  while (residual > 0 && i <= maxIterations) {
    const remainingYears = Math.max(1, life - i);
    const degressive = (residual * ratePercent) / 100;
    const linear = residual / remainingYears;
    let amt = Math.round(Math.max(degressive, linear));

    if (i === 0) amt = Math.round(amt * factor);
    if (remainingYears === 1 || amt >= residual || amt <= 0) amt = residual;

    entries.push({ year: startYear + i, amountCents: amt });
    residual -= amt;
    i += 1;
  }
  return entries;
}

/** AfA-Betrag eines bestimmten Jahres aus einem Plan (0, wenn nicht enthalten). */
export function depreciationForYear(
  entries: DepreciationEntry[],
  year: number,
): number {
  return entries.find((e) => e.year === year)?.amountCents ?? 0;
}
