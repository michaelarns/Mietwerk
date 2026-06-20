import { describe, expect, it } from "vitest";

import {
  checkDegressiveEligibility,
  computeDepreciationSchedule,
  deriveLinearRate,
  depreciationForYear,
} from "./afa-rules";

const sum = (entries: { amountCents: number }[]) =>
  entries.reduce((a, e) => a + e.amountCents, 0);

describe("deriveLinearRate (§ 7 Abs. 4 EStG)", () => {
  it("vor 1925 → 2,5 % / 40 Jahre", () => {
    const r = deriveLinearRate({ completionYear: 1910, residential: true });
    expect(r.ratePercent).toBe(2.5);
    expect(r.usefulLifeYears).toBe(40);
  });

  it("1925–2022 → 2 % / 50 Jahre", () => {
    expect(deriveLinearRate({ completionYear: 1998, residential: true }).ratePercent).toBe(2);
    expect(deriveLinearRate({ completionYear: 2022, residential: true }).ratePercent).toBe(2);
    expect(deriveLinearRate({ completionYear: 1925, residential: true }).ratePercent).toBe(2);
  });

  it("Wohngebäude ab 2023 → 3 % / 33 Jahre", () => {
    const r = deriveLinearRate({ completionYear: 2024, residential: true });
    expect(r.ratePercent).toBe(3);
    expect(r.usefulLifeYears).toBe(33);
  });

  it("Nicht-Wohngebäude ab 2023 erhält NICHT den 3 %-Satz", () => {
    expect(deriveLinearRate({ completionYear: 2024, residential: false }).ratePercent).toBe(2);
  });

  it("unbekannte Fertigstellung → konservativ 2 %", () => {
    expect(deriveLinearRate({ completionYear: null, residential: true }).ratePercent).toBe(2);
  });
});

describe("computeDepreciationSchedule — LINEAR", () => {
  it("2 % auf 520.000 € ergibt 50 volle Jahre, Summe = Basis", () => {
    const base = 52_000_000;
    const entries = computeDepreciationSchedule({
      method: "LINEAR",
      baseCents: base,
      startYear: 2020,
      ratePercent: 2,
    });
    expect(entries).toHaveLength(50);
    expect(entries[0]!.amountCents).toBe(1_040_000);
    expect(sum(entries)).toBe(base);
  });

  it("monatsgenau: Kauf im Juli (startMonth 7) halbiert das erste Jahr", () => {
    const base = 52_000_000;
    const entries = computeDepreciationSchedule({
      method: "LINEAR",
      baseCents: base,
      startYear: 2020,
      startMonth: 7,
      ratePercent: 2,
    });
    expect(entries[0]!.amountCents).toBe(520_000); // 1.040.000 * 6/12
    expect(entries[0]!.year).toBe(2020);
    expect(sum(entries)).toBe(base); // verlustfrei trotz Teiljahr
    // Teiljahr verlängert den Plan über die 50 Jahre hinaus.
    expect(entries.length).toBeGreaterThan(50);
  });

  it("3 % Neubau: Summe = Basis", () => {
    const base = 40_000_000;
    const entries = computeDepreciationSchedule({
      method: "LINEAR",
      baseCents: base,
      startYear: 2024,
      ratePercent: 3,
    });
    expect(sum(entries)).toBe(base);
  });
});

describe("computeDepreciationSchedule — RESTNUTZUNGSDAUER", () => {
  it("20 Jahre Restnutzungsdauer → 5 % p.a., Summe = Basis", () => {
    const base = 20_000_000;
    const entries = computeDepreciationSchedule({
      method: "RESTNUTZUNGSDAUER",
      baseCents: base,
      startYear: 2021,
      usefulLifeYears: 20,
    });
    expect(entries).toHaveLength(20);
    expect(entries[0]!.amountCents).toBe(1_000_000);
    expect(sum(entries)).toBe(base);
  });

  it("ohne usefulLifeYears wirft es einen Fehler", () => {
    expect(() =>
      computeDepreciationSchedule({
        method: "RESTNUTZUNGSDAUER",
        baseCents: 1000,
        startYear: 2021,
      }),
    ).toThrow();
  });
});

describe("computeDepreciationSchedule — DEGRESSIV (5 %, § 7 Abs. 5a)", () => {
  it("fällt im degressiven Teil, schreibt voll ab, Summe = Basis", () => {
    const base = 30_000_000;
    const entries = computeDepreciationSchedule({
      method: "DEGRESSIV",
      baseCents: base,
      startYear: 2024,
      ratePercent: 5,
      usefulLifeYears: 33,
    });
    // Erstes Jahr 5 % der Basis.
    expect(entries[0]!.amountCents).toBe(1_500_000);
    // Degressiver Teil ist streng fallend.
    expect(entries[0]!.amountCents).toBeGreaterThan(entries[1]!.amountCents);
    expect(entries[1]!.amountCents).toBeGreaterThan(entries[2]!.amountCents);
    // Vollständige Abschreibung ohne Cent-Verlust.
    expect(sum(entries)).toBe(base);
  });

  it("monatsgenau auch degressiv (startMonth halbiert das erste Jahr)", () => {
    const base = 30_000_000;
    const entries = computeDepreciationSchedule({
      method: "DEGRESSIV",
      baseCents: base,
      startYear: 2024,
      startMonth: 7,
      ratePercent: 5,
      usefulLifeYears: 33,
    });
    expect(entries[0]!.amountCents).toBe(750_000);
    expect(sum(entries)).toBe(base);
  });
});

describe("Bemessungsgrundlage & Rundung", () => {
  it("Basis 0 → leerer Plan", () => {
    expect(computeDepreciationSchedule({ method: "LINEAR", baseCents: 0, startYear: 2020, ratePercent: 2 })).toEqual([]);
  });

  it("Mini-Basis verliert keinen Cent", () => {
    const entries = computeDepreciationSchedule({ method: "LINEAR", baseCents: 50, startYear: 2020, ratePercent: 2 });
    expect(sum(entries)).toBe(50);
  });

  it("depreciationForYear liefert den Jahreswert bzw. 0", () => {
    const entries = computeDepreciationSchedule({ method: "LINEAR", baseCents: 52_000_000, startYear: 2020, ratePercent: 2 });
    expect(depreciationForYear(entries, 2020)).toBe(1_040_000);
    expect(depreciationForYear(entries, 1999)).toBe(0);
  });
});

describe("checkDegressiveEligibility (§ 7 Abs. 5a)", () => {
  it("Baubeginn im Förderzeitraum → geeignet", () => {
    const r = checkDegressiveEligibility({
      residential: true,
      constructionStart: new Date(Date.UTC(2024, 0, 15)),
    });
    expect(r.eligible).toBe(true);
  });

  it("Baubeginn vor dem 1.10.2023 → nicht geeignet", () => {
    const r = checkDegressiveEligibility({
      residential: true,
      constructionStart: new Date(Date.UTC(2023, 8, 15)),
    });
    expect(r.eligible).toBe(false);
  });

  it("nicht zu Wohnzwecken → nicht geeignet", () => {
    const r = checkDegressiveEligibility({
      residential: false,
      constructionStart: new Date(Date.UTC(2024, 0, 15)),
    });
    expect(r.eligible).toBe(false);
  });

  it("Anschaffung: Kaufvertrag im Förderzeitraum und im Fertigstellungsjahr → geeignet", () => {
    const r = checkDegressiveEligibility({
      residential: true,
      acquisitionContractDate: new Date(Date.UTC(2025, 5, 1)),
      completionDate: new Date(Date.UTC(2025, 8, 1)),
    });
    expect(r.eligible).toBe(true);
  });

  it("Anschaffung: Kaufvertrag nicht im Fertigstellungsjahr → nicht geeignet", () => {
    const r = checkDegressiveEligibility({
      residential: true,
      acquisitionContractDate: new Date(Date.UTC(2025, 5, 1)),
      completionDate: new Date(Date.UTC(2026, 0, 1)),
    });
    expect(r.eligible).toBe(false);
  });
});
