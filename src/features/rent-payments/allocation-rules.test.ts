import { describe, expect, it } from "vitest";

import {
  checkExplicitAllocations,
  openAmount,
  planFifoAllocation,
  type OpenReceivable,
} from "./allocation-rules";

const r = (
  id: string,
  dueDay: number,
  targetCents: number,
  paidCents = 0,
): OpenReceivable => ({
  id,
  dueDate: new Date(Date.UTC(2025, 5, dueDay)),
  targetCents,
  paidCents,
});

describe("planFifoAllocation", () => {
  it("Teilzahlung: partial allocation to the oldest item, no credit", () => {
    const plan = planFifoAllocation(40_000, [r("a", 3, 100_000)]);
    expect(plan.allocations).toEqual([{ rentPaymentId: "a", amountCents: 40_000 }]);
    expect(plan.creditCents).toBe(0);
  });

  it("Vollzahlung: covers a receivable exactly", () => {
    const plan = planFifoAllocation(100_000, [r("a", 3, 100_000)]);
    expect(plan.allocations).toEqual([{ rentPaymentId: "a", amountCents: 100_000 }]);
    expect(plan.creditCents).toBe(0);
  });

  it("Überzahlung: fills all open items, remainder becomes Guthaben", () => {
    const plan = planFifoAllocation(250_000, [r("a", 3, 100_000), r("b", 35, 100_000)]);
    expect(plan.allocations).toEqual([
      { rentPaymentId: "a", amountCents: 100_000 },
      { rentPaymentId: "b", amountCents: 100_000 },
    ]);
    expect(plan.creditCents).toBe(50_000);
  });

  it("applies oldest-first regardless of input order and skips paid items", () => {
    const plan = planFifoAllocation(120_000, [
      r("new", 35, 100_000),
      r("paid", 3, 100_000, 100_000),
      r("old", 4, 100_000, 20_000),
    ]);
    // "old" (4 June, 80k open) first, then "new" (35 -> July).
    expect(plan.allocations).toEqual([
      { rentPaymentId: "old", amountCents: 80_000 },
      { rentPaymentId: "new", amountCents: 40_000 },
    ]);
    expect(plan.creditCents).toBe(0);
  });

  it("entire amount is credit when nothing is open", () => {
    const plan = planFifoAllocation(50_000, [r("paid", 3, 100_000, 100_000)]);
    expect(plan.allocations).toEqual([]);
    expect(plan.creditCents).toBe(50_000);
  });
});

describe("openAmount", () => {
  it("never goes negative on overpaid rows", () => {
    expect(openAmount({ targetCents: 100, paidCents: 150 })).toBe(0);
    expect(openAmount({ targetCents: 100, paidCents: 30 })).toBe(70);
  });
});

describe("checkExplicitAllocations", () => {
  const open = new Map([
    ["a", 100_000],
    ["b", 50_000],
  ]);

  it("accepts valid allocations and reports credit", () => {
    const res = checkExplicitAllocations(
      200_000,
      [
        { rentPaymentId: "a", amountCents: 100_000 },
        { rentPaymentId: "b", amountCents: 50_000 },
      ],
      open,
    );
    expect(res.ok).toBe(true);
    expect(res.creditCents).toBe(50_000);
  });

  it("rejects allocation exceeding the open amount", () => {
    const res = checkExplicitAllocations(
      200_000,
      [{ rentPaymentId: "a", amountCents: 120_000 }],
      open,
    );
    expect(res).toMatchObject({ ok: false, error: "EXCEEDS_OPEN" });
  });

  it("rejects allocations exceeding the payment total", () => {
    const res = checkExplicitAllocations(
      100_000,
      [
        { rentPaymentId: "a", amountCents: 100_000 },
        { rentPaymentId: "b", amountCents: 50_000 },
      ],
      open,
    );
    expect(res).toMatchObject({ ok: false, error: "EXCEEDS_PAYMENT" });
  });

  it("rejects unknown receivables and non-positive amounts", () => {
    expect(
      checkExplicitAllocations(
        100_000,
        [{ rentPaymentId: "x", amountCents: 1000 }],
        open,
      ),
    ).toMatchObject({ ok: false, error: "UNKNOWN_RECEIVABLE" });
    expect(
      checkExplicitAllocations(
        100_000,
        [{ rentPaymentId: "a", amountCents: 0 }],
        open,
      ),
    ).toMatchObject({ ok: false, error: "NON_POSITIVE" });
  });
});
