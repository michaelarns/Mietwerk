import { describe, expect, it } from "vitest";

import {
  type EngineInput,
  type EngineItem,
  type EngineLease,
  type EngineUnit,
  runEngine,
} from "./statement-engine";

// ── Test-Helfer ──────────────────────────────────────────────────────────────

const YEAR = 2025;
const PERIOD = {
  start: new Date(Date.UTC(YEAR, 0, 1)),
  end: new Date(Date.UTC(YEAR, 11, 31)),
};
const PERIOD_DAYS = 365;

function unit(id: string, areaSqm: number): EngineUnit {
  return { id, areaSqm };
}

function lease(
  id: string,
  unitId: string,
  opts: Partial<EngineLease> = {},
): EngineLease {
  return {
    id,
    unitId,
    startDate: opts.startDate ?? PERIOD.start,
    endDate: opts.endDate ?? null,
    occupancies: opts.occupancies ?? [],
  };
}

function item(over: Partial<EngineItem> & Pick<EngineItem, "id" | "totalCents" | "allocationKey">): EngineItem {
  return {
    label: over.label ?? over.id,
    consumptionSplit: over.consumptionSplit ?? false,
    consumptionShareBp: over.consumptionShareBp ?? null,
    consumptionByUnitId: over.consumptionByUnitId ?? {},
    ...over,
  };
}

function tenantShare(result: ReturnType<typeof runEngine>, leaseId: string): number {
  return result.perLease.find((p) => p.leaseId === leaseId)?.allocatedCents ?? 0;
}

/** Invariante: Σ(Mieteranteile) + Vermieteranteil === Σ Gesamtkosten. */
function expectLossless(result: ReturnType<typeof runEngine>) {
  const tenants = result.perLease.reduce((a, p) => a + p.allocatedCents, 0);
  expect(tenants + result.landlordCents).toBe(result.totalCents);

  // ...und je Position einzeln.
  const byItem = new Map<string, number>();
  for (const s of result.itemShares) {
    byItem.set(s.itemId, (byItem.get(s.itemId) ?? 0) + s.shareCents);
  }
  return byItem;
}

// ── Wohnfläche (§ 556a Abs. 1 BGB Default) ───────────────────────────────────

describe("Umlage nach Wohnfläche", () => {
  it("verteilt proportional zur Fläche; Divisor = Gesamtfläche", () => {
    const input: EngineInput = {
      period: PERIOD,
      units: [unit("A", 72), unit("B", 58)],
      leases: [lease("L1", "A"), lease("L2", "B")],
      items: [item({ id: "grundsteuer", totalCents: 13_000, allocationKey: "WOHNFLAECHE" })],
    };
    const r = runEngine(input);
    expect(tenantShare(r, "L1")).toBe(7_200); // 13000 * 72/130
    expect(tenantShare(r, "L2")).toBe(5_800); // 13000 * 58/130
    expect(r.landlordCents).toBe(0);
    expectLossless(r);
  });

  it("verliert auch bei krummen Beträgen keinen Cent (Rundung)", () => {
    const input: EngineInput = {
      period: PERIOD,
      units: [unit("A", 72), unit("B", 58), unit("C", 49)],
      leases: [lease("L1", "A"), lease("L2", "B"), lease("L3", "C")],
      items: [item({ id: "x", totalCents: 10_001, allocationKey: "WOHNFLAECHE" })],
    };
    const r = runEngine(input);
    const byItem = expectLossless(r);
    expect(byItem.get("x")).toBe(10_001);
  });
});

// ── Leerstand trägt der Vermieter (BGH VIII ZR 159/05) ───────────────────────

describe("Leerstand", () => {
  it("legt den Anteil leerstehender Einheiten dem Vermieter zu, nicht den Mietern", () => {
    const input: EngineInput = {
      period: PERIOD,
      units: [unit("A", 72), unit("B", 58)], // B steht leer (kein Lease)
      leases: [lease("L1", "A")],
      items: [item({ id: "grundsteuer", totalCents: 13_000, allocationKey: "WOHNFLAECHE" })],
    };
    const r = runEngine(input);
    // Divisor bleibt 130 m² (inkl. Leerstand) → Mieter zahlt NICHT 13000.
    expect(tenantShare(r, "L1")).toBe(7_200); // 13000 * 72/130
    expect(r.landlordCents).toBe(5_800); // 13000 * 58/130 → Vermieter
    expectLossless(r);
  });
});

// ── Unterjährige Mietverhältnisse (tagesgenau) ───────────────────────────────

describe("Unterjährige Mietverhältnisse", () => {
  it("rechnet zeitanteilig nach aktiven Tagen; Vermieter trägt die Leerstandstage", () => {
    const input: EngineInput = {
      period: PERIOD,
      units: [unit("A", 72), unit("B", 58)],
      leases: [
        lease("L1", "A"), // ganzes Jahr
        lease("L2", "B", { startDate: new Date(Date.UTC(YEAR, 6, 1)) }), // ab 01.07. (184 Tage)
      ],
      items: [item({ id: "x", totalCents: 130_000, allocationKey: "WOHNFLAECHE" })],
    };
    const r = runEngine(input);
    // Divisor = 72*365 + 58*365 = 130*365. L1 = 130000 * (72*365)/(130*365)=72000.
    expect(tenantShare(r, "L1")).toBe(72_000);
    // L2 nur 184/365 seiner Fläche, Rest (181 Tage) Leerstand → Vermieter.
    const l2Exact = (130_000 * (58 * 184)) / (130 * 365);
    expect(Math.abs(tenantShare(r, "L2") - Math.round(l2Exact))).toBeLessThanOrEqual(1);
    expect(r.landlordCents).toBeGreaterThan(0);
    expectLossless(r);
  });
});

// ── Einheiten ────────────────────────────────────────────────────────────────

describe("Umlage nach Einheiten", () => {
  it("verteilt gleichmäßig je Einheit", () => {
    const input: EngineInput = {
      period: PERIOD,
      units: [unit("A", 72), unit("B", 58)],
      leases: [lease("L1", "A"), lease("L2", "B")],
      items: [item({ id: "muell", totalCents: 9_000, allocationKey: "EINHEITEN" })],
    };
    const r = runEngine(input);
    expect(tenantShare(r, "L1")).toBe(4_500);
    expect(tenantShare(r, "L2")).toBe(4_500);
    expectLossless(r);
  });

  it("Leerstand zählt als Einheit zu Lasten des Vermieters", () => {
    const input: EngineInput = {
      period: PERIOD,
      units: [unit("A", 72), unit("B", 58), unit("C", 49)], // C leer
      leases: [lease("L1", "A"), lease("L2", "B")],
      items: [item({ id: "muell", totalCents: 9_000, allocationKey: "EINHEITEN" })],
    };
    const r = runEngine(input);
    expect(tenantShare(r, "L1")).toBe(3_000);
    expect(tenantShare(r, "L2")).toBe(3_000);
    expect(r.landlordCents).toBe(3_000);
    expectLossless(r);
  });
});

// ── Personen (zeitraum-genaue Belegung) ──────────────────────────────────────

describe("Umlage nach Personen", () => {
  it("verteilt nach Personen-Tagen", () => {
    const fullYear = { validFrom: PERIOD.start, validTo: null };
    const input: EngineInput = {
      period: PERIOD,
      units: [unit("A", 72), unit("B", 58)],
      leases: [
        lease("L1", "A", { occupancies: [{ ...fullYear, personCount: 3 }] }),
        lease("L2", "B", { occupancies: [{ ...fullYear, personCount: 1 }] }),
      ],
      items: [item({ id: "p", totalCents: 8_000, allocationKey: "PERSONEN" })],
    };
    const r = runEngine(input);
    expect(tenantShare(r, "L1")).toBe(6_000); // 3/4
    expect(tenantShare(r, "L2")).toBe(2_000); // 1/4
    expectLossless(r);
  });

  it("berücksichtigt eine unterjährige Änderung der Personenzahl", () => {
    const input: EngineInput = {
      period: PERIOD,
      units: [unit("A", 72), unit("B", 58)],
      leases: [
        lease("L1", "A", {
          occupancies: [
            { validFrom: new Date(Date.UTC(YEAR, 0, 1)), validTo: new Date(Date.UTC(YEAR, 6, 1)), personCount: 2 },
            { validFrom: new Date(Date.UTC(YEAR, 6, 1)), validTo: null, personCount: 4 },
          ],
        }),
        lease("L2", "B", { occupancies: [{ validFrom: PERIOD.start, validTo: null, personCount: 2 }] }),
      ],
      items: [item({ id: "p", totalCents: 10_000, allocationKey: "PERSONEN" })],
    };
    const r = runEngine(input);
    // L1 Personen-Tage = 2*181 + 4*184 = 362 + 736 = 1098; L2 = 2*365 = 730. Σ=1828
    const l1 = Math.round((10_000 * 1098) / 1828);
    expect(Math.abs(tenantShare(r, "L1") - l1)).toBeLessThanOrEqual(1);
    expectLossless(r);
  });
});

// ── Verbrauch ────────────────────────────────────────────────────────────────

describe("Umlage nach Verbrauch", () => {
  it("verteilt nach erfasstem Verbrauch je Einheit", () => {
    const input: EngineInput = {
      period: PERIOD,
      units: [unit("A", 72), unit("B", 58)],
      leases: [lease("L1", "A"), lease("L2", "B")],
      items: [
        item({
          id: "wasser",
          totalCents: 10_000,
          allocationKey: "VERBRAUCH",
          consumptionByUnitId: { A: 600, B: 400 },
        }),
      ],
    };
    const r = runEngine(input);
    expect(tenantShare(r, "L1")).toBe(6_000);
    expect(tenantShare(r, "L2")).toBe(4_000);
    expectLossless(r);
  });

  it("trägt der Vermieter, wenn keine Verbrauchsdaten vorliegen (Fallback)", () => {
    const input: EngineInput = {
      period: PERIOD,
      units: [unit("A", 72), unit("B", 58)],
      leases: [lease("L1", "A"), lease("L2", "B")],
      items: [item({ id: "wasser", totalCents: 10_000, allocationKey: "VERBRAUCH" })],
    };
    const r = runEngine(input);
    expect(tenantShare(r, "L1")).toBe(0);
    expect(r.landlordCents).toBe(10_000);
    expectLossless(r);
  });
});

// ── Heizkosten-Split (§§ 7, 8 HeizkostenV) ───────────────────────────────────

describe("Heizkosten-Split", () => {
  it("splittet in Grundkosten (Fläche) und Verbrauchskosten (Verbrauch)", () => {
    const input: EngineInput = {
      period: PERIOD,
      units: [unit("A", 72), unit("B", 58)],
      leases: [lease("L1", "A"), lease("L2", "B")],
      items: [
        item({
          id: "heizung",
          totalCents: 100_000,
          allocationKey: "VERBRAUCH",
          consumptionSplit: true,
          consumptionShareBp: 5000, // 50 % Verbrauch / 50 % Grund
          consumptionByUnitId: { A: 600, B: 400 },
        }),
      ],
    };
    const r = runEngine(input);
    // Grund 50000 nach Fläche: L1=50000*72/130≈27692, L2≈22308.
    // Verbrauch 50000 nach Verbrauch: L1=30000, L2=20000.
    expect(tenantShare(r, "L1")).toBe(27_692 + 30_000);
    expect(tenantShare(r, "L2")).toBe(22_308 + 20_000);
    const byItem = expectLossless(r);
    expect(byItem.get("heizung")).toBe(100_000);
  });

  it("erhöht den Verbrauchsanteil bei 70 % Verbrauch", () => {
    const base: EngineInput = {
      period: PERIOD,
      units: [unit("A", 72), unit("B", 58)],
      leases: [lease("L1", "A"), lease("L2", "B")],
      items: [
        item({
          id: "heizung",
          totalCents: 100_000,
          allocationKey: "VERBRAUCH",
          consumptionSplit: true,
          consumptionShareBp: 7000,
          consumptionByUnitId: { A: 800, B: 200 }, // L1 verbraucht viel mehr
        }),
      ],
    };
    const r = runEngine(base);
    // Verbrauch 70000: L1=56000, L2=14000. Grund 30000: L1≈16615,L2≈13385.
    expect(tenantShare(r, "L1")).toBe(56_000 + 16_615);
    expect(expectLossless(r).get("heizung")).toBe(100_000);
  });

  it("klemmt einen unzulässigen Verbrauchsanteil in den Korridor 50–70 %", () => {
    const r = runEngine({
      period: PERIOD,
      units: [unit("A", 50), unit("B", 50)],
      leases: [lease("L1", "A"), lease("L2", "B")],
      items: [
        item({
          id: "heizung",
          totalCents: 100_000,
          allocationKey: "VERBRAUCH",
          consumptionSplit: true,
          consumptionShareBp: 9000, // unzulässig → auf 7000 (70 %) geklemmt
          consumptionByUnitId: { A: 1000, B: 0 },
        }),
      ],
    });
    // Bei 70 % Verbrauch und nur L1 mit Verbrauch: L1 = 70000 + Grund(50%)=15000 = 85000.
    expect(tenantShare(r, "L1")).toBe(70_000 + 15_000);
    expect(tenantShare(r, "L2")).toBe(15_000);
  });
});

// ── Summenkonsistenz über gemischte Schlüssel ────────────────────────────────

describe("Gesamtkonsistenz", () => {
  it("hält die Invariante über viele Positionen mit gemischten Schlüsseln", () => {
    const input: EngineInput = {
      period: PERIOD,
      units: [unit("A", 72), unit("B", 58), unit("C", 49)],
      leases: [
        lease("L1", "A", { occupancies: [{ validFrom: PERIOD.start, validTo: null, personCount: 2 }] }),
        lease("L2", "B", { occupancies: [{ validFrom: PERIOD.start, validTo: null, personCount: 3 }] }),
        // C steht leer
      ],
      items: [
        item({ id: "grundsteuer", totalCents: 31_337, allocationKey: "WOHNFLAECHE" }),
        item({ id: "muell", totalCents: 8_111, allocationKey: "EINHEITEN" }),
        item({ id: "personen", totalCents: 5_555, allocationKey: "PERSONEN" }),
        item({
          id: "heizung",
          totalCents: 99_999,
          allocationKey: "VERBRAUCH",
          consumptionSplit: true,
          consumptionShareBp: 6000,
          consumptionByUnitId: { A: 510, B: 333, C: 0 },
        }),
      ],
    };
    const r = runEngine(input);
    const byItem = expectLossless(r);
    expect(byItem.get("grundsteuer")).toBe(31_337);
    expect(byItem.get("muell")).toBe(8_111);
    expect(byItem.get("personen")).toBe(5_555);
    expect(byItem.get("heizung")).toBe(99_999);
    expect(r.totalCents).toBe(31_337 + 8_111 + 5_555 + 99_999);
  });
});
