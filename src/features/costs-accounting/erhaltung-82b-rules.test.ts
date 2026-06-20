import { describe, expect, it } from "vitest";

import {
  collapseOnEvent,
  distribute82b,
  distributionForYear,
} from "./erhaltung-82b-rules";

const sum = (entries: { amountCents: number }[]) =>
  entries.reduce((a, e) => a + e.amountCents, 0);

describe("distribute82b (§ 82b EStDV)", () => {
  it("teilt gleichmäßig auf 4 Jahre", () => {
    const e = distribute82b(10_000, 4, 2024);
    expect(e).toEqual([
      { year: 2024, amountCents: 2_500 },
      { year: 2025, amountCents: 2_500 },
      { year: 2026, amountCents: 2_500 },
      { year: 2027, amountCents: 2_500 },
    ]);
  });

  it("rundet verlustfrei (Summe = Gesamtbetrag)", () => {
    const e = distribute82b(10_001, 3, 2024);
    expect(sum(e)).toBe(10_001);
    // Largest-Remainder: ein Jahr bekommt 1 Cent mehr.
    const amounts = e.map((x) => x.amountCents).sort();
    expect(amounts).toEqual([3_333, 3_334, 3_334]);
  });

  it("verweigert Verteilung außerhalb 2–5 Jahre", () => {
    expect(() => distribute82b(10_000, 1, 2024)).toThrow();
    expect(() => distribute82b(10_000, 6, 2024)).toThrow();
  });
});

describe("collapseOnEvent (Veräußerung während der Verteilung)", () => {
  it("zieht den Rest im Ereignisjahr ab", () => {
    const e = distribute82b(10_000, 5, 2024); // 2000/Jahr
    const collapsed = collapseOnEvent(e, 2026);
    expect(collapsed).toEqual([
      { year: 2024, amountCents: 2_000 },
      { year: 2025, amountCents: 2_000 },
      { year: 2026, amountCents: 6_000 }, // 2026+2027+2028
    ]);
    expect(sum(collapsed)).toBe(10_000);
  });
});

describe("distributionForYear", () => {
  it("liefert den Jahreswert bzw. 0", () => {
    const e = distribute82b(10_000, 4, 2024);
    expect(distributionForYear(e, 2025)).toBe(2_500);
    expect(distributionForYear(e, 2030)).toBe(0);
  });
});
