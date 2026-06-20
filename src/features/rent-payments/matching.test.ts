import { describe, expect, it } from "vitest";

import { scoreCandidate, suggestLease, type MatchCandidate } from "./matching";

const leaseA: MatchCandidate = {
  leaseId: "lease-a",
  tenantNames: ["Mieter", "Eins"],
  expectedCents: [98_000],
};
const leaseB: MatchCandidate = {
  leaseId: "lease-b",
  tenantNames: ["Mieter", "Zwei"],
  expectedCents: [79_000],
};

describe("scoreCandidate", () => {
  it("rewards a name hit and an exact amount", () => {
    const score = scoreCandidate(
      { amountCents: 98_000, counterparty: "Mieter Eins", reference: "Miete" },
      leaseA,
    );
    expect(score).toBe(4); // +2 name, +2 exact amount
  });

  it("gives a near-amount only a partial score", () => {
    const score = scoreCandidate(
      { amountCents: 98_500, counterparty: "Unbekannt", reference: "" },
      leaseA,
    );
    expect(score).toBe(1); // within 1 %
  });

  it("ignores debits (negative amounts)", () => {
    expect(
      scoreCandidate(
        { amountCents: -98_000, counterparty: "Mieter Eins", reference: "" },
        leaseA,
      ),
    ).toBe(0);
  });
});

describe("suggestLease", () => {
  it("picks the strongest candidate above the threshold", () => {
    const s = suggestLease(
      { amountCents: 98_000, counterparty: "M. Eins", reference: "Miete Juni" },
      [leaseA, leaseB],
    );
    expect(s).toMatchObject({ leaseId: "lease-a" });
  });

  it("returns null when no candidate is convincing", () => {
    const s = suggestLease(
      { amountCents: 12_300, counterparty: "Fremde GmbH", reference: "Rechnung" },
      [leaseA, leaseB],
    );
    expect(s).toBeNull();
  });
});
