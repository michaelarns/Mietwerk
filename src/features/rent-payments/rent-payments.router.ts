import {
  createTRPCRouter,
  orgProcedure,
  orgWriteProcedure,
} from "~/server/api/trpc";
import {
  generateChargesSchema,
  leaseIdInput,
} from "./rent-payments.schema";
import {
  generateRentChargesForOrg,
  listRentPaymentsForLease,
} from "./charge.service";

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
});
