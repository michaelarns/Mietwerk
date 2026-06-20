import { describe, expect, it } from "vitest";

import { renderPdfToBuffer } from "~/server/pdf/render";

import { buildStatementPdfData, type LeaseStatementInput } from "./build-pdf-data";
import { StatementPdf } from "./statement-pdf";

const sample: LeaseStatementInput = {
  statement: {
    title: "Betriebskostenabrechnung 2025",
    periodYear: 2025,
    periodStart: new Date(Date.UTC(2025, 0, 1)),
    periodEnd: new Date(Date.UTC(2025, 11, 31)),
    status: "DRAFT",
    advanceBasis: "IST",
    property: { name: "Musterstraße 1", street: "Musterstraße", houseNo: "1", postalCode: "20095", city: "Hamburg" },
    lineItems: [
      {
        id: "i1",
        label: "Grundsteuer",
        allocationKey: "WOHNFLAECHE",
        consumptionSplit: false,
        totalCents: 13_000,
        shares: [
          { leaseId: "L1", shareCents: 7_200, basisLabel: "72 / 130 m²" },
          { leaseId: null, shareCents: 0, basisLabel: "Vermieter / Leerstand" },
        ],
      },
      {
        id: "i2",
        label: "Heizung/Brennstoffe",
        allocationKey: "VERBRAUCH",
        consumptionSplit: true,
        totalCents: 100_000,
        shares: [{ leaseId: "L1", shareCents: 57_692, basisLabel: "600 (Verbrauch)" }],
      },
    ],
  },
  result: {
    leaseId: "L1",
    unitLabel: "EG links",
    tenantNames: "Mieter Eins",
    allocatedCents: 64_892,
    advanceCents: 60_000,
    balanceCents: 4_892,
    daysActive: 365,
    periodDays: 365,
  },
};

describe("buildStatementPdfData", () => {
  it("baut Zeilen, Anteile und das Ergebnis je Mieter", () => {
    const data = buildStatementPdfData(sample, "Wohnbau Nord GbR");
    expect(data.rows).toHaveLength(2);
    expect(data.rows[0]!.shareCents).toBe(7_200);
    expect(data.rows[1]!.schluesselLabel).toContain("HeizkostenV");
    expect(data.allocatedCents).toBe(64_892);
    expect(data.advanceCents).toBe(60_000);
    expect(data.balanceCents).toBe(4_892);
  });

  it("nennt die Abrechnungsfrist (12. Monat nach Periodenende) und die Heizkosten-Regel", () => {
    const data = buildStatementPdfData(sample, "Wohnbau Nord GbR");
    expect(data.deadlineLabel).toContain("31.12.2026");
    expect(data.legalNotes.some((n) => n.includes("HeizkostenV"))).toBe(true);
    expect(data.legalNotes.some((n) => n.includes("VIII ZR 159/05"))).toBe(true);
  });
});

describe("StatementPdf rendering", () => {
  it("erzeugt ein gültiges PDF (Buffer mit %PDF-Header)", async () => {
    const data = buildStatementPdfData(sample, "Wohnbau Nord GbR");
    const buffer = await renderPdfToBuffer(<StatementPdf data={data} />);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30_000);
});
