import { describe, expect, it } from "vitest";

import { parseBankCsv, parseBankDate, parseGermanAmount } from "./csv-parser";

describe("parseGermanAmount", () => {
  it("parses German notation with thousands separators and sign", () => {
    expect(parseGermanAmount("1.234,56")).toBe(123_456);
    expect(parseGermanAmount("980,00")).toBe(98_000);
    expect(parseGermanAmount("-45,90")).toBe(-4_590);
    expect(parseGermanAmount("1234.56")).toBe(123_456);
    expect(parseGermanAmount("980,00 EUR")).toBe(98_000);
    expect(parseGermanAmount("abc")).toBeNull();
    expect(parseGermanAmount("")).toBeNull();
  });
});

describe("parseBankDate", () => {
  it("parses dd.mm.yyyy, dd.mm.yy and ISO", () => {
    expect(parseBankDate("03.06.2025")?.toISOString()).toBe("2025-06-03T00:00:00.000Z");
    expect(parseBankDate("3.6.25")?.toISOString()).toBe("2025-06-03T00:00:00.000Z");
    expect(parseBankDate("2025-06-03")?.toISOString()).toBe("2025-06-03T00:00:00.000Z");
    expect(parseBankDate("not a date")).toBeNull();
  });
});

describe("parseBankCsv", () => {
  it("parses a semicolon German export and maps columns by header", () => {
    const csv = [
      "Buchungstag;Wertstellung;Verwendungszweck;Beguenstigter/Zahlungspflichtiger;Betrag",
      "03.06.2025;03.06.2025;Miete Juni Wohnung 1;Mieter Eins;980,00",
      '04.06.2025;04.06.2025;"Miete; Juli";Mieter Zwei;-12,50',
    ].join("\n");
    const res = parseBankCsv(csv);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]).toMatchObject({
      amountCents: 98_000,
      counterparty: "Mieter Eins",
      reference: "Miete Juni Wohnung 1",
    });
    // quoted field containing the delimiter is kept intact
    expect(res.rows[1]!.reference).toBe("Miete; Juli");
    expect(res.rows[1]!.amountCents).toBe(-1_250);
  });

  it("parses a comma-delimited export and skips unparseable rows", () => {
    const csv = [
      "Date,Name,Purpose,Amount",
      "2025-06-03,Mieter Eins,Miete,980.00",
      "broken row without enough,fields",
    ].join("\n");
    const res = parseBankCsv(csv);
    expect(res.rows).toHaveLength(1);
    expect(res.skippedLines).toEqual([3]);
  });

  it("returns nothing for an empty or header-only file", () => {
    expect(parseBankCsv("").rows).toHaveLength(0);
    expect(parseBankCsv("Buchungstag;Betrag").rows).toHaveLength(0);
  });
});
