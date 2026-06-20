import { describe, expect, it } from "vitest";

import {
  computeInterestCents,
  daysBetween,
  nextDunningLevel,
  renderDunningLetter,
  type DunningConfig,
} from "./dunning-rules";

const config: DunningConfig = {
  toleranceDays: 3,
  levels: [
    { level: "REMINDER", minDaysOverdue: 7, feeCents: 0 },
    { level: "FIRST", minDaysOverdue: 14, feeCents: 500 },
    { level: "SECOND", minDaysOverdue: 30, feeCents: 1000 },
  ],
  interestEnabled: false,
  baseRatePercent: 0,
  interestMarginPercent: 5,
  feesEnabled: false,
};

describe("nextDunningLevel", () => {
  it("issues the lowest un-issued level whose threshold is met (monotone)", () => {
    expect(nextDunningLevel({ daysOverdue: 5, issuedLevels: [], config })).toBeNull();
    expect(
      nextDunningLevel({ daysOverdue: 40, issuedLevels: [], config })?.level,
    ).toBe("REMINDER");
    expect(
      nextDunningLevel({ daysOverdue: 40, issuedLevels: ["REMINDER"], config })?.level,
    ).toBe("FIRST");
    expect(
      nextDunningLevel({
        daysOverdue: 40,
        issuedLevels: ["REMINDER", "FIRST"],
        config,
      })?.level,
    ).toBe("SECOND");
    expect(
      nextDunningLevel({
        daysOverdue: 40,
        issuedLevels: ["REMINDER", "FIRST", "SECOND"],
        config,
      }),
    ).toBeNull();
  });

  it("does not advance past a threshold that is not yet met", () => {
    expect(
      nextDunningLevel({ daysOverdue: 14, issuedLevels: ["REMINDER"], config })?.level,
    ).toBe("FIRST");
    expect(
      nextDunningLevel({ daysOverdue: 13, issuedLevels: ["REMINDER"], config }),
    ).toBeNull();
  });
});

describe("computeInterestCents", () => {
  it("is zero when interest is disabled", () => {
    expect(
      computeInterestCents({
        principalCents: 100_000,
        config,
        dueDate: new Date(Date.UTC(2025, 0, 1)),
        asOf: new Date(Date.UTC(2025, 11, 31)),
      }),
    ).toBe(0);
  });

  it("computes taggenau (actual/365) on the principal when enabled", () => {
    const enabled: DunningConfig = {
      ...config,
      interestEnabled: true,
      baseRatePercent: 1.27, // example Basiszinssatz; configurable per org
      interestMarginPercent: 5,
    };
    // 100.000 ct * 6.27% * 365/365 = 6.270 ct.
    expect(
      computeInterestCents({
        principalCents: 100_000,
        config: enabled,
        dueDate: new Date(Date.UTC(2025, 0, 1)),
        asOf: new Date(Date.UTC(2026, 0, 1)),
      }),
    ).toBe(6_270);
  });
});

describe("daysBetween", () => {
  it("never goes negative", () => {
    expect(daysBetween(new Date(Date.UTC(2025, 0, 10)), new Date(Date.UTC(2025, 0, 1)))).toBe(0);
    expect(daysBetween(new Date(Date.UTC(2025, 0, 1)), new Date(Date.UTC(2025, 0, 11)))).toBe(10);
  });
});

describe("renderDunningLetter", () => {
  it("includes the level, period and the total of open + interest + fee", () => {
    const letter = renderDunningLetter({
      level: "FIRST",
      tenantNames: ["Erika Musterfrau"],
      periodLabel: "Juni 2025",
      dueDate: new Date(Date.UTC(2025, 5, 3)),
      openCents: 100_000,
      feeCents: 500,
      interestCents: 250,
    });
    expect(letter.subject).toContain("1. Mahnung");
    expect(letter.body).toContain("Juni 2025");
    expect(letter.body).toContain("Erika Musterfrau");
    expect(letter.body).toContain("1.007,50"); // total 100.750 ct (open + interest + fee)
  });
});
