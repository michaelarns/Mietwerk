import { describe, expect, it } from "vitest";

import {
  nkPortionOf,
  proratedAdvanceSollCents,
  reconcile,
} from "./advance-reconciliation";

const periodStart = new Date(Date.UTC(2025, 0, 1));
const periodEnd = new Date(Date.UTC(2025, 11, 31));

describe("proratedAdvanceSollCents", () => {
  it("summiert die volle Jahres-Vorauszahlung bei ganzjährigem Mietverhältnis", () => {
    expect(
      proratedAdvanceSollCents({
        monthlyAdvanceCents: 18_000,
        leaseStart: periodStart,
        leaseEnd: null,
        periodStart,
        periodEnd,
      }),
    ).toBe(12 * 18_000);
  });

  it("zählt nur volle Monate ab Mietbeginn", () => {
    expect(
      proratedAdvanceSollCents({
        monthlyAdvanceCents: 18_000,
        leaseStart: new Date(Date.UTC(2025, 6, 1)), // ab Juli
        leaseEnd: null,
        periodStart,
        periodEnd,
      }),
    ).toBe(6 * 18_000);
  });

  it("proratet einen Teilmonat tagesgenau", () => {
    // Start 16.07. → Juli 16/31 Tage + Aug–Dez voll.
    const july = Math.round((18_000 * 16) / 31);
    expect(
      proratedAdvanceSollCents({
        monthlyAdvanceCents: 18_000,
        leaseStart: new Date(Date.UTC(2025, 6, 16)),
        leaseEnd: null,
        periodStart,
        periodEnd,
      }),
    ).toBe(july + 5 * 18_000);
  });
});

describe("nkPortionOf", () => {
  it("rechnet den NK-Anteil aus Kalt+NK heraus", () => {
    expect(nkPortionOf(96_000, 78_000, 18_000)).toBe(18_000); // volle Sollmiete
    expect(nkPortionOf(48_000, 78_000, 18_000)).toBe(9_000); // halbe Zahlung → halber NK-Anteil
  });

  it("liefert 0 ohne Bezugsgröße", () => {
    expect(nkPortionOf(10_000, 0, 0)).toBe(0);
  });
});

describe("reconcile", () => {
  it("ergibt eine Nachzahlung, wenn die Kosten die Vorauszahlung übersteigen", () => {
    const r = reconcile({ allocatedCents: 20_000, advanceSollCents: 18_000, advanceIstCents: 15_000, basis: "IST" });
    expect(r.advanceCents).toBe(15_000);
    expect(r.balanceCents).toBe(5_000);
    expect(r.isNachzahlung).toBe(true);
    expect(r.isGuthaben).toBe(false);
  });

  it("ergibt ein Guthaben bei Überzahlung", () => {
    const r = reconcile({ allocatedCents: 10_000, advanceSollCents: 18_000, advanceIstCents: 15_000, basis: "IST" });
    expect(r.balanceCents).toBe(-5_000);
    expect(r.isGuthaben).toBe(true);
  });

  it("nutzt die SOLL-Basis, wenn gewählt", () => {
    const r = reconcile({ allocatedCents: 20_000, advanceSollCents: 18_000, advanceIstCents: 15_000, basis: "SOLL" });
    expect(r.advanceCents).toBe(18_000);
    expect(r.balanceCents).toBe(2_000);
  });
});
