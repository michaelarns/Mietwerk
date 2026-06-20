import { describe, expect, it } from "vitest";

import {
  aggregateAnlageV,
  expenseContributionForYear,
  type ExpenseRecord,
} from "./anlage-v";

const d = (y: number, m: number, day = 15) => new Date(Date.UTC(y, m - 1, day));

const sofort = (
  group: ExpenseRecord["group"],
  amountCents: number,
  date: Date,
): ExpenseRecord => ({ cashDate: date, amountCents, group, expenseType: "SOFORTABZUG" });

describe("expenseContributionForYear", () => {
  it("Sofortabzug zählt im Kassenjahr", () => {
    const e = sofort("LAUFENDE_BETRIEBSKOSTEN", 50_000, d(2025, 3));
    expect(expenseContributionForYear(e, 2025)).toEqual({ group: "LAUFENDE_BETRIEBSKOSTEN", amountCents: 50_000 });
    expect(expenseContributionForYear(e, 2024)).toBeNull();
  });

  it("§82b-Verteilung liefert nur die Jahresscheibe", () => {
    const e: ExpenseRecord = {
      cashDate: d(2024, 6),
      amountCents: 10_000,
      group: "ERHALTUNGSAUFWAND",
      expenseType: "VERTEILUNG_82B",
      distributionYears: 5,
      distributionStartYear: 2024,
    };
    expect(expenseContributionForYear(e, 2024)).toEqual({ group: "ERHALTUNGSAUFWAND", amountCents: 2_000 });
    expect(expenseContributionForYear(e, 2025)).toEqual({ group: "ERHALTUNGSAUFWAND", amountCents: 2_000 });
    expect(expenseContributionForYear(e, 2030)).toBeNull();
  });

  it("aktivierte/anschaffungsnahe Aufwendungen sind keine direkten Werbungskosten", () => {
    const e: ExpenseRecord = {
      cashDate: d(2025, 1),
      amountCents: 4_000_000,
      group: "ERHALTUNGSAUFWAND",
      expenseType: "ANSCHAFFUNGSNAH",
    };
    expect(expenseContributionForYear(e, 2025)).toBeNull();
  });
});

describe("aggregateAnlageV (Kassenbasis, § 11 EStG)", () => {
  it("Einnahmen − Werbungskosten − AfA = Überschuss", () => {
    const r = aggregateAnlageV({
      year: 2025,
      income: [
        { cashDate: d(2025, 1), amountCents: 1_000_000 },
        { cashDate: d(2025, 2), amountCents: 1_000_000 },
        // Zahlung Januar 2026 zählt NICHT in 2025 (keine Auto-10-Tage-Regel).
        { cashDate: d(2026, 1, 3), amountCents: 1_000_000 },
      ],
      expenses: [
        sofort("LAUFENDE_BETRIEBSKOSTEN", 300_000, d(2025, 4)), // Grundsteuer/Versicherung
        sofort("SCHULDZINSEN", 500_000, d(2025, 6)),
      ],
      afaEntries: [{ year: 2025, amountCents: 1_040_000 }],
    });

    expect(r.einnahmenCents).toBe(2_000_000);
    expect(r.groups.LAUFENDE_BETRIEBSKOSTEN).toBe(300_000);
    expect(r.groups.SCHULDZINSEN).toBe(500_000);
    expect(r.groups.AFA).toBe(1_040_000);
    expect(r.afaCents).toBe(1_040_000);
    expect(r.werbungskostenCents).toBe(1_840_000);
    expect(r.ergebnisCents).toBe(160_000);
    expect(r.isUeberschuss).toBe(true);
  });

  it("Verlust wird mit korrektem Vorzeichen ausgewiesen", () => {
    const r = aggregateAnlageV({
      year: 2025,
      income: [{ cashDate: d(2025, 1), amountCents: 500_000 }],
      expenses: [sofort("SCHULDZINSEN", 600_000, d(2025, 6))],
      afaEntries: [{ year: 2025, amountCents: 400_000 }],
    });
    expect(r.ergebnisCents).toBe(-500_000);
    expect(r.isUeberschuss).toBe(false);
  });

  it("AfA nur des betreffenden Jahres fließt ein", () => {
    const r = aggregateAnlageV({
      year: 2025,
      income: [],
      expenses: [],
      afaEntries: [
        { year: 2024, amountCents: 999 },
        { year: 2025, amountCents: 1_040_000 },
      ],
    });
    expect(r.afaCents).toBe(1_040_000);
    expect(r.werbungskostenCents).toBe(1_040_000);
  });
});
