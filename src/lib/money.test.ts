import { describe, expect, it } from "vitest";

import {
  centsToEuros,
  distributeCents,
  eurosToCents,
  formatCents,
  sumCents,
} from "./money";

describe("money", () => {
  it("converts euros to integer cents without float drift", () => {
    expect(eurosToCents(19.99)).toBe(1999);
    expect(eurosToCents(0.1 + 0.2)).toBe(30); // would be 30.000...4 as float
  });

  it("converts cents back to euros", () => {
    expect(centsToEuros(1999)).toBeCloseTo(19.99);
  });

  it("formats cents as a German EUR string", () => {
    // Non-breaking space before the currency symbol.
    expect(formatCents(123456).replace(/ /g, " ")).toBe("1.234,56 €");
  });

  it("sums cent amounts as integers", () => {
    expect(sumCents([84_000, 31_000, 47_500])).toBe(162_500);
  });

  describe("distributeCents", () => {
    it("distributes proportionally and conserves every cent", () => {
      const parts = distributeCents(10_000, [72, 58]);
      expect(sumCents(parts)).toBe(10_000);
      expect(parts).toEqual([5538, 4462]);
    });

    it("hands leftover cents to the largest remainders", () => {
      // 100 cents split three equal ways = 33.33 each -> 34,33,33.
      const parts = distributeCents(100, [1, 1, 1]);
      expect(sumCents(parts)).toBe(100);
      expect(parts.filter((p) => p === 34)).toHaveLength(1);
    });

    it("throws when weights sum to zero", () => {
      expect(() => distributeCents(100, [0, 0])).toThrow();
    });
  });
});
