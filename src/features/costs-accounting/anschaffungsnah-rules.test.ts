import { describe, expect, it } from "vitest";

import {
  assessAnschaffungsnah,
  isWithinWindow,
  windowEndFor,
} from "./anschaffungsnah-rules";

const purchase = new Date(Date.UTC(2023, 5, 1)); // 2023-06-01

describe("Drei-Jahres-Fenster (§ 6 Abs. 1 Nr. 1a)", () => {
  it("Fensterende = Anschaffung + 3 Jahre", () => {
    expect(windowEndFor(purchase).toISOString()).toBe(new Date(Date.UTC(2026, 5, 1)).toISOString());
  });

  it("Datum innerhalb/außerhalb des Fensters", () => {
    expect(isWithinWindow(new Date(Date.UTC(2024, 0, 1)), purchase)).toBe(true);
    expect(isWithinWindow(new Date(Date.UTC(2023, 4, 1)), purchase)).toBe(false); // vor Anschaffung
    expect(isWithinWindow(new Date(Date.UTC(2026, 6, 1)), purchase)).toBe(false); // nach 3 Jahren
  });
});

describe("15 %-Schwelle (netto)", () => {
  // Gebäude-AK 200.000 € → Schwelle 30.000 €.
  const buildingAcquisitionCostCents = 20_000_000;
  const thresholdCents = 3_000_000;

  it("Schwelle = 15 % der Gebäude-Anschaffungskosten", () => {
    const r = assessAnschaffungsnah({ purchaseDate: purchase, buildingAcquisitionCostCents, candidates: [] });
    expect(r.thresholdCents).toBe(thresholdCents);
    expect(r.status).toBe("UNTER");
  });

  it("unter 80 % → UNTER", () => {
    const r = assessAnschaffungsnah({
      purchaseDate: purchase,
      buildingAcquisitionCostCents,
      candidates: [{ date: new Date(Date.UTC(2024, 0, 1)), netCents: 1_000_000 }],
    });
    expect(r.cumulativeNetCents).toBe(1_000_000);
    expect(r.status).toBe("UNTER");
  });

  it("ab 80 % der Schwelle → NAHE (Vorwarnung)", () => {
    const r = assessAnschaffungsnah({
      purchaseDate: purchase,
      buildingAcquisitionCostCents,
      candidates: [{ date: new Date(Date.UTC(2024, 0, 1)), netCents: 2_500_000 }],
    });
    expect(r.status).toBe("NAHE");
    expect(r.remainingCents).toBe(500_000);
  });

  it("über 15 % → UEBERSCHRITTEN (Herstellungskosten-Warnung)", () => {
    const r = assessAnschaffungsnah({
      purchaseDate: purchase,
      buildingAcquisitionCostCents,
      candidates: [
        { date: new Date(Date.UTC(2024, 0, 1)), netCents: 2_000_000 },
        { date: new Date(Date.UTC(2025, 2, 1)), netCents: 1_500_000 },
      ],
    });
    expect(r.cumulativeNetCents).toBe(3_500_000);
    expect(r.status).toBe("UEBERSCHRITTEN");
    expect(r.remainingCents).toBeLessThan(0);
  });

  it("Aufwand außerhalb des Fensters zählt nicht mit", () => {
    const r = assessAnschaffungsnah({
      purchaseDate: purchase,
      buildingAcquisitionCostCents,
      candidates: [
        { date: new Date(Date.UTC(2024, 0, 1)), netCents: 2_000_000 }, // im Fenster
        { date: new Date(Date.UTC(2027, 0, 1)), netCents: 5_000_000 }, // nach 3 Jahren
      ],
    });
    expect(r.cumulativeNetCents).toBe(2_000_000);
    expect(r.inWindowCount).toBe(1);
    expect(r.status).toBe("UNTER");
  });
});
