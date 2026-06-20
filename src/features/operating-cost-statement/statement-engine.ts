/**
 * Umlage-Engine der Betriebskostenabrechnung — das fachliche Herzstück.
 *
 * REIN: keine Prisma-, keine IO-Abhängigkeit, vollständig testbar. Geld immer
 * als Integer-Cent; verlustfreie Verteilung über `distributeCents`. Datums-
 * arithmetik tagesgenau auf UTC-Kalendertagen, konsistent zur Sollstellungs-
 * Proration aus Phase 2 (`rent-payments/charge-rules.ts`).
 *
 * RECHTLICHER RAHMEN (recherchiert, ⚠️ = freizugeben — siehe ADR 0010):
 *  - § 556a Abs. 1 BGB: Default-Maßstab Wohnfläche; erfasster Verbrauch wird
 *    nach Verbrauch umgelegt.
 *  - §§ 7, 8 HeizkostenV: Heizung/Warmwasser 50–70 % nach Verbrauch (Rest nach
 *    Fläche) — siehe `heizkosten-rules.ts`.
 *  - Leerstand trägt der Vermieter (BGH VIII ZR 159/05): der Divisor (z.B.
 *    Gesamtfläche) bleibt vollständig; der auf leerstehende/ nicht vermietete
 *    Tage entfallende Anteil wird NICHT auf Mieter umverteilt, sondern dem
 *    Vermieter zugewiesen (`leaseId === null`).
 *
 * Invariante (in Tests abgesichert): je Position gilt
 *   Σ Mieteranteile + Vermieteranteil === totalCents  (kein Cent verloren).
 */
import { type AllocationKey } from "../../../generated/prisma";
import { distributeCents, sumCents } from "~/lib/money";

import {
  DEFAULT_CONSUMPTION_SHARE_BP,
  clampConsumptionShareBp,
  splitHeating,
} from "./heizkosten-rules";

// ── UTC-Tagesarithmetik (spiegelt rent-payments/charge-rules.ts) ─────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Inklusive Kalendertage zwischen zwei UTC-Tagen (0, wenn end < start). */
function inclusiveDays(startMs: number, endMs: number): number {
  if (endMs < startMs) return 0;
  return Math.floor((endMs - startMs) / DAY_MS) + 1;
}

// ── Eingabe-Typen (rein; vom Service aus Prisma-Daten gebaut) ────────────────

export interface EnginePeriod {
  /** Erster Tag des Abrechnungszeitraums (UTC, inklusive). */
  start: Date;
  /** Letzter Tag des Abrechnungszeitraums (UTC, inklusive). */
  end: Date;
}

export interface EngineUnit {
  id: string;
  /** Wohnfläche in m² (0, wenn unbekannt). */
  areaSqm: number;
}

export interface EngineOccupancy {
  validFrom: Date;
  /** Exklusives Ende; `null` = offen. */
  validTo: Date | null;
  personCount: number;
}

export interface EngineLease {
  id: string;
  unitId: string;
  startDate: Date;
  endDate: Date | null;
  /** Effektiv-datierte Personenzahlen (für den Personen-Schlüssel). */
  occupancies: EngineOccupancy[];
}

export interface EngineItem {
  id: string;
  label: string;
  totalCents: number;
  allocationKey: AllocationKey;
  /** Heizung/Warmwasser: in Grund- und Verbrauchskosten splitten. */
  consumptionSplit: boolean;
  /** Verbrauchsanteil in Basispunkten; `null` = Statement-Default. */
  consumptionShareBp: number | null;
  /** Erfasster Verbrauch je Einheit (für VERBRAUCH bzw. den Split). */
  consumptionByUnitId: Record<string, number>;
}

export interface EngineInput {
  period: EnginePeriod;
  units: EngineUnit[];
  leases: EngineLease[];
  items: EngineItem[];
  /** Default-Verbrauchsanteil (bp) des Statements für Heizkosten-Splits. */
  heatingConsumptionShareBp?: number;
}

// ── Ausgabe-Typen ────────────────────────────────────────────────────────────

export interface ItemShare {
  itemId: string;
  /** `null` = Vermieteranteil (Leerstand / nicht umlegbar). */
  leaseId: string | null;
  shareCents: number;
  /** Nachvollziehbare Bezugsgröße, z.B. "72 / 180 m²". */
  basisLabel: string;
}

export interface LeaseAllocation {
  leaseId: string;
  unitId: string;
  allocatedCents: number;
  daysActive: number;
  periodDays: number;
}

export interface EngineResult {
  itemShares: ItemShare[];
  perLease: LeaseAllocation[];
  /** Gesamter Vermieter-/Leerstandsanteil über alle Positionen. */
  landlordCents: number;
  /** Summe aller Positions-Gesamtkosten. */
  totalCents: number;
  periodDays: number;
}

// ── Segmentierung: (Einheit × Mietverhältnis) bzw. Leerstand je Einheit ──────

interface Segment {
  unitId: string;
  leaseId: string | null; // null = Leerstand (Vermieter)
  areaSqm: number;
  activeDays: number;
  personDays: number;
}

function personDaysInSpan(
  spanStart: number,
  spanEnd: number,
  occupancies: EngineOccupancy[],
): number {
  let total = 0;
  for (const occ of occupancies) {
    const occStart = toUtcDay(occ.validFrom);
    // validTo ist exklusiv → letzter abgedeckter Tag = validTo - 1 Tag.
    const occEnd = occ.validTo ? toUtcDay(occ.validTo) - DAY_MS : spanEnd;
    const oStart = Math.max(occStart, spanStart);
    const oEnd = Math.min(occEnd, spanEnd);
    if (oEnd >= oStart) total += inclusiveDays(oStart, oEnd) * occ.personCount;
  }
  return total;
}

/**
 * Baut je Einheit die aktiven Mietverhältnis-Segmente (tagesgenau auf den
 * Zeitraum geklippt) plus — sofern Tage übrig bleiben — ein Leerstand-Segment.
 */
function buildSegments(
  period: EnginePeriod,
  units: EngineUnit[],
  leases: EngineLease[],
): { segments: Segment[]; periodDays: number } {
  const periodStart = toUtcDay(period.start);
  const periodEnd = toUtcDay(period.end);
  const periodDays = inclusiveDays(periodStart, periodEnd);

  const segments: Segment[] = [];

  for (const unit of units) {
    let occupiedDays = 0;
    for (const lease of leases) {
      if (lease.unitId !== unit.id) continue;
      const leaseStart = toUtcDay(lease.startDate);
      const leaseEnd = lease.endDate ? toUtcDay(lease.endDate) : periodEnd;
      const spanStart = Math.max(leaseStart, periodStart);
      const spanEnd = Math.min(leaseEnd, periodEnd);
      const activeDays = inclusiveDays(spanStart, spanEnd);
      if (activeDays <= 0) continue; // Mietverhältnis nicht im Zeitraum aktiv
      segments.push({
        unitId: unit.id,
        leaseId: lease.id,
        areaSqm: unit.areaSqm,
        activeDays,
        personDays: personDaysInSpan(spanStart, spanEnd, lease.occupancies),
      });
      occupiedDays += activeDays;
    }

    const vacantDays = periodDays - occupiedDays;
    if (vacantDays > 0) {
      segments.push({
        unitId: unit.id,
        leaseId: null,
        areaSqm: unit.areaSqm,
        activeDays: vacantDays,
        personDays: 0,
      });
    }
  }

  return { segments, periodDays };
}

// ── Gewichte je Umlageschlüssel ──────────────────────────────────────────────

function num(n: number): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

/**
 * Liefert je Segment das Verteilungsgewicht für einen "einfachen" Schlüssel
 * (alles außer Heizkosten-Split). Verbrauch wird je Einheit anteilig nach
 * aktiven Tagen auf deren Segmente verteilt.
 */
function weightFor(
  seg: Segment,
  key: AllocationKey,
  periodDays: number,
  consumptionByUnitId: Record<string, number>,
): number {
  switch (key) {
    case "WOHNFLAECHE":
    case "MITEIGENTUMSANTEIL": // kein MEA-Stammwert in v1 → Fläche (⚠️ Hinweis im Service)
      return seg.areaSqm * seg.activeDays;
    case "EINHEITEN":
      return seg.activeDays; // 1 pro Einheit, zeitanteilig
    case "PERSONEN":
      return seg.personDays;
    case "VERBRAUCH": {
      const unitConsumption = consumptionByUnitId[seg.unitId] ?? 0;
      return periodDays > 0
        ? (unitConsumption * seg.activeDays) / periodDays
        : 0;
    }
  }
}

function basisLabelFor(
  seg: Segment,
  key: AllocationKey,
  periodDays: number,
  denominator: number,
  consumptionByUnitId: Record<string, number>,
): string {
  const dayNote =
    seg.activeDays < periodDays ? ` · ${seg.activeDays}/${periodDays} Tage` : "";
  switch (key) {
    case "WOHNFLAECHE":
    case "MITEIGENTUMSANTEIL":
      return `${num(seg.areaSqm)} / ${num(denominator)} m²${dayNote}`;
    case "EINHEITEN":
      return `1 / ${num(denominator)} Einheiten${dayNote}`;
    case "PERSONEN":
      return `${num(seg.personDays)} / ${num(denominator)} Personen-Tage`;
    case "VERBRAUCH": {
      const c = consumptionByUnitId[seg.unitId] ?? 0;
      return `${num(c)} / ${num(denominator)} (Verbrauch)${dayNote}`;
    }
  }
}

// ── Verteilung einer (Teil-)Summe auf Segmente ───────────────────────────────

interface SegShare {
  seg: Segment | null; // null = Vermieter-Sammelposten (nicht umlegbar)
  shareCents: number;
}

/**
 * Verteilt `amount` verlustfrei auf die Segmente gemäß `weights`. Ist die
 * Gewichtssumme 0 (keine Bezugsgröße, z.B. fehlende Verbrauchsdaten), trägt der
 * Vermieter den Betrag vollständig.
 */
function distributeAmount(
  amount: number,
  segs: Segment[],
  weights: number[],
): SegShare[] {
  if (amount === 0) return segs.map((seg) => ({ seg, shareCents: 0 }));
  const weightSum = weights.reduce((a, w) => a + w, 0);
  if (weightSum <= 0) return [{ seg: null, shareCents: amount }];
  const shares = distributeCents(amount, weights);
  return segs.map((seg, i) => ({ seg, shareCents: shares[i] ?? 0 }));
}

// ── Eine Position umlegen ────────────────────────────────────────────────────

function allocateItem(
  item: EngineItem,
  segments: Segment[],
  periodDays: number,
  statementShareBp: number,
): ItemShare[] {
  // Vermieter-Sammelposten (Leerstand + nicht umlegbar) je Position.
  let landlordCents = 0;
  const byLease = new Map<string, { shareCents: number; basisLabel: string }>();

  const addShare = (seg: Segment | null, cents: number, label: string) => {
    if (cents === 0 && seg && seg.leaseId === null) return;
    if (!seg || seg.leaseId === null) {
      landlordCents += cents;
      return;
    }
    const prev = byLease.get(seg.leaseId);
    if (prev) prev.shareCents += cents;
    else byLease.set(seg.leaseId, { shareCents: cents, basisLabel: label });
  };

  if (item.consumptionSplit) {
    // Heizung/Warmwasser: Grundkosten nach Fläche, Verbrauchskosten nach
    // erfasstem Verbrauch (§§ 7, 8 HeizkostenV).
    const shareBp = clampConsumptionShareBp(
      item.consumptionShareBp ?? statementShareBp,
    );
    const { verbrauchCents, grundCents } = splitHeating(
      item.totalCents,
      shareBp,
    );

    const areaWeights = segments.map((s) => weightFor(s, "WOHNFLAECHE", periodDays, {}));
    const areaDenom = segments.reduce((a, s) => a + s.areaSqm, 0);
    for (const r of distributeAmount(grundCents, segments, areaWeights)) {
      if (r.seg)
        addShare(
          r.seg,
          r.shareCents,
          `${basisLabelFor(r.seg, "WOHNFLAECHE", periodDays, areaDenom, {})} (Grundkosten)`,
        );
      else addShare(null, r.shareCents, "");
    }

    const consWeights = segments.map((s) =>
      weightFor(s, "VERBRAUCH", periodDays, item.consumptionByUnitId),
    );
    const consDenom = Object.values(item.consumptionByUnitId).reduce(
      (a, c) => a + c,
      0,
    );
    for (const r of distributeAmount(verbrauchCents, segments, consWeights)) {
      if (r.seg)
        addShare(
          r.seg,
          r.shareCents,
          `${basisLabelFor(r.seg, "VERBRAUCH", periodDays, consDenom, item.consumptionByUnitId)} (Verbrauch)`,
        );
      else addShare(null, r.shareCents, "");
    }
  } else {
    const weights = segments.map((s) =>
      weightFor(s, item.allocationKey, periodDays, item.consumptionByUnitId),
    );
    const denom = weights.reduce((a, w, i) => {
      // Nenner in der Einheit des Schlüssels (Fläche/Einheiten/Personen/Verbrauch).
      const s = segments[i]!;
      switch (item.allocationKey) {
        case "WOHNFLAECHE":
        case "MITEIGENTUMSANTEIL":
          return a + s.areaSqm;
        case "EINHEITEN":
          return a + 1;
        case "PERSONEN":
          return a + s.personDays;
        case "VERBRAUCH":
          return a + (item.consumptionByUnitId[s.unitId] ?? 0);
      }
    }, 0);
    for (const r of distributeAmount(item.totalCents, segments, weights)) {
      if (r.seg)
        addShare(
          r.seg,
          r.shareCents,
          basisLabelFor(r.seg, item.allocationKey, periodDays, denom, item.consumptionByUnitId),
        );
      else addShare(null, r.shareCents, "");
    }
  }

  const shares: ItemShare[] = [];
  for (const [leaseId, v] of byLease) {
    shares.push({ itemId: item.id, leaseId, shareCents: v.shareCents, basisLabel: v.basisLabel });
  }
  if (landlordCents !== 0) {
    shares.push({
      itemId: item.id,
      leaseId: null,
      shareCents: landlordCents,
      basisLabel: "Vermieter / Leerstand",
    });
  }
  return shares;
}

// ── Öffentliche Engine ───────────────────────────────────────────────────────

/**
 * Legt alle Positionen einer Abrechnung um und aggregiert je Mietverhältnis.
 * Garantiert: Σ(Mieteranteile + Vermieteranteil) === Σ totalCents.
 */
export function runEngine(input: EngineInput): EngineResult {
  const { segments, periodDays } = buildSegments(
    input.period,
    input.units,
    input.leases,
  );
  const statementShareBp =
    input.heatingConsumptionShareBp ?? DEFAULT_CONSUMPTION_SHARE_BP;

  const itemShares: ItemShare[] = [];
  for (const item of input.items) {
    itemShares.push(
      ...allocateItem(item, segments, periodDays, statementShareBp),
    );
  }

  // Aktive Tage je Mietverhältnis (für die Ergebniszeile).
  const daysActiveByLease = new Map<string, { unitId: string; days: number }>();
  for (const seg of segments) {
    if (seg.leaseId === null) continue;
    const prev = daysActiveByLease.get(seg.leaseId);
    if (prev) prev.days += seg.activeDays;
    else daysActiveByLease.set(seg.leaseId, { unitId: seg.unitId, days: seg.activeDays });
  }

  const allocatedByLease = new Map<string, number>();
  let landlordCents = 0;
  for (const s of itemShares) {
    if (s.leaseId === null) landlordCents += s.shareCents;
    else allocatedByLease.set(s.leaseId, (allocatedByLease.get(s.leaseId) ?? 0) + s.shareCents);
  }

  const perLease: LeaseAllocation[] = [];
  for (const [leaseId, info] of daysActiveByLease) {
    perLease.push({
      leaseId,
      unitId: info.unitId,
      allocatedCents: allocatedByLease.get(leaseId) ?? 0,
      daysActive: info.days,
      periodDays,
    });
  }

  return {
    itemShares,
    perLease,
    landlordCents,
    totalCents: sumCents(input.items.map((i) => i.totalCents)),
    periodDays,
  };
}
