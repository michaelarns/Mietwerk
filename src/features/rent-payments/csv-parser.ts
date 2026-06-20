/**
 * Pure CSV bank-statement parsing — no Prisma, no IO, unit-testable.
 *
 * German bank exports vary, so we detect the delimiter (`;` or `,`) and map
 * columns by fuzzy header names. Amounts are parsed from German notation
 * ("1.234,56", optional sign / "EUR"). Only the parsing lives here; matching,
 * persistence and dedupe hashing live in the service.
 */

export interface ParsedBankRow {
  bookingDate: Date;
  valueDate: Date | null;
  amountCents: number; // positive = Gutschrift/Eingang, negative = Belastung
  counterparty: string | null;
  reference: string | null;
}

export interface ParseResult {
  rows: ParsedBankRow[];
  /** 1-based line numbers that could not be parsed (skipped). */
  skippedLines: number[];
}

/** Parse a German monetary string into integer Cent. Returns null if invalid. */
export function parseGermanAmount(input: string): number | null {
  let s = input.trim().replace(/\s/g, "").replace(/eur|€/gi, "");
  if (s === "") return null;
  // Normalise German "1.234,56" -> "1234.56"; tolerate plain "1234.56".
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** Parse a date in dd.mm.yyyy, dd.mm.yy or ISO yyyy-mm-dd into a UTC Date. */
export function parseBankDate(input: string): Date | null {
  const s = input.trim();
  if (s === "") return null;
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(s);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return new Date(Date.UTC(year, month - 1, day));
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return null;
}

/** Split a single CSV line into fields, honouring double-quoted values. */
function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out.map((f) => f.trim());
}

const HEADER_ALIASES = {
  bookingDate: ["buchungstag", "buchung", "datum", "bookingdate", "date"],
  valueDate: ["wertstellung", "valuta", "valuedate", "wert"],
  amount: ["betrag", "umsatz", "amount", "betrag (eur)", "betrag eur"],
  counterparty: [
    "beguenstigter/zahlungspflichtiger",
    "begünstigter/zahlungspflichtiger",
    "name",
    "auftraggeber/empfänger",
    "auftraggeber / empfänger",
    "zahlungsbeteiligter",
    "empfänger",
    "counterparty",
  ],
  reference: [
    "verwendungszweck",
    "buchungstext",
    "vwz",
    "reference",
    "purpose",
    "verwendungszweck1",
  ],
} as const;

function findColumn(headers: string[], aliases: readonly string[]): number {
  const lower = headers.map((h) => h.toLowerCase());
  for (const alias of aliases) {
    const idx = lower.indexOf(alias);
    if (idx >= 0) return idx;
  }
  // Fallback: substring contains.
  for (let i = 0; i < lower.length; i++) {
    if (aliases.some((a) => lower[i]!.includes(a))) return i;
  }
  return -1;
}

/**
 * Parse a CSV bank statement. The first non-empty line is the header; columns
 * are matched by name. Rows missing a parseable date or amount are skipped and
 * reported via `skippedLines`.
 */
export function parseBankCsv(content: string): ParseResult {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l)
    .filter((_, i, arr) => !(i === arr.length - 1 && arr[i] === ""));
  const nonEmpty = lines.filter((l) => l.trim() !== "");
  if (nonEmpty.length < 2) return { rows: [], skippedLines: [] };

  const headerLine = nonEmpty[0]!;
  const delimiter = (headerLine.match(/;/g)?.length ?? 0) >= (headerLine.match(/,/g)?.length ?? 0)
    ? ";"
    : ",";
  const headers = splitCsvLine(headerLine, delimiter);

  const col = {
    bookingDate: findColumn(headers, HEADER_ALIASES.bookingDate),
    valueDate: findColumn(headers, HEADER_ALIASES.valueDate),
    amount: findColumn(headers, HEADER_ALIASES.amount),
    counterparty: findColumn(headers, HEADER_ALIASES.counterparty),
    reference: findColumn(headers, HEADER_ALIASES.reference),
  };

  const rows: ParsedBankRow[] = [];
  const skippedLines: number[] = [];

  for (let i = 1; i < nonEmpty.length; i++) {
    const fields = splitCsvLine(nonEmpty[i]!, delimiter);
    const get = (idx: number) => (idx >= 0 ? (fields[idx] ?? "") : "");

    const bookingDate = parseBankDate(get(col.bookingDate));
    const amountCents = parseGermanAmount(get(col.amount));
    if (!bookingDate || amountCents === null) {
      skippedLines.push(i + 1);
      continue;
    }
    rows.push({
      bookingDate,
      valueDate: parseBankDate(get(col.valueDate)),
      amountCents,
      counterparty: get(col.counterparty) || null,
      reference: get(col.reference) || null,
    });
  }

  return { rows, skippedLines };
}
