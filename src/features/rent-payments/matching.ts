/**
 * Pure suggestion logic for matching an imported bank line to a lease.
 * No Prisma, no IO — the service supplies candidates and persists the result.
 *
 * Heuristic over amount + counterparty/reference text. Conservative: only
 * suggests when the evidence is strong enough (score >= MIN_SCORE), the import
 * UI always lets the user confirm or override before booking.
 */

export interface MatchCandidate {
  leaseId: string;
  /** Tenant names (first/last) for this lease. */
  tenantNames: string[];
  /** Amounts worth matching: open receivable totals + the monthly Soll. */
  expectedCents: number[];
}

export interface MatchInput {
  amountCents: number;
  counterparty: string | null;
  reference: string | null;
}

export interface MatchSuggestion {
  leaseId: string;
  score: number;
}

const MIN_SCORE = 2;

function tokens(names: string[]): string[] {
  return names
    .flatMap((n) => n.split(/\s+/))
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length >= 3);
}

/**
 * Score a single candidate against the transaction.
 * - name token found in counterparty/reference: +2
 * - amount equals an expected amount exactly: +2
 * - amount within 1 % (min 1 €) of an expected amount: +1
 */
export function scoreCandidate(tx: MatchInput, candidate: MatchCandidate): number {
  if (tx.amountCents <= 0) return 0; // only incoming credits are payments
  const haystack = `${tx.counterparty ?? ""} ${tx.reference ?? ""}`.toLowerCase();

  let score = 0;
  if (tokens(candidate.tenantNames).some((t) => haystack.includes(t))) score += 2;

  const exact = candidate.expectedCents.some((c) => c === tx.amountCents);
  if (exact) {
    score += 2;
  } else {
    const near = candidate.expectedCents.some((c) => {
      const tol = Math.max(100, Math.round(c * 0.01));
      return Math.abs(c - tx.amountCents) <= tol;
    });
    if (near) score += 1;
  }
  return score;
}

/** Best matching lease for a transaction, or null when evidence is too weak. */
export function suggestLease(
  tx: MatchInput,
  candidates: MatchCandidate[],
): MatchSuggestion | null {
  let best: MatchSuggestion | null = null;
  for (const candidate of candidates) {
    const score = scoreCandidate(tx, candidate);
    if (score >= MIN_SCORE && (!best || score > best.score)) {
      best = { leaseId: candidate.leaseId, score };
    }
  }
  return best;
}
