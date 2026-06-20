/**
 * Money helpers. Mietwerk stores and computes all monetary values as integer
 * Cent (never as Float). These helpers centralise conversion, formatting and
 * safe arithmetic so no slice does ad-hoc float math on currency.
 */

/** Cent amount, always an integer. Use this alias for clarity at boundaries. */
export type Cents = number;

const EUR_FORMATTER = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

/** Convert a Euro amount (e.g. from user input) to integer Cent. */
export function eurosToCents(euros: number): Cents {
  return Math.round(euros * 100);
}

/**
 * Parse a Euro string from a form field into integer Cent. Accepts German
 * ("1234,56") and plain ("1234.56") decimals. Returns `null` for empty input
 * and `undefined` for unparseable input (so callers can flag a validation error).
 */
export function parseEuroInput(input: string): Cents | null | undefined {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return undefined;
  return eurosToCents(value);
}

/** Render integer Cent as a plain Euro string for a form input, e.g. "780.00". */
export function centsToEuroInput(cents: Cents | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}

/** Convert integer Cent to a Euro number (for display math only). */
export function centsToEuros(cents: Cents): number {
  return cents / 100;
}

/** Format integer Cent as a localized EUR string, e.g. 123456 -> "1.234,56 €". */
export function formatCents(cents: Cents): string {
  return EUR_FORMATTER.format(cents / 100);
}

/** Sum a list of Cent amounts. Returns an integer. */
export function sumCents(values: Cents[]): Cents {
  return values.reduce((acc, v) => acc + v, 0);
}

/**
 * Distribute a total Cent amount across `parts` weights without losing or
 * inventing Cent (largest-remainder method). The returned array sums exactly
 * to `total`. Used by the Betriebskostenabrechnung allocation logic.
 */
export function distributeCents(total: Cents, weights: number[]): Cents[] {
  const weightSum = weights.reduce((acc, w) => acc + w, 0);
  if (weightSum <= 0) {
    throw new Error("distributeCents: sum of weights must be > 0");
  }

  const exact = weights.map((w) => (total * w) / weightSum);
  const floored = exact.map((v) => Math.floor(v));
  let remainder = total - floored.reduce((acc, v) => acc + v, 0);

  // Hand out the leftover Cent to the largest fractional remainders first.
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floored];
  for (const { i } of order) {
    if (remainder <= 0) break;
    result[i] = (result[i] ?? 0) + 1;
    remainder -= 1;
  }

  return result;
}
