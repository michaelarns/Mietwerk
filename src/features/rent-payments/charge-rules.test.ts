import { describe, expect, it } from "vitest";

import {
  computeCharge,
  daysInMonth,
  daysOverdue,
  defaultDueDate,
  derivePaymentProgress,
  isOverdue,
  nthBusinessDay,
  type LeaseChargeInput,
} from "./charge-rules";

const lease = (over: Partial<LeaseChargeInput> = {}): LeaseChargeInput => ({
  startDate: new Date(Date.UTC(2024, 0, 1)),
  endDate: null,
  baseRentCents: 80_000,
  operatingCostAdvanceCents: 20_000,
  ...over,
});

describe("daysInMonth", () => {
  it("handles 30/31 day months and February (leap/non-leap)", () => {
    expect(daysInMonth(2025, 1)).toBe(31);
    expect(daysInMonth(2025, 4)).toBe(30);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
  });
});

describe("computeCharge — full month", () => {
  it("charges the full sum when the lease covers the whole month", () => {
    const r = computeCharge(lease(), 2025, 6);
    expect(r).not.toBeNull();
    expect(r!.fullMonth).toBe(true);
    expect(r!.targetCents).toBe(100_000);
    expect(r!.activeDays).toBe(30);
  });

  it("returns null when the lease is not active in the month", () => {
    expect(
      computeCharge(lease({ startDate: new Date(Date.UTC(2025, 7, 1)) }), 2025, 6),
    ).toBeNull();
    expect(
      computeCharge(
        lease({ endDate: new Date(Date.UTC(2025, 4, 31)) }),
        2025,
        6,
      ),
    ).toBeNull();
  });
});

describe("computeCharge — tagesgenaue Proration (actual/actual)", () => {
  it("prorates a partial first month by active days", () => {
    // Start 16 June -> 15 active days of 30. 100.000 * 15/30 = 50.000.
    const r = computeCharge(
      lease({ startDate: new Date(Date.UTC(2025, 5, 16)) }),
      2025,
      6,
    );
    expect(r!.fullMonth).toBe(false);
    expect(r!.activeDays).toBe(15);
    expect(r!.targetCents).toBe(50_000);
  });

  it("prorates a partial last month inclusively (end date counts)", () => {
    // End 10 June -> days 1..10 = 10 active days of 30. 100.000 * 10/30 = 33.333.
    const r = computeCharge(
      lease({ endDate: new Date(Date.UTC(2025, 5, 10)) }),
      2025,
      6,
    );
    expect(r!.activeDays).toBe(10);
    expect(r!.targetCents).toBe(33_333); // rounded to the Cent
  });

  it("prorates a lease that starts and ends within one month", () => {
    const r = computeCharge(
      lease({
        startDate: new Date(Date.UTC(2025, 5, 10)),
        endDate: new Date(Date.UTC(2025, 5, 19)),
      }),
      2025,
      6,
    );
    expect(r!.activeDays).toBe(10);
    expect(r!.targetCents).toBe(33_333);
  });
});

describe("nthBusinessDay / defaultDueDate", () => {
  it("finds the 3rd business day skipping weekends", () => {
    // June 2025: 1=Sun,2=Mon,3=Tue,4=Wed -> 3rd business day = 4 June.
    expect(nthBusinessDay(2025, 6, 3).getUTCDate()).toBe(4);
    // March 2025: 1=Sat,2=Sun,3=Mon,4=Tue,5=Wed -> 3rd business day = 5 March.
    expect(defaultDueDate(2025, 3).getUTCDate()).toBe(5);
  });
});

describe("derivePaymentProgress", () => {
  it("maps amounts to OPEN/PARTIAL/PAID and honours WAIVED", () => {
    expect(derivePaymentProgress({ targetCents: 1000, paidCents: 0 })).toBe("OPEN");
    expect(derivePaymentProgress({ targetCents: 1000, paidCents: 400 })).toBe(
      "PARTIAL",
    );
    expect(derivePaymentProgress({ targetCents: 1000, paidCents: 1000 })).toBe(
      "PAID",
    );
    expect(derivePaymentProgress({ targetCents: 1000, paidCents: 1500 })).toBe(
      "PAID",
    );
    expect(
      derivePaymentProgress({ targetCents: 1000, paidCents: 0, waived: true }),
    ).toBe("WAIVED");
  });
});

describe("isOverdue / daysOverdue", () => {
  const due = new Date(Date.UTC(2025, 5, 3));
  it("counts whole days past due", () => {
    expect(daysOverdue(due, new Date(Date.UTC(2025, 5, 3)))).toBe(0);
    expect(daysOverdue(due, new Date(Date.UTC(2025, 5, 10)))).toBe(7);
  });

  it("is overdue only past due + tolerance and only while money is owed", () => {
    const within = new Date(Date.UTC(2025, 5, 6)); // 3 days, tolerance 3 -> not yet
    const past = new Date(Date.UTC(2025, 5, 7)); // 4 days > 3
    expect(
      isOverdue({ dueDate: due, now: within, toleranceDays: 3, remainingCents: 1000 }),
    ).toBe(false);
    expect(
      isOverdue({ dueDate: due, now: past, toleranceDays: 3, remainingCents: 1000 }),
    ).toBe(true);
    // Fully paid items are never overdue.
    expect(
      isOverdue({ dueDate: due, now: past, toleranceDays: 3, remainingCents: 0 }),
    ).toBe(false);
  });
});
