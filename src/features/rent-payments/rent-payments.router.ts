import {
  createTRPCRouter,
  orgProcedure,
  orgWriteProcedure,
} from "~/server/api/trpc";
import {
  confirmTransactionsSchema,
  generateChargesSchema,
  idInput,
  importBankStatementSchema,
  leaseIdInput,
  recordPaymentSchema,
} from "./rent-payments.schema";
import {
  generateRentChargesForOrg,
  listRentPaymentsForLease,
} from "./charge.service";
import {
  getLeaseCreditCents,
  listPaymentsForLease,
  recordPayment,
} from "./payment.service";
import {
  confirmBankTransactions,
  ignoreBankTransaction,
  importBankStatement,
  listPendingTransactions,
} from "./bank-import.service";

/**
 * `rent-payments` slice router. All reads via `orgProcedure`, all mutations via
 * `orgWriteProcedure` — the tenancy chokepoint scopes every call by
 * `ctx.organizationId`.
 */
export const rentPaymentRouter = createTRPCRouter({
  // ── 2.1 Sollstellung ──
  /** Manually trigger the monthly Sollstellung for the active organization. */
  generateCharges: orgWriteProcedure
    .input(generateChargesSchema)
    .mutation(({ ctx, input }) =>
      generateRentChargesForOrg(ctx.db, ctx.organizationId, input, {
        userId: ctx.session.user.id,
      }),
    ),

  listForLease: orgProcedure
    .input(leaseIdInput)
    .query(({ ctx, input }) =>
      listRentPaymentsForLease(ctx.db, ctx.organizationId, input.leaseId),
    ),

  // ── 2.2 Zahlungen & Abgleich ──
  recordPayment: orgWriteProcedure
    .input(recordPaymentSchema)
    .mutation(({ ctx, input }) =>
      recordPayment(ctx.db, ctx.organizationId, input, {
        userId: ctx.session.user.id,
      }),
    ),

  paymentsForLease: orgProcedure
    .input(leaseIdInput)
    .query(({ ctx, input }) =>
      listPaymentsForLease(ctx.db, ctx.organizationId, input.leaseId),
    ),

  leaseCredit: orgProcedure
    .input(leaseIdInput)
    .query(({ ctx, input }) =>
      getLeaseCreditCents(ctx.db, ctx.organizationId, input.leaseId),
    ),

  // ── 2.3 Kontoumsatz-Import ──
  importBankStatement: orgWriteProcedure
    .input(importBankStatementSchema)
    .mutation(({ ctx, input }) =>
      importBankStatement(ctx.db, ctx.organizationId, input, {
        userId: ctx.session.user.id,
      }),
    ),

  pendingTransactions: orgProcedure.query(({ ctx }) =>
    listPendingTransactions(ctx.db, ctx.organizationId),
  ),

  confirmTransactions: orgWriteProcedure
    .input(confirmTransactionsSchema)
    .mutation(({ ctx, input }) =>
      confirmBankTransactions(ctx.db, ctx.organizationId, input.items, {
        userId: ctx.session.user.id,
      }),
    ),

  ignoreTransaction: orgWriteProcedure
    .input(idInput)
    .mutation(({ ctx, input }) =>
      ignoreBankTransaction(ctx.db, ctx.organizationId, input.id),
    ),
});
