import { describe, expect, it } from "vitest";

import {
  isValidLeasePeriod,
  leaseBlocksParentDeletion,
  leasePeriodsOverlap,
  leaseStatus,
} from "./lease-rules";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const now = d("2025-06-01");

describe("leaseStatus", () => {
  it("is future when it starts after now", () => {
    expect(leaseStatus({ startDate: d("2025-07-01"), endDate: null }, now)).toBe(
      "future",
    );
  });

  it("is active when started and open-ended", () => {
    expect(leaseStatus({ startDate: d("2025-01-01"), endDate: null }, now)).toBe(
      "active",
    );
  });

  it("is active when within a fixed term", () => {
    expect(
      leaseStatus({ startDate: d("2025-01-01"), endDate: d("2025-12-01") }, now),
    ).toBe("active");
  });

  it("is ended when its end date is in the past", () => {
    expect(
      leaseStatus({ startDate: d("2024-01-01"), endDate: d("2024-12-31") }, now),
    ).toBe("ended");
  });
});

describe("isValidLeasePeriod", () => {
  it("accepts open-ended leases", () => {
    expect(isValidLeasePeriod({ startDate: d("2025-01-01"), endDate: null })).toBe(
      true,
    );
  });
  it("accepts end on/after start", () => {
    expect(
      isValidLeasePeriod({ startDate: d("2025-01-01"), endDate: d("2025-01-01") }),
    ).toBe(true);
  });
  it("rejects end before start", () => {
    expect(
      isValidLeasePeriod({ startDate: d("2025-02-01"), endDate: d("2025-01-01") }),
    ).toBe(false);
  });
});

describe("leasePeriodsOverlap", () => {
  it("detects overlapping fixed terms", () => {
    expect(
      leasePeriodsOverlap(
        { startDate: d("2024-01-01"), endDate: d("2024-12-31") },
        { startDate: d("2024-06-01"), endDate: d("2025-06-01") },
      ),
    ).toBe(true);
  });

  it("treats a gap as no overlap", () => {
    expect(
      leasePeriodsOverlap(
        { startDate: d("2024-01-01"), endDate: d("2024-06-30") },
        { startDate: d("2024-07-01"), endDate: null },
      ),
    ).toBe(false);
  });

  it("treats touching boundaries as overlap (conservative for one unit)", () => {
    expect(
      leasePeriodsOverlap(
        { startDate: d("2024-01-01"), endDate: d("2024-06-01") },
        { startDate: d("2024-06-01"), endDate: null },
      ),
    ).toBe(true);
  });

  it("detects overlap of two open-ended leases", () => {
    expect(
      leasePeriodsOverlap(
        { startDate: d("2024-01-01"), endDate: null },
        { startDate: d("2025-01-01"), endDate: null },
      ),
    ).toBe(true);
  });
});

describe("leaseBlocksParentDeletion", () => {
  it("blocks for active and future leases", () => {
    expect(
      leaseBlocksParentDeletion({ startDate: d("2025-01-01"), endDate: null }, now),
    ).toBe(true);
    expect(
      leaseBlocksParentDeletion({ startDate: d("2025-07-01"), endDate: null }, now),
    ).toBe(true);
  });
  it("does not block for ended leases", () => {
    expect(
      leaseBlocksParentDeletion(
        { startDate: d("2024-01-01"), endDate: d("2024-12-31") },
        now,
      ),
    ).toBe(false);
  });
});
