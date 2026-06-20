import { z } from "zod";

import { DunningLevel } from "../../../generated/prisma";

/** Integer-Cent, non-negative. */
const cents = z.number().int().nonnegative();
/** Strictly positive integer Cent (payments must be > 0). */
const positiveCents = z.number().int().positive();

export const idInput = z.object({ id: z.string().cuid() });
export const leaseIdInput = z.object({ leaseId: z.string().cuid() });

// ── 2.1 Sollstellung ─────────────────────────────────────────────────────────
export const generateChargesSchema = z.object({
  periodYear: z.number().int().min(2000).max(2100),
  periodMonth: z.number().int().min(1).max(12),
  /** Optional: restrict generation to a single lease (testing / corrections). */
  leaseId: z.string().cuid().optional(),
});
export type GenerateChargesInput = z.infer<typeof generateChargesSchema>;

// ── 2.2 Zahlungen & Abgleich ─────────────────────────────────────────────────
/** A single allocation of part of a payment to one receivable. */
const allocationInput = z.object({
  rentPaymentId: z.string().cuid(),
  amountCents: positiveCents,
});

export const recordPaymentSchema = z.object({
  leaseId: z.string().cuid(),
  amountCents: positiveCents,
  valueDate: z.date(),
  counterparty: z.string().max(200).optional(),
  reference: z.string().max(500).optional(),
  note: z.string().max(1000).optional(),
  /**
   * Explicit allocations. When omitted, the payment is auto-applied to the
   * lease's oldest open receivables (FIFO). The sum of allocations must not
   * exceed `amountCents`; any remainder becomes Guthaben.
   */
  allocations: z.array(allocationInput).optional(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const listOpenItemsSchema = z
  .object({
    leaseId: z.string().cuid().optional(),
    onlyOverdue: z.boolean().optional(),
  })
  .optional();
export type ListOpenItemsInput = z.infer<typeof listOpenItemsSchema>;

// ── 2.3 Kontoumsatz-Import ────────────────────────────────────────────────────
export const importBankStatementSchema = z.object({
  fileName: z.string().min(1).max(255),
  content: z.string().min(1).max(2_000_000), // raw CSV text (<= ~2 MB)
});
export type ImportBankStatementInput = z.infer<typeof importBankStatementSchema>;

export const confirmTransactionsSchema = z.object({
  items: z
    .array(
      z.object({
        bankTransactionId: z.string().cuid(),
        leaseId: z.string().cuid(),
      }),
    )
    .min(1),
});
export type ConfirmTransactionsInput = z.infer<typeof confirmTransactionsSchema>;

// ── 2.4 Mahnwesen (konfigurierbar) ────────────────────────────────────────────
export const updateDunningPolicySchema = z.object({
  toleranceDays: z.number().int().min(0).max(90),
  interestEnabled: z.boolean(),
  /** Basiszinssatz (§ 247 BGB) — kann historisch negativ sein. */
  baseRatePercent: z.number().min(-10).max(20),
  /** Aufschlag in Prozentpunkten (§ 288 Abs. 1 BGB: 5 für Verbraucher). */
  interestMarginPercent: z.number().min(0).max(20),
  feesEnabled: z.boolean(),
  levels: z
    .array(
      z.object({
        level: z.nativeEnum(DunningLevel),
        minDaysOverdue: z.number().int().min(0).max(365),
        feeCents: cents,
      }),
    )
    .min(1)
    .max(4),
});
export type UpdateDunningPolicyInput = z.infer<typeof updateDunningPolicySchema>;

export const runDunningSchema = z
  .object({ now: z.date().optional() })
  .optional();

export { cents, positiveCents };
